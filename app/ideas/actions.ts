"use server";
import { session } from "@/lib/db";
import { planSchema } from "@/lib/plan";

import { revalidatePath } from "next/cache";
import { z } from "zod";
export async function commit(
  mode: "save" | "create",
  ticket: string,
  draft: string | null,
  input: string,
  value: unknown,
): Promise<{ error?: string; id?: string; project?: string }> {
  const { client } = await session(),
    parsed = planSchema.safeParse(value);
  if (
    !parsed.success ||
    typeof input !== "string" ||
    input.length > 4000 ||
    !z.uuid().safeParse(ticket).success ||
    (draft && !z.uuid().safeParse(draft).success)
  )
    return { error: "Check your plan fields and try again." };
  if (mode === "create") {
    const { data, error } = await client.rpc("convert_idea", {
      ticket,
      plan: parsed.data,
      draft,
    });
    if (error || !data)
      return {
        error: "Could not create this project. Your edits are still here.",
      };
    return { project: data };
  }
  if (mode !== "save") return { error: "Unknown action." };
  const row = { input_text: input, plan_json: parsed.data },
    table = client.from("idea_plans");
  const result = await (
    draft ? table.update(row).eq("id", draft) : table.insert(row)
  )
    .select("id")
    .single();
  if (result.error)
    return { error: "Could not save your draft. Please try again." };
  revalidatePath("/ideas");
  return { id: result.data.id };
}
