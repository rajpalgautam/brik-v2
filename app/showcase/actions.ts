"use server";
import { session } from "@/lib/db";
import { fileType } from "@/lib/files";
import { snapshotSchema, profileFields } from "@/lib/showcase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function publish(p: string, raw: unknown) {
  const { client } = await session(),
    s = snapshotSchema.safeParse(raw);
  if (!s.success) return { error: "Check the public fields and links." };
  if (s.data.cover_image) {
    const [header, b64] = s.data.cover_image.split(","),
      mime = header.slice(5, -7),
      bytes = Buffer.from(b64, "base64");
    if (
      bytes.length > 512 * 1024 ||
      fileType("cover." + mime.slice(6), bytes) !== mime
    )
      return { error: "Choose a valid PNG, JPEG or WebP cover under 512 KiB." };
  }
  const { error } = await client.rpc("set_showcase", { p, snapshot: s.data });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "This public URL is taken. Choose a different slug."
          : "Publication failed. Check Owner access and approve your portfolio first.",
    };
  revalidatePath("/projects/" + p);
  return { slug: s.data.slug };
}
export async function unpublish(p: string, f: FormData) {
  const { client } = await session();
  if (f.get("confirm") !== "on")
    redirect("/projects/" + p + "?tab=showcase&message=Confirm+unpublishing");
  const { error } = await client.rpc("set_showcase", { p, snapshot: null });
  redirect(
    "/projects/" +
      p +
      "?tab=showcase&message=" +
      (error ? "Could+not+unpublish" : "Showcase+unpublished"),
  );
}
export async function consent(p: string, f: FormData) {
  const { client, user } = await session(),
    enabled = f.get("optin") === "on";
  const q = enabled
    ? client.from("contributor_consents").insert({ project_id: p })
    : client
        .from("contributor_consents")
        .delete()
        .eq("project_id", p)
        .eq("user_id", user.id);
  const { error } = await q;
  redirect(
    "/projects/" +
      p +
      "?tab=showcase&message=" +
      (error && error.code !== "23505"
        ? "Could+not+save+consent"
        : "Contributor+preference+saved"),
  );
}
export async function portfolio(f: FormData) {
  const { client } = await session();
  const result =
    f.get("action") === "hide"
      ? await client.rpc("hide_portfolio")
      : await client.rpc("approve_portfolio", {
          fields: profileFields.filter((k) => f.get(k) === "on"),
        });
  redirect(
    "/settings/profile?message=" +
      encodeURIComponent(
        result.error
          ? "Could not change portfolio visibility. Unpublish owned showcases before hiding your portfolio."
          : "Portfolio settings saved.",
      ),
  );
}
