import Link from "next/link";
import { session } from "@/lib/db";
import Nav from "../nav";
export default async function Help({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { client } = await session(),
    page = Math.max(
      0,
      Math.min(100000, Math.floor(Number((await searchParams).page) || 0)),
    );
  const [threads, invites] = await Promise.all([
    client
      .from("help_requests")
      .select("id,title,closed,created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 25, page * 25 + 25),
    client.rpc("my_invitations"),
  ]);
  if (threads.error || invites.error) throw Error("Peer Help unavailable");
  return (
    <>
      <Nav />
      <h1>Peer Help</h1>
      <p>
        Help another student with a blocker, share a resource or offer to
        collaborate. To ask for help, open the Help tab in your project.
      </p>
      {invites.data?.length > 0 && (
        <section>
          <h2>Your team invitations</h2>
          {invites.data.map((i: { ticket: string; invite_role: string }) => (
            <Link key={i.ticket} href={"/invite/" + i.ticket}>
              Review {i.invite_role} invitation
            </Link>
          ))}
        </section>
      )}
      {threads.data.slice(0, 25).map((t) => (
        <article key={t.id}>
          <small>
            {t.closed ? "Resolved" : "Open"} · {t.created_at.slice(0, 10)}
          </small>
          <h2>
            <Link href={"/help/" + t.id}>{t.title}</Link>
          </h2>
        </article>
      ))}
      {!threads.data.length && <p>No requests here yet.</p>}
      <nav>
        {page > 0 && <Link href={"/help?page=" + (page - 1)}>Previous</Link>}
        {threads.data.length > 25 && (
          <Link href={"/help?page=" + (page + 1)}>Next</Link>
        )}
      </nav>
    </>
  );
}
