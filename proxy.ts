import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll(items) {
            items.forEach(({ name, value }) => req.cookies.set(name, value));
            response = NextResponse.next({ request: req });
            items.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    await client.auth.getUser();
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/dashboard",
    "/ideas",
    "/help/:path*",
    "/invite/:path*",
    "/projects/:path*",
    "/settings/:path*",
    "/onboarding",
    "/login",
  ],
};
