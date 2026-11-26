import Link from "next/link";
import { session } from "@/lib/db";
import { profileFields } from "@/lib/showcase";
import { portfolio } from "./actions";
import Submit from "../button";
export default async function PortfolioSettings() {
  const { client, user, profile } = await session(),
    { data, error } = await client
      .from("public_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
  if (error) throw Error("Portfolio settings unavailable");
  return (
    <section>
      <h2>Public portfolio</h2>
      <p>
        Approve the name <strong>{profile.display_name}</strong> and the address{" "}
        <strong>/u/{profile.username}</strong>. Choose any other profile details
        to include.
      </p>
      {data && (
        <Link href={"/u/" + data.username}>View published portfolio</Link>
      )}
      <form action={portfolio}>
        {profileFields.map((k) => (
          <label key={k} className="check">
            <input
              name={k}
              type="checkbox"
              defaultChecked={data?.[k] != null}
            />
            {k === "avatar_url"
              ? "Avatar"
              : k === "study_year"
                ? "Year of study"
                : k[0].toUpperCase() + k.slice(1)}
            {profile[k] ? " · " + profile[k] : ""}
          </label>
        ))}
        <Submit>
          {data ? "Update approved profile" : "Publish approved profile"}
        </Submit>
      </form>
      {data && (
        <details>
          <summary>Hide portfolio</summary>
          <form action={portfolio}>
            <input name="action" type="hidden" value="hide" />
            <p>
              Unpublish your project showcases first. Hiding removes your
              portfolio and contributor listing.
            </p>
            <Submit>Hide portfolio</Submit>
          </form>
        </details>
      )}
    </section>
  );
}
