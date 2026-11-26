"use client";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Person } from "./panel";
type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
const columns = "id,sender_id,body,created_at";
function merge(a: Message[], b: Message[]) {
  return [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort(
    (x, y) =>
      x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id),
  );
}
export default function Chat({
  project,
  me,
  people,
  initial,
}: {
  project: string;
  me: string;
  people: Person[];
  initial: Message[];
}) {
  const [client] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    ),
  );
  const [messages, setMessages] = useState<Message[]>(() =>
      merge([], initial.slice(0, 50)),
    ),
    [status, setStatus] = useState("Connecting…"),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [older, setOlder] = useState(initial.length > 50),
    [notice, setNotice] = useState("");
  const router = useRouter();
  const pending = useRef<string | null>(null);
  const checkAccess = useCallback(async () => {
    const roster = await client.rpc("team_roster", { p: project });
    if (roster.error) {
      setStatus("Connection interrupted. Reconnecting…");
      return false;
    }
    if (
      !roster.data?.some(
        (x: Person) => x.student === me && x.team_role !== "viewer",
      )
    ) {
      setMessages([]);
      setOlder(false);
      setStatus("Chat access ended.");
      router.replace("/projects/" + project);
      return false;
    }
    return true;
  }, [client, me, project, router]);
  const refresh = useCallback(async () => {
    if (!(await checkAccess())) return;
    const { data, error } = await client
      .from("messages")
      .select(columns)
      .eq("project_id", project)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51);
    if (error) {
      setStatus("Could not load chat.");
      return;
    }
    setMessages((prev) =>
      merge(
        data.slice(0, 50),
        prev.filter((m) => m.created_at > (data[0]?.created_at ?? "")),
      ),
    );
    setOlder(data.length > 50);
  }, [client, checkAccess, project]);
  useEffect(() => {
    let active = true;
    const channel = client
      .channel(project + "/chat", { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "project_id=eq." + project,
        },
        (payload) => {
          if (active)
            setMessages((prev) => merge(prev, [payload.new as Message]));
        },
      )
      .subscribe((s) => {
        if (!active) return;
        if (s === "SUBSCRIBED") {
          setStatus("Connected");
          void refresh();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED")
          setStatus("Connection interrupted. Refresh to reconnect.");
      });
    const timer = window.setInterval(checkAccess, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void client.removeChannel(channel);
    };
  }, [client, project, refresh, checkAccess]);
  async function history() {
    const first = messages[0];
    if (!first) return;
    const { data, error } = await client
      .from("messages")
      .select(columns)
      .eq("project_id", project)
      .or(
        "created_at.lt." +
          first.created_at +
          ",and(created_at.eq." +
          first.created_at +
          ",id.lt." +
          first.id +
          ")",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51);
    if (error) {
      setNotice("Could not load older messages.");
      return;
    }
    setMessages((prev) => merge(prev, data.slice(0, 50)));
    setOlder(data.length > 50);
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending || body.length > 3000) return;
    const id = pending.current ?? crypto.randomUUID();
    pending.current = id;
    setSending(true);
    setNotice("");
    const m = { id, sender_id: me, body, created_at: new Date().toISOString() };
    setMessages((prev) => merge(prev, [m]));
    try {
      const { data, error } = await client
        .from("messages")
        .insert({ id, project_id: project, body })
        .select(columns)
        .single();
      if (error) {
        if (error.code !== "23505") throw Error();
        const result = await client
          .from("messages")
          .select(columns)
          .eq("id", id)
          .eq("sender_id", me)
          .single();
        if (!result.data) throw Error();
        setMessages((prev) => merge(prev, [result.data]));
      } else setMessages((prev) => merge(prev, [data]));
      setText("");
      pending.current = null;
    } catch {
      setMessages((prev) => prev.filter((x) => x.id !== id));
      setNotice("Could not confirm delivery. Your draft is here to retry.");
    } finally {
      setSending(false);
    }
  }
  return (
    <section>
      <h2>Team chat</h2>
      <small role="status">{status}</small>
      {older && <button onClick={history}>Load older messages</button>}
      <div role="log" aria-label="Project messages">
        {!messages.length && <p>No messages to show.</p>}
        {messages.map((m) => (
          <article key={m.id}>
            <strong>
              {people.find((x) => x.student === m.sender_id)?.label ??
                "Former teammate"}
            </strong>
            <small>
              <time dateTime={m.created_at}>
                {new Date(m.created_at).toLocaleString()}
              </time>
            </small>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.body}</p>
          </article>
        ))}
      </div>
      <form onSubmit={send}>
        <label>
          Message
          <textarea
            required
            maxLength={3000}
            value={text}
            disabled={sending}
            onChange={(e) => {
              setText(e.target.value);
              pending.current = null;
            }}
          />
        </label>
        <button disabled={sending || !text.trim()}>
          {sending ? "Sending…" : "Send message"}
        </button>
      </form>
      <p role="status">{notice}</p>
    </section>
  );
}
