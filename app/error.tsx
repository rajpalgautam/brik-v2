"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h2>We couldn’t load this workspace.</h2>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
