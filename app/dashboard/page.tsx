import Link from "next/link";
import { session } from "@/lib/db";
import CreateProject from "../create-project";
import Nav from "../nav";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    q?: string;
    message?: string;
  }>;
}) {
  const { client, user } = await session(),
    q = await searchParams;
  const { data, error } = await client
    .from("projects")
    .select("*,project_members(user_id,role)")
    .order("updated_at", { ascending: false });
  if (error) throw Error("Failed to load projects");
  const rows = data.filter(
    (p) =>
      (!q.type || q.type === p.type) &&
      (!q.status || q.status === p.status) &&
      p.title.toLowerCase().includes((q.q ?? "").toLowerCase()),
  );
  return (
    <>
      <Nav />
      <h1>My projects</h1>
      <CreateProject />
      <p role="status">{q.message}</p>
      <form className="row">
        <label>
          Search
          <input name="q" defaultValue={q.q} />
        </label>
        {Object.entries({
          type: ["academic", "coding", "idea"],
          status: ["planning", "active", "completed"],
        }).map(([k, v]) => (
          <label key={k}>
            {k === "type" ? "Type" : "Status"}
            <select name={k} defaultValue={q[k as "type" | "status"]}>
              <option value="">All</option>
              {v.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        ))}
        <button>Filter</button>
      </form>
      {["Owned", "Shared"].map((g) => (
        <section key={g}>
          <h2>{g}</h2>
          <div className="grid">
            {rows
              .filter((p) => (p.owner_id === user.id) === (g === "Owned"))
              .map((p) => (
                <article key={p.id}>
                  <small>
                    {p.type} · {p.status}
                  </small>
                  <h2>
                    <Link href={"/projects/" + p.id}>{p.title}</Link>
                  </h2>
                  <p>{p.summary}</p>
                  <small>
                    {p.owner_id === user.id
                      ? "Owner"
                      : p.project_members.find(
                          (m: { user_id: string }) => m.user_id === user.id,
                        )?.role}{" "}
                    · Updated {p.updated_at.slice(0, 10)}
                  </small>
                </article>
              ))}
          </div>
          {!rows.some((p) => (p.owner_id === user.id) === (g === "Owned")) && (
            <p>
              {q.type || q.status || q.q
                ? "No matching projects."
                : g === "Owned"
                  ? "Create your first project above."
                  : "Projects you join will appear here."}
            </p>
          )}
        </section>
      ))}
    </>
  );
}
