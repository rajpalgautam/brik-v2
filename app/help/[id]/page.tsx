import Link from "next/link";
import { notFound } from "next/navigation";
import { session } from "@/lib/db";
import Nav from "@/app/nav";
import Submit from "@/app/button";
import InviteForm from "@/app/team/invite-form";
import { replyHelp, resolveHelp } from "@/app/team/actions";
import type { Person } from "@/app/team/panel";
export default async function Thread({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; page?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) notFound();
  const { client, user } = await session(),
    q = await searchParams,
    page = Math.max(0, Math.min(100000, Math.floor(Number(q.page) || 0)));
  const [request, replies, people, workspace] = await Promise.all([
    client
      .from("help_requests")
      .select("id,title,body,closed,author_id")
      .eq("id", id)
      .maybeSingle(),
    client
      .from("help_replies")
      .select("id,author_id,kind,body,resource_url")
      .eq("request_id", id)
      .order("created_at")
      .order("id")
      .range(page * 30, page * 30 + 30),
    client.rpc("thread_people", { thread: id }),
    client.rpc("help_workspace", { thread: id }),
  ]);
  if (request.error || replies.error || people.error || workspace.error)
    throw Error("Thread unavailable");
  if (!request.data) notFound();
  const p = workspace.data,
    roster = p ? await client.rpc("team_roster", { p }) : null;
  if (roster?.error) throw Error("Could not load team");
  const names = new Map<string, string>(
      people.data.map((x: Person) => [x.student, x.label]),
    ),
    owner = roster?.data.some(
      (x: Person) => x.student === user.id && x.team_role === "owner",
    ),
    h = request.data;
  return (
    <>
      <Nav />
      <Link href="/help">All help requests</Link>
      <section>
        <small>
          {h.closed ? "Resolved" : "Open"} · {names.get(h.author_id)}
        </small>
        <h1>{h.title}</h1>
        <p style={{ whiteSpace: "pre-wrap" }}>{h.body}</p>
        {p && !h.closed && (
          <form action={resolveHelp.bind(null, id)}>
            <Submit>Mark resolved</Submit>
          </form>
        )}
      </section>
      <p role="status">{q.message}</p>
      <h2>Replies</h2>
      {!replies.data.length && <p>No replies here yet.</p>}
      {replies.data.slice(0, 30).map((r) => (
        <article key={r.id}>
          <strong>{names.get(r.author_id)}</strong>
          <small>{r.kind}</small>
          <p>{r.body}</p>
          {r.resource_url && (
            <a href={r.resource_url} rel="noopener noreferrer nofollow">
              Open shared resource
            </a>
          )}
          {owner &&
            !roster?.data.some((x: Person) => x.student === r.author_id) && (
              <InviteForm project={p} reply={r.id} />
            )}
        </article>
      ))}
      <nav>
        {page > 0 && <Link href={"?page=" + (page - 1)}>Previous replies</Link>}
        {replies.data.length > 30 && (
          <Link href={"?page=" + (page + 1)}>More replies</Link>
        )}
      </nav>
      {!h.closed && (
        <section>
          <form action={replyHelp.bind(null, id)}>
            <label>
              Reply type
              <select name="kind">
                <option value="suggestion">Suggestion</option>
                <option value="resource">Resource</option>
                <option value="offer">Offer to collaborate</option>
              </select>
            </label>
            <label>
              Your reply
              <textarea name="body" required maxLength={2000} />
            </label>
            <label>
              Resource link (optional)
              <input
                name="url"
                type="url"
                placeholder="https://"
                maxLength={500}
              />
            </label>
            <Submit>Post reply</Submit>
          </form>
        </section>
      )}
    </>
  );
}
