import { redirect } from "next/navigation";

export default function Page() {
  const url = process.env.BRIK_SHEETS_APP_URL?.trim();
  if (url && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    redirect(url);
  }
  redirect("/dashboard");
}
