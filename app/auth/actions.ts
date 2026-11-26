"use server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
export async function login(f: FormData) {
  const client = await db(),
    base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) redirect("/login?message=Configure+the+app+URL+first");
  if (f.get("method") === "google") {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: base + "/auth/callback" },
    });
    if (error || !data.url)
      redirect("/login?message=Google+sign-in+is+unavailable");
    redirect(data.url);
  }
  const email = String(f.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    redirect("/login?message=Enter+a+valid+email");
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: base + "/auth/confirm" },
  });
  redirect(
    error
      ? "/login?message=Email+request+failed.+Try+again+later."
      : "/login?message=Check+your+inbox+for+the+sign-in+link.",
  );
}
export async function logout() {
  const { error } = await (await db()).auth.signOut();
  if (error) throw Error("Sign-out failed");
  (await cookies()).delete("brik_invite");
  redirect("/login");
}
