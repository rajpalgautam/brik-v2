import Link from "next/link";
import { session } from "@/lib/db";
import Form from "./snapshot-form";
import { consent, unpublish } from "./actions";
import Submit from "../button";
export default async function Showcase({
  p,
  owner,
}: {
  p: string;
  owner: boolean;
}) {
  const { client, user } = await session();
  const [profile, opted, snapshot] = await Promise.all([
    client
      .from("public_profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("contributor_consents")
      .select("user_id")
      .eq("project_id", p)
      .eq("user_id", user.id)
      .maybeSingle(),
    owner ? client.rpc("owner_showcase", { p }) : null,
  ]);
  if (profile.error || opted.error || snapshot?.error)
    throw Error("Showcase unavailable");
  const current = snapshot?.data?.[0];
  return (
    <>
      <section>
        <h2>Contributor credit</h2>
        <p>
          Choose whether your approved public name links to your portfolio on
          this project’s showcase.
        </p>
        {profile.data ? (
          <form action={consent.bind(null, p)}>
            <label className="check">
              <input
                type="checkbox"
                name="optin"
                defaultChecked={Boolean(opted.data)}
              />
              List me as a contributor when published
            </label>
            <Submit>Save preference</Submit>
          </form>
        ) : (
          <Link href="/settings/profile">Choose your public profile first</Link>
        )}
      </section>
      {owner && (
        <>
          <h2>Public project page</h2>
          {current && (
            <Link href={"/p/" + current.slug}>Open current showcase</Link>
          )}
          {profile.data ? (
            <Form p={p} initial={current ?? null} />
          ) : (
            <p>
              <Link href="/settings/profile">Approve your portfolio</Link> to
              publish a showcase.
            </p>
          )}
          {current && (
            <details>
              <summary>Unpublish showcase</summary>
              <form action={unpublish.bind(null, p)}>
                <label className="check">
                  <input type="checkbox" required name="confirm" />
                  Remove this public page and its cover
                </label>
                <Submit>Unpublish</Submit>
              </form>
            </details>
          )}
        </>
      )}
    </>
  );
}
