import Showcase from "@/app/showcase/panel";
import Panel from "@/app/team/panel";
import Link from "next/link";
import Markdown from "react-markdown";
import { notFound } from "next/navigation";
import { session } from "@/lib/db";
import Nav from "../../nav";
import Fields from "../../fields";
import Submit from "../../button";
import {
  saveProject,
  removeProject,
  note,
  upload,
  fileAction,
} from "../../work";
function Confirm() {
  return (
    <label className="row">
      <input
        style={{ width: "auto" }}
        type="checkbox"
        required
        name="confirm"
      />
      Confirm deletion
    </label>
  );
}
export default async function Workspace({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; message?: string }>;
}) {
  const { id } = await params,
    { tab = "overview", message } = await searchParams,
    { client, user } = await session();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) notFound();
  const { data: p, error } = await client
    .from("projects")
    .select("*,project_members(user_id,role)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw Error("Workspace unavailable");
  if (!p) notFound();
  const owner = p.owner_id === user.id,
    write =
      owner ||
      p.project_members.some(
        (m: { user_id: string; role: string }) =>
          m.user_id === user.id && m.role === "member",
      );
  const tabs = [
    "overview",
    "files",
    "notes",
    "board",
    "members",
    "help",
    "showcase",
    ...(write ? ["chat", "settings"] : []),
  ];
  if (!tabs.includes(tab)) notFound();
  const notes =
    tab === "notes"
      ? await client
          .from("project_notes")
          .select("*")
          .eq("project_id", id)
          .order("updated_at", { ascending: false })
      : null;
  const files =
    tab === "files" ? await client.rpc("workspace_files", { p: id }) : null;
  if (notes?.error || files?.error)
    throw Error("Workspace content unavailable");
  return (
    <>
      <Nav />
      <small>
        {p.type} · {p.status} · Private
      </small>
      <h1>{p.title}</h1>
      <nav aria-label="Project sections">
        {tabs.map((t) => (
          <Link
            key={t}
            aria-current={t === tab ? "page" : undefined}
            href={"?tab=" + t}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {["board", "chat", "members", "help"].includes(tab) && (
        <Panel p={id} tab={tab} write={write} owner={owner} />
      )}
      {tab === "showcase" && <Showcase p={id} owner={owner} />}
      {tab === "overview" && (
        <section>
          <h2>Project overview</h2>
          <p>{p.summary || "Add a short summary in Settings."}</p>
          <small>{1 + p.project_members.length} on the team</small>
          {p.github_url && (
            <a href={p.github_url} rel="noopener noreferrer">
              Open GitHub repository
            </a>
          )}
        </section>
      )}
      {tab === "settings" && (
        <>
          <section>
            <form action={saveProject.bind(null, id)}>
              <Fields p={p} />
              <Submit>Save changes</Submit>
            </form>
          </section>
          {owner && (
            <details>
              <summary>Delete project</summary>
              <p>
                Remove all files first. Deleting this project also removes its
                notes.
              </p>
              <form action={removeProject.bind(null, id)}>
                <Confirm />
                <Submit>Delete project</Submit>
              </form>
            </details>
          )}
        </>
      )}
      {tab === "notes" && (
        <>
          {write && (
            <details>
              <summary>Add a note</summary>
              <form action={note.bind(null, id, null, false)}>
                <label>
                  Title
                  <input name="title" required maxLength={120} />
                </label>
                <label>
                  Note (Markdown supported)
                  <textarea name="content_md" maxLength={20000} />
                </label>
                <Submit>Save note</Submit>
              </form>
            </details>
          )}
          {notes?.data?.length === 0 && <p>No notes yet.</p>}
          {notes?.data?.map((n) => (
            <article key={n.id}>
              <h2>{n.title}</h2>
              <div className="markdown">
                <Markdown skipHtml disallowedElements={["img"]}>
                  {n.content_md}
                </Markdown>
              </div>
              <small>Updated {n.updated_at.slice(0, 10)}</small>
              {write && (
                <details>
                  <summary>Edit or remove</summary>
                  <form action={note.bind(null, id, n.id, false)}>
                    <label>
                      Title
                      <input
                        name="title"
                        defaultValue={n.title}
                        maxLength={120}
                        required
                      />
                    </label>
                    <label>
                      Note
                      <textarea
                        name="content_md"
                        defaultValue={n.content_md}
                        maxLength={20000}
                      />
                    </label>
                    <Submit>Save changes</Submit>
                  </form>
                  <form action={note.bind(null, id, n.id, true)}>
                    <Confirm />
                    <Submit>Delete note</Submit>
                  </form>
                </details>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "files" && (
        <>
          {write && (
            <section>
              <form action={upload.bind(null, id)}>
                <label>
                  Upload academic files
                  <input
                    type="file"
                    name="file"
                    required
                    accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.txt,.md,.csv"
                  />
                </label>
                <small>10 MiB per file · 100 MiB per project</small>
                <Submit>Upload file</Submit>
              </form>
            </section>
          )}
          {files?.data?.length === 0 && <p>No files yet.</p>}
          {files?.data?.map(
            (f: { path: string; bytes: number; uploaded_at: string }) => (
              <article key={f.path}>
                <h2>{f.path.split("/").pop()}</h2>
                <small>
                  {Math.ceil(f.bytes / 1024)} KB · {f.uploaded_at.slice(0, 10)}{" "}
                  · Uploaded by{" "}
                  {f.path.split("/")[1] === user.id
                    ? "you"
                    : f.path.split("/")[1]}
                </small>
                <form action={fileAction.bind(null, id, f.path, false)}>
                  <Submit>Download</Submit>
                </form>
                {write && (
                  <details>
                    <summary>Remove file</summary>
                    <form action={fileAction.bind(null, id, f.path, true)}>
                      <Confirm />
                      <Submit>Delete file</Submit>
                    </form>
                  </details>
                )}
              </article>
            ),
          )}
        </>
      )}
    </>
  );
}
