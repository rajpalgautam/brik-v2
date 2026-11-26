"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { snapshotSchema, type Snapshot } from "@/lib/showcase";
import { publish } from "./actions";
export default function Form({
  p,
  initial,
}: {
  p: string;
  initial: Snapshot | null;
}) {
  const router = useRouter(),
    [value, setValue] = useState<Snapshot>(
      initial ?? {
        slug: "",
        title: "",
        description: "",
        type: "academic",
        tags: [],
        demo_url: null,
        github_url: null,
        cover_image: null,
      },
    ),
    [tags, setTags] = useState(initial?.tags.join(", ") ?? ""),
    [preview, setPreview] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [live, setLive] = useState("");
  function field<K extends keyof Snapshot>(k: K, v: Snapshot[K]) {
    setValue((old) => ({ ...old, [k]: v }));
  }
  async function image(file?: File) {
    if (!file) return;
    if (
      file.size > 524288 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setMessage("Use a PNG, JPEG or WebP cover up to 512 KiB.");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      field("cover_image", String(reader.result));
      setBusy(false);
    };
    reader.onerror = () => {
      setMessage("Could not read image.");
      setBusy(false);
    };
    reader.readAsDataURL(file);
  }
  function review(e: React.FormEvent) {
    e.preventDefault();
    const s = snapshotSchema.safeParse({
      ...value,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (!s.success) {
      setMessage(
        s.error.issues[0].path.join(" ") + ": " + s.error.issues[0].message,
      );
      return;
    }
    setPreview(s.data);
    setMessage("");
    setLive("");
  }
  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const result = await publish(p, preview);
      if (result.error) setMessage(result.error);
      else if (result.slug) {
        setLive(result.slug);
        setPreview(null);
        setMessage("Showcase published.");
        router.refresh();
      }
    } catch {
      setMessage("Publication could not be confirmed. Refresh to check.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      {preview ? (
        <>
          <h2>Review public snapshot</h2>
          <small>
            /p/{preview.slug} · {preview.type}
          </small>
          {preview.cover_image && (
            <Image
              unoptimized
              width={800}
              height={400}
              className="cover"
              src={preview.cover_image}
              alt="Selected showcase cover"
            />
          )}
          <h3>{preview.title}</h3>
          <p>{preview.description}</p>
          <small>{preview.tags.join(" · ")}</small>
          {[preview.demo_url, preview.github_url]
            .filter(Boolean)
            .map((u, i) => (
              <p key={i}>{u}</p>
            ))}
          <p>
            These fields and opted-in contributor names will be visible to
            anyone. External links may reveal more on the linked site.
          </p>
          <div className="row">
            <button disabled={busy} onClick={() => setPreview(null)}>
              Back to editing
            </button>
            <button disabled={busy} onClick={confirm}>
              Confirm and publish
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={review}>
          <p>
            Write the version you want to share. Files, working notes, board and
            chat stay private.
          </p>
          <label>
            Public title
            <input
              required
              maxLength={120}
              value={value.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label>
            Public summary
            <textarea
              required
              maxLength={4000}
              value={value.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <label>
            Public URL slug
            <input
              required
              pattern="[a-z0-9][a-z0-9\-]*"
              maxLength={80}
              value={value.slug}
              onChange={(e) => field("slug", e.target.value)}
            />
          </label>
          <label>
            Project type
            <select
              value={value.type}
              onChange={(e) =>
                field("type", e.target.value as Snapshot["type"])
              }
            >
              {["academic", "coding", "idea"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Tags (comma-separated)
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          {(["demo_url", "github_url"] as const).map((k) => (
            <label key={k}>
              {k === "demo_url"
                ? "Showcase or demo link"
                : "Public GitHub link"}{" "}
              (optional)
              <input
                type="url"
                value={value[k] ?? ""}
                onChange={(e) => field(k, e.target.value || null)}
              />
            </label>
          ))}
          <label>
            Optional public cover (512 KiB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => image(e.target.files?.[0])}
            />
          </label>
          {value.cover_image && (
            <button type="button" onClick={() => field("cover_image", null)}>
              Remove selected cover
            </button>
          )}
          <button disabled={busy}>Preview public page</button>
        </form>
      )}
      <p role="status">
        {message} {live && <Link href={"/p/" + live}>View showcase</Link>}
      </p>
    </section>
  );
}
