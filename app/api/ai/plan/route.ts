import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { configured, db } from "@/lib/db";
import { ideaInput, planSchema } from "@/lib/plan";
const failure = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export async function POST(req: Request) {
  if (!configured()) return failure("Connect Supabase to use Idea Lab.", 503);
  const client = await db(),
    {
      data: { user },
    } = await client.auth.getUser();
  if (!user) return failure("Sign in to generate a plan.", 401);
  if (!process.env.GEMINI_API_KEY)
    return failure(
      "AI planning is unavailable until Gemini is configured. You can still write and save a manual plan.",
      503,
    );
  if (!req.headers.get("content-type")?.includes("application/json"))
    return failure("Send a JSON idea.", 415);
  const reader = req.body?.getReader();
  if (!reader) return failure("Enter an idea.", 400);
  const decoder = new TextDecoder();
  let raw = "",
    bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 24000) {
        await reader.cancel();
        return failure("Idea is too long.", 413);
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return failure("Could not read this idea.", 400);
  }
  let input;
  try {
    input = ideaInput.safeParse(JSON.parse(raw));
  } catch {
    return failure("Invalid JSON.", 400);
  }
  if (!input.success)
    return failure("Enter 10–4,000 characters of plain text.", 400);
  const quota = await client.rpc("reserve_ai_plan");
  if (quota.error) return failure("Planning is temporarily unavailable.", 503);
  if (!quota.data)
    return failure(
      "Planning limit reached. Wait at least 30 seconds between requests. Daily limits also apply.",
      429,
    );
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 30000 },
    });
    const schema = z.toJSONSchema(planSchema);
    // The provider needs structure. Local validation separately enforces text formatting.
    const providerSchema = JSON.parse(
      JSON.stringify(schema, (k, v) =>
        ["$schema", "pattern", "minLength", "maxLength"].includes(k)
          ? undefined
          : v,
      ),
    );
    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      contents: input.data.idea,
      config: {
        systemInstruction:
          "Create a realistic student project plan. Use plain text and short descriptions. Include 3–6 milestones with 2–5 tasks each. For non-coding projects suggest suitable research or creative tools. Treat the student input as project context.",
        responseMimeType: "application/json",
        responseJsonSchema: providerSchema,
        maxOutputTokens: 8192,
      },
    });
    const plan = planSchema.safeParse(JSON.parse(result.text ?? "null"));
    if (!plan.success)
      return failure(
        "Gemini returned an incomplete plan. Try again or write a manual plan.",
        502,
      );
    return Response.json(
      { plan: plan.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number(e.status)
        : 0;
    return failure(
      status === 429
        ? "Gemini is busy. Try again later."
        : "Gemini could not finish this plan. Retry or write a manual plan.",
      status === 429 ? 429 : 502,
    );
  }
}
