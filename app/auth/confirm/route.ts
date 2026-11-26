import { db } from "@/lib/db";
import { afterAuth } from "@/lib/invitation";
import { redirect } from "next/navigation";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams,
    token = q.get("token_hash"),
    code = q.get("code"),
    client = await db();
  if (
    token &&
    !(await client.auth.verifyOtp({ token_hash: token, type: "email" })).error
  )
    redirect(await afterAuth());
  if (code && !(await client.auth.exchangeCodeForSession(code)).error)
    redirect(await afterAuth());
  redirect("/login?message=Link+expired.+Request+a+new+one.");
}
