import { configured, db } from "@/lib/db";
import { notFound } from "next/navigation";
import { accept, continueInvite } from "@/app/team/actions";
import { validTicket } from "@/lib/invitation";
import Submit from "@/app/button";
export const metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
} as const;
export default async function Invite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { token } = await params;
  if (!validTicket(token)) notFound();
  if (!configured()) return <p>Connect Supabase to review invitations.</p>;
  const client = await db(),
    {
      data: { user },
    } = await client.auth.getUser();
  if (!user)
    return (
      <section>
        <h1>Team invitation</h1>
        <form action={continueInvite.bind(null, token, false)}>
          <Submit>Sign in to review</Submit>
        </form>
      </section>
    );
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw Error("Could not load profile");
  if (!profile)
    return (
      <form action={continueInvite.bind(null, token, true)}>
        <Submit>Finish your profile to continue</Submit>
      </form>
    );
  const { data, error } = await client.rpc("inspect_invite", { ticket: token });
  if (error) throw Error("Invitation check failed");
  return (
    <section>
      <h1>Team invitation</h1>
      {data?.[0] ? (
        <>
          <p>
            You have been invited as a {data[0].invite_role}.{" "}
            {data[0].invite_role === "viewer"
              ? "You can read project materials and the board."
              : "You can edit project materials, manage tasks and join team chat."}
          </p>
          <form action={accept.bind(null, token)}>
            <Submit>Accept invitation</Submit>
          </form>
        </>
      ) : (
        <p>
          This invitation is unavailable. Check that you signed in with the
          invited account.
        </p>
      )}
      <p role="status">{(await searchParams).message}</p>
    </section>
  );
}
