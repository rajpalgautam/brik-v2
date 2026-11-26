import { db } from "@/lib/db";
import { afterAuth } from "@/lib/invitation";
import { redirect } from "next/navigation";
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (code && !(await (await db()).auth.exchangeCodeForSession(code)).error)
    redirect(await afterAuth());
  redirect("/login?message=Sign-in+expired.+Try+again.");
}
