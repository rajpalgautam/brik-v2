import Link from "next/link";
import Nav from "../nav";
import { session } from "@/lib/db";
import { planSchema } from "@/lib/plan";
import { notFound } from "next/navigation";
import { z } from "zod";
import Editor from "./editor";
export default async function Ideas({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { client } = await session(),
    { draft } = await searchParams;
  if (draft && !z.uuid().safeParse(draft).success) notFound();
  const [list, selected] = await Promise.all([
    client.from("idea_plans").select("id,title:plan_json->>title").order("id"),
    draft
      ? client
          .from("idea_plans")
          .select("input_text,plan_json")
          .eq("id", draft)
          .maybeSingle()
      : null,
  ]);
  if (list.error || selected?.error) throw Error("Drafts unavailable");
  const parsed = planSchema.safeParse(selected?.data?.plan_json);
  if (draft && !parsed.success) notFound();
  return (
    <>
      <Nav />
      <h1>Idea Lab</h1>
      <p>Turn a question or rough idea into a project you can work on.</p>
      {!!list.data?.length && (
        <details>
          <summary>My saved plans ({list.data.length})</summary>
          <Link href="/ideas">Start a new idea</Link>
          {list.data.map((d) => (
            <Link key={d.id} href={"/ideas?draft=" + d.id}>
              {d.title || "Saved idea"}
            </Link>
          ))}
        </details>
      )}
      <Editor
        key={draft ?? "new"}
        draft={draft ?? null}
        initial={parsed.success ? parsed.data : null}
        input={selected?.data?.input_text ?? ""}
        available={Boolean(process.env.GEMINI_API_KEY)}
      />
    </>
  );
}
