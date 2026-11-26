import PortfolioSettings from "../showcase/profile";
import { session } from "@/lib/db";
import { saveProfile } from "../work";
import Submit from "../button";
import Nav from "../nav";
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { profile: p } = await session(false);
  return (
    <>
      <Nav />
      <h1>{p ? "My profile" : "Set up your profile"}</h1>
      <p>Your profile stays private until you choose what to share.</p>
      <section>
        <form action={saveProfile}>
          <label>
            Username
            <input
              name="username"
              required
              pattern="[a-z][a-z0-9_]{2,29}"
              title="3–30 lowercase letters, numbers or underscores, starting with a letter"
              defaultValue={p?.username}
            />
          </label>
          <label>
            Display name
            <input
              name="display_name"
              maxLength={80}
              required
              defaultValue={p?.display_name}
            />
          </label>
          {(["bio", "college", "course", "skills", "avatar_url"] as const).map(
            (k) => (
              <label key={k}>
                {
                  {
                    bio: "Short bio",
                    college: "College",
                    course: "Course",
                    skills: "Skills",
                    avatar_url: "Avatar image URL (HTTPS)",
                  }[k]
                }
                <input
                  name={k}
                  defaultValue={p?.[k] ?? ""}
                  maxLength={
                    {
                      bio: 500,
                      college: 100,
                      course: 100,
                      skills: 300,
                      avatar_url: 500,
                    }[k]
                  }
                />
              </label>
            ),
          )}
          <label>
            Year of study
            <input
              name="study_year"
              type="number"
              min="1"
              max="12"
              defaultValue={p?.study_year ?? ""}
            />
          </label>
          <Submit>Save profile</Submit>
        </form>
        <p role="status">{(await searchParams).message}</p>
      </section>
      {p && <PortfolioSettings />}
    </>
  );
}
