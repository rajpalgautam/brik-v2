"use server";
import { afterAuth } from "@/lib/invitation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { session } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import { fileType } from "@/lib/files";
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const project = (id: string) => "/projects/" + encodeURIComponent(id);
function result(path: string, message: string): never {
  redirect(
    path +
      (path.includes("?") ? "&" : "?") +
      "message=" +
      encodeURIComponent(message),
  );
}
export async function saveProfile(f: FormData) {
  const { client, profile } = await session(false);
  const row = {
    username: val(f, "username"),
    display_name: val(f, "display_name"),
    bio: val(f, "bio"),
    college: val(f, "college"),
    course: val(f, "course"),
    skills: val(f, "skills"),
    study_year: val(f, "study_year") || null,
    avatar_url: val(f, "avatar_url") || null,
  };
  if (row.avatar_url && !/^https:\/\/[^\s]+$/.test(row.avatar_url))
    result("/onboarding", "Use an HTTPS avatar URL.");
  const { error } = profile
    ? await client.from("profiles").update(row).eq("id", profile.id)
    : await client.from("profiles").insert(row);
  if (error)
    result(
      "/onboarding",
      error.code === "23505"
        ? "That username is taken."
        : "Check your profile fields and try again.",
    );
  redirect(await afterAuth());
}
export async function saveProject(id: string | null, f: FormData) {
  const { client } = await session(),
    row = {
      title: val(f, "title"),
      summary: val(f, "summary"),
      type: val(f, "type"),
      status: val(f, "status"),
      github_url: val(f, "github_url") || null,
    };
  const path = id ? project(id) + "/" : "/dashboard";
  if (
    row.github_url &&
    !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/.test(row.github_url)
  )
    result(path, "Enter a full HTTPS GitHub repository link.");
  const query = id
    ? client.from("projects").update(row).eq("id", id)
    : client.from("projects").insert(row);
  // Read after the insert in a separate statement so ownership is visible to RLS.
  if (!id) {
    const { error } = await query;
    if (error)
      result(path, "Could not create project. Check the fields and try again.");
    result("/dashboard", "Private project created.");
  }
  const { error, data } = await query.select("id").maybeSingle();
  if (error || !data) result(path, "Project could not be saved.");
  result(project(id), "Project saved.");
}
export async function removeProject(id: string, f: FormData) {
  const { client } = await session();
  if (f.get("confirm") !== "on") result(project(id), "Confirm deletion first.");
  const { data, error } = await client
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    result(
      project(id),
      "Delete failed. Remove all project files first and check your access.",
    );
  redirect("/dashboard");
}
export async function note(
  id: string,
  nid: string | null,
  remove: boolean,
  f: FormData,
) {
  const { client } = await session(),
    path = project(id) + "?tab=notes",
    row = { title: val(f, "title"), content_md: val(f, "content_md") };
  if (remove && f.get("confirm") !== "on")
    result(path, "Confirm deletion first.");
  const table = client.from("project_notes");
  const q = nid
    ? (remove ? table.delete() : table.update(row))
        .eq("project_id", id)
        .eq("id", nid)
    : table.insert({ ...row, project_id: id });
  const { error, data } = await q.select("id").maybeSingle();
  if (error || !data)
    result(path, "Could not change this note. Check access and length.");
  result(path, remove ? "Note deleted." : "Note saved.");
}
export async function upload(id: string, f: FormData) {
  const { client, user } = await session(),
    path = project(id) + "?tab=files",
    file = f.get("file");
  if (!(file instanceof File) || !file.size || file.size > 10485760)
    result(path, "Choose a file up to 10 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    mime = fileType(file.name, bytes);
  if (!mime) result(path, "Unsupported file format or content.");
  const { data: p } = await client
    .from("projects")
    .select("owner_id,project_members(user_id,role)")
    .eq("id", id)
    .maybeSingle();
  if (
    !p ||
    (p.owner_id !== user.id &&
      !p.project_members.some(
        (m) => m.user_id === user.id && m.role === "member",
      ))
  )
    result(path, "Edit access is required.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) result(path, "File uploads need the server storage credential.");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
  const name = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-140);
  const { error } = await admin.storage
    .from("project-private")
    .upload([id, user.id, crypto.randomUUID(), name].join("/"), bytes, {
      contentType: mime,
      upsert: false,
    });
  if (error)
    result(
      path,
      "Upload failed. Check access, file size and the 100 MiB project limit.",
    );
  result(path, "File uploaded.");
}
export async function fileAction(
  id: string,
  path: string,
  remove: boolean,
  f: FormData,
) {
  const { client } = await session(),
    back = project(id) + "?tab=files";
  if (!path.startsWith(id + "/")) result(back, "Invalid file.");
  const bucket = client.storage.from("project-private");
  if (remove) {
    if (f.get("confirm") !== "on") result(back, "Confirm deletion first.");
    const { data, error } = await bucket.remove([path]);
    if (error || !data?.length) result(back, "File could not be removed.");
    revalidatePath(project(id));
    result(back, "File removed.");
  }
  const { data, error } = await bucket.createSignedUrl(path, 60, {
    download: true,
  });
  if (error || !data) result(back, "Download unavailable.");
  redirect(data.signedUrl);
}
