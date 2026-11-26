import { cookies } from "next/headers";
export function validTicket(s: string) {
  return /^[a-f0-9]{64}$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
}
export async function afterAuth() {
  const value = (await cookies()).get("brik_invite")?.value;
  return value && validTicket(value) ? "/invite/" + value : "/dashboard";
}
