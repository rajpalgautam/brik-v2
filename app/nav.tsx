import Link from "next/link";
import { logout } from "./auth/actions";
export default function Nav() {
  return (
    <nav aria-label="Workspace">
      <Link href="/dashboard">My projects</Link>
      <Link href="/ideas">Idea Lab</Link>
      <Link href="/help">Peer Help</Link>
      <Link href="/settings/profile">My profile</Link>
      <form action={logout}>
        <button>Sign out</button>
      </form>
    </nav>
  );
}
