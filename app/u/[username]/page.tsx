import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { publicDb } from "@/lib/public-db";
export default async function Portfolio({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) notFound();
  const c = publicDb(),
    { data: p, error } = await c
      .from("public_profiles")
      .select(
        "user_id,username,display_name,bio,college,study_year,course,avatar_url,skills",
      )
      .eq("username", username)
      .maybeSingle();
  if (error) throw Error("Portfolio unavailable");
  if (!p) notFound();
  const projects = await c
    .from("public_projects")
    .select("slug,title,description,type,published_at")
    .eq("portfolio_id", p.user_id)
    .order("published_at", { ascending: false });
  if (projects.error) throw Error("Showcases unavailable");
  return (
    <>
      {p.avatar_url && (
        <Image
          unoptimized
          className="avatar"
          src={p.avatar_url}
          alt=""
          width={80}
          height={80}
        />
      )}
      <small>Student portfolio · @{p.username}</small>
      <h1>{p.display_name}</h1>
      {p.bio && <p>{p.bio}</p>}
      <p>
        {[p.college, p.course, p.study_year ? "Year " + p.study_year : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {p.skills && <p>Skills · {p.skills}</p>}
      <section>
        <h2>Published projects</h2>
        {projects.data.length ? (
          <div className="grid">
            {projects.data.map((s) => (
              <article key={s.slug}>
                <small>{s.type}</small>
                <h3>
                  <Link href={"/p/" + s.slug}>{s.title}</Link>
                </h3>
                <p>{s.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>No projects published yet.</p>
        )}
      </section>
    </>
  );
}
