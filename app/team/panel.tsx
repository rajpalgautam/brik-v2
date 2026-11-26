import Link from "next/link";
import { session } from "@/lib/db";
import Submit from "../button";
import InviteForm from "./invite-form";
import Chat from "./chat";
import { role, revoke, task, milestone, requestHelp } from "./actions";
export type Person = { student: string; label: string; team_role: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  position: number;
  assignee_id: string | null;
  milestone_id: string | null;
};
const statuses = [
  ["todo", "To do"],
  ["in_progress", "In progress"],
  ["done", "Done"],
];
function TaskForm({
  p,
  t,
  people,
  milestones,
}: {
  p: string;
  t?: Task;
  people: Person[];
  milestones: { id: string; title: string }[];
}) {
  return (
    <form action={task.bind(null, p, t?.id ?? null)}>
      <label>
        Title
        <input required maxLength={120} name="title" defaultValue={t?.title} />
      </label>
      <label>
        Details
        <textarea
          maxLength={2000}
          name="description"
          defaultValue={t?.description}
        />
      </label>
      <label>
        Column
        <select name="status" defaultValue={t?.status}>
          {statuses.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select name="priority" defaultValue={t?.priority ?? "normal"}>
          {["low", "normal", "high"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        Assigned to
        <select name="assignee" defaultValue={t?.assignee_id ?? ""}>
          <option value="">Unassigned</option>
          {people
            .filter((x) => x.team_role !== "viewer")
            .map((x) => (
              <option key={x.student} value={x.student}>
                {x.label}
              </option>
            ))}
        </select>
      </label>
      <label>
        Milestone
        <select name="milestone" defaultValue={t?.milestone_id ?? ""}>
          <option value="">None</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Order in column
        <input
          type="number"
          name="position"
          defaultValue={t?.position ?? 0}
          min={0}
          max={2147483647}
        />
      </label>
      <Submit>{t ? "Save changes" : "Add task"}</Submit>
    </form>
  );
}
export default async function Panel({
  p,
  tab,
  owner,
  write,
}: {
  p: string;
  tab: string;
  owner: boolean;
  write: boolean;
}) {
  const { client, user } = await session();
  if (tab === "help") {
    const { data, error } = await client.rpc("project_requests", { p });
    if (error) throw Error("Help requests unavailable");
    return (
      <>
        <Link href="/help">Browse student requests</Link>
        {write && (
          <details>
            <summary>Ask students for help</summary>
            <p>
              All signed-in students can read your title and description.
              Include only details you want to share.
            </p>
            <form action={requestHelp.bind(null, p)}>
              <label>
                What do you need help with?
                <input name="title" required maxLength={120} />
              </label>
              <label>
                Details
                <textarea name="body" required maxLength={3000} />
              </label>
              <Submit>Post request</Submit>
            </form>
          </details>
        )}
        {data?.length ? (
          data.map((r: { id: string; title: string; closed: boolean }) => (
            <article key={r.id}>
              <small>{r.closed ? "Resolved" : "Open"}</small>
              <Link href={"/help/" + r.id}>{r.title}</Link>
            </article>
          ))
        ) : (
          <p>No help requests for this project yet.</p>
        )}
      </>
    );
  }
  const { data: roster, error } = await client.rpc("team_roster", { p });
  if (error) throw Error("Team unavailable");
  const people: Person[] = roster ?? [];
  if (tab === "chat") {
    const initial = await client
      .from("messages")
      .select("id,sender_id,body,created_at")
      .eq("project_id", p)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(51);
    if (initial.error) throw Error("Chat history unavailable");
    return (
      <Chat
        key={p}
        project={p}
        me={user.id}
        people={people}
        initial={initial.data}
      />
    );
  }
  if (tab === "members") {
    const invites = owner
      ? await client
          .from("project_invites")
          .select("id,role,target_email,uses_count,max_uses,expires_at")
          .eq("project_id", p)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("expires_at", { ascending: false })
      : null;
    if (invites?.error) throw Error("Invitations unavailable");
    return (
      <>
        <h2>Team members</h2>
        {people.map((x) => (
          <article key={x.student}>
            <strong>
              {x.label}
              {x.student === user.id ? " (you)" : ""}
            </strong>
            <small>{x.team_role}</small>
            {owner && x.team_role !== "owner" && (
              <details>
                <summary>Manage access</summary>
                <form action={role.bind(null, p, x.student)}>
                  <label>
                    Access
                    <select name="role" defaultValue={x.team_role}>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                      <option value="remove">Remove from team</option>
                    </select>
                  </label>
                  <Submit>Apply change</Submit>
                </form>
              </details>
            )}
          </article>
        ))}
        {owner && (
          <>
            <InviteForm project={p} />
            <h2>Active invitations</h2>
            {invites?.data
              ?.filter((i) => i.uses_count < i.max_uses)
              .map((i) => (
                <article key={i.id}>
                  <strong>{i.target_email ?? "Team invitation"}</strong>
                  <small>
                    {i.role} · {i.max_uses - i.uses_count} uses left · expires{" "}
                    {i.expires_at.slice(0, 10)}
                  </small>
                  <form action={revoke.bind(null, p, i.id)}>
                    <Submit>Revoke invitation</Submit>
                  </form>
                </article>
              ))}
            {!invites?.data?.some((i) => i.uses_count < i.max_uses) && (
              <p>No active invitations.</p>
            )}
          </>
        )}
      </>
    );
  }
  const [tasks, miles] = await Promise.all([
    client
      .from("tasks")
      .select("*")
      .eq("project_id", p)
      .order("position")
      .order("id"),
    client
      .from("milestones")
      .select("id,title")
      .eq("project_id", p)
      .order("position")
      .order("title"),
  ]);
  if (tasks.error || miles.error) throw Error("Board unavailable");
  return (
    <>
      {write && (
        <>
          <details>
            <summary>Add a task</summary>
            <TaskForm p={p} people={people} milestones={miles.data} />
          </details>
          <details>
            <summary>Add a milestone</summary>
            <form action={milestone.bind(null, p)}>
              <label>
                Milestone name
                <input name="title" maxLength={120} required />
              </label>
              <Submit>Add milestone</Submit>
            </form>
          </details>
        </>
      )}
      <div className="grid board">
        {statuses.map(([key, label]) => {
          const items = (tasks.data as Task[]).filter((t) => t.status === key);
          return (
            <section key={key}>
              <h2>
                {label} <small>{items.length}</small>
              </h2>
              {!items.length && <p>No tasks</p>}
              {items.map((t) => (
                <article key={t.id}>
                  <strong>{t.title}</strong>
                  {t.description && <p>{t.description}</p>}
                  <small>
                    {t.priority} priority ·{" "}
                    {people.find((x) => x.student === t.assignee_id)?.label ??
                      "Unassigned"}
                  </small>
                  {t.milestone_id && (
                    <small>
                      {miles.data.find((m) => m.id === t.milestone_id)?.title}
                    </small>
                  )}
                  {write && (
                    <details>
                      <summary>Edit or move</summary>
                      <TaskForm
                        p={p}
                        t={t}
                        people={people}
                        milestones={miles.data}
                      />
                      <form action={task.bind(null, p, t.id)}>
                        <input type="hidden" name="action" value="delete" />
                        <label>
                          <input type="checkbox" required />
                          Confirm task deletion
                        </label>
                        <Submit>Delete task</Submit>
                      </form>
                    </details>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
