import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { publicDb } from "@/lib/public-db";
export default async function PublicProject({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) notFound();
  const client = publicDb(),
    [page, contributors] = await Promise.all([
      client
        .from("public_projects")
        .select(
          "slug,title,description,type,tags,cover_image,demo_url,github_url,published_at,public_profiles!portfolio_id(username,display_name)",
        )
        .eq("slug", slug)
        .maybeSingle(),
      client
        .from("published_contributors")
        .select("username,display_name")
        .eq("slug", slug)
        .order("display_name"),
    ]);
  if (page.error || contributors.error) throw Error("Could not load showcase");
  if (!page.data) notFound();
  const p = page.data,
    profile = Array.isArray(p.public_profiles)
      ? p.public_profiles[0]
      : p.public_profiles;
  return (
    <>
      <small>
        {p.type} project · Published {p.published_at.slice(0, 10)}
      </small>
      <h1>{p.title}</h1>
      {profile && (
        <Link href={"/u/" + profile.username}>
          {profile.display_name}’s portfolio
        </Link>
      )}
      {p.cover_image && (
        <Image
          className="cover"
          unoptimized
          src={p.cover_image}
          width={960}
          height={450}
          alt={p.title + " cover"}
        />
      )}
      <section>
        <h2>About the project</h2>
        <p className="prose-text">{p.description}</p>
        {!!p.tags.length && <small>{p.tags.join(" · ")}</small>}
        <div className="row">
          {p.demo_url && (
            <a href={p.demo_url} rel="noopener noreferrer">
              Open project link
            </a>
          )}
          {p.github_url && (
            <a href={p.github_url} rel="noopener noreferrer">
              View GitHub repository
            </a>
          )}
        </div>
      </section>
      {!!contributors.data.length && (
        <section>
          <h2>Contributors</h2>
          {contributors.data.map((c) => (
            <Link key={c.username} href={"/u/" + c.username}>
              {c.display_name}
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
