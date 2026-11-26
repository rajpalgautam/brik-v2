"use server";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { session } from "@/lib/db";
import { validTicket } from "@/lib/invitation";
const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const workspace = (p: string, tab: string) =>
  "/projects/" + encodeURIComponent(p) + "?tab=" + tab;
function back(path: string, msg: string): never {
  redirect(
    path +
      (path.includes("?") ? "&" : "?") +
      "message=" +
      encodeURIComponent(msg),
  );
}
export async function issue(
  p: string,
  reply: string | null,
  _previous: { message: string; url: string },
  f: FormData,
) {
  const { client } = await session(),
    raw = randomBytes(32).toString("hex"),
    email = field(f, "email") || null;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return { message: "Configure the Brik app URL first.", url: "" };
  const { error } = await client.rpc("make_invite", {
    p,
    desired_role: field(f, "role"),
    fingerprint: createHash("sha256").update(raw).digest("hex"),
    email_address: email,
    allowed_uses: reply || email ? 1 : Number(field(f, "uses") || 5),
    reply,
  });
  if (error)
    return {
      message:
        "Could not create the invitation. Check owner access, recipient and the 20-per-hour limit.",
      url: "",
    };
  const url = new URL("/invite/" + raw, origin).href;
  revalidatePath("/projects/" + p);
  revalidatePath("/help");
  if (reply)
    return {
      message: "Invitation ready. This student can accept it from Peer Help.",
      url: "",
    };
  if (!email)
    return {
      message: "Share this private link. It expires in seven days.",
      url,
    };
  const key = process.env.RESEND_API_KEY,
    from = process.env.INVITE_EMAIL_FROM;
  if (key && from) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Your Brik team invitation",
          text:
            "You have been invited to a Brik project. Sign in with this email address to review and accept your invitation within seven days.\n\n" +
            url,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok)
        return { message: "Invitation submitted for email delivery.", url: "" };
    } catch {
      return {
        message:
          "Email delivery could not be confirmed. Share this email-bound link directly.",
        url,
      };
    }
  }
  return {
    message: "Email was not sent. Share this email-bound link directly.",
    url,
  };
}
export async function continueInvite(ticket: string, profile: boolean) {
  if (!validTicket(ticket)) redirect("/login");
  (await cookies()).set("brik_invite", ticket, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https:"),
    path: "/",
    maxAge: 3600,
  });
  redirect(profile ? "/onboarding" : "/login");
}
export async function accept(ticket: string) {
  const { client } = await session();
  const { data, error } = await client.rpc("accept_invite", { ticket });
  if (error || !data)
    back(
      "/invite/" + encodeURIComponent(ticket),
      "This invitation is unavailable for this account.",
    );
  (await cookies()).delete("brik_invite");
  redirect(workspace(data, "members"));
}
export async function revoke(p: string, id: string) {
  const { client } = await session();
  const { error, data } = await client
    .from("project_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", p)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  back(
    workspace(p, "members"),
    error || !data
      ? "Could not revoke this invitation."
      : "Invitation revoked.",
  );
}
export async function role(p: string, student: string, f: FormData) {
  const { client } = await session();
  const { error } = await client.rpc("manage_member", {
    p,
    student,
    new_role: field(f, "role"),
  });
  back(
    workspace(p, "members"),
    error ? "Could not change this membership." : "Team updated.",
  );
}
export async function task(p: string, id: string | null, f: FormData) {
  const { client } = await session(),
    action = field(f, "action"),
    t = client.from("tasks");
  const row = {
    title: field(f, "title"),
    description: field(f, "description"),
    priority: field(f, "priority"),
    status: field(f, "status"),
    assignee_id: field(f, "assignee") || null,
    milestone_id: field(f, "milestone") || null,
    position: Number(field(f, "position") || 0),
  };
  const q = id
    ? (action === "delete" ? t.delete() : t.update(row))
        .eq("project_id", p)
        .eq("id", id)
    : t.insert({ ...row, project_id: p });
  const { data, error } = await q.select("id").maybeSingle();
  back(
    workspace(p, "board"),
    error || !data
      ? "Task change failed. Check the fields and your access."
      : "Board updated.",
  );
}
export async function milestone(p: string, f: FormData) {
  const { client } = await session();
  const { error } = await client
    .from("milestones")
    .insert({ project_id: p, title: field(f, "title") });
  back(
    workspace(p, "board"),
    error ? "Could not add milestone." : "Milestone added.",
  );
}
export async function requestHelp(p: string, f: FormData) {
  const { client } = await session();
  const { data, error } = await client
    .from("help_requests")
    .insert({ project_id: p, title: field(f, "title"), body: field(f, "body") })
    .select("id")
    .single();
  if (error || !data)
    back(
      workspace(p, "help"),
      "Could not post. Check the fields and your access.",
    );
  redirect("/help/" + data.id);
}
export async function resolveHelp(id: string) {
  const { client } = await session();
  const { data, error } = await client
    .from("help_requests")
    .update({ closed: true })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  back(
    "/help/" + id,
    error || !data ? "Could not resolve request." : "Request resolved.",
  );
}
export async function replyHelp(id: string, f: FormData) {
  const { client } = await session(),
    url = field(f, "url");
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.username || u.password) throw Error();
    } catch {
      back("/help/" + id, "Use a valid HTTPS resource link.");
    }
  }
  const { error } = await client
    .from("help_replies")
    .insert({
      request_id: id,
      body: field(f, "body"),
      kind: field(f, "kind"),
      resource_url: url || null,
    });
  back(
    "/help/" + id,
    error
      ? "Reply failed. Check whether the request is still open."
      : "Reply posted.",
  );
}
