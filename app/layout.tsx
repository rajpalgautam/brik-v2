export const dynamic = "force-dynamic";
import "./style.css";
import Link from "next/link";
export const metadata = {
  title: "Brik · Student workspace",
  description: "A private home for your student projects.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header>
          <Link href="/" className="brand">
            <span aria-hidden>▰</span> Brik
          </Link>
          <small>Student workspace</small>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
