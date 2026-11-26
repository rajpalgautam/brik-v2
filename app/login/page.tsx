import { configured } from "@/lib/db";
import { login } from "../auth/actions";
import Submit from "../button";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  return (
    <div style={{ maxWidth: 460, margin: "5vh auto" }}>
      <h1>Your projects live here.</h1>
      <p>Sign in to Brik to keep your files, ideas and notes together.</p>
      <section>
        <h2>Sign in</h2>
        {configured() ? (
          <>
            <form action={login}>
              <input type="hidden" name="method" value="google" />
              <Submit>Continue with Google</Submit>
            </form>
            <form action={login}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  name="email"
                  required
                />
              </label>
              <Submit>Email me a sign-in link</Submit>
            </form>
          </>
        ) : (
          <p role="status">
            Sign-in is waiting for the workspace’s Supabase connection.
          </p>
        )}
        {(await searchParams).message && (
          <p role="status">{(await searchParams).message}</p>
        )}
      </section>
    </div>
  );
}
