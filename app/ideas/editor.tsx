"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { blankPlan, planSchema, type Plan } from "@/lib/plan";
import { commit } from "./actions";
const fields = [
  ["title", "Project title"],
  ["summary", "Summary"],
  ["problem", "Problem"],
  ["solution", "Proposed solution"],
  ["targetAudience", "Who is it for?"],
] as const;
export default function Editor({
  draft,
  initial,
  input,
  available,
}: {
  draft: string | null;
  initial: Plan | null;
  input: string;
  available: boolean;
}) {
  const router = useRouter(),
    [id, setId] = useState(draft),
    [idea, setIdea] = useState(input),
    [plan, setPlan] = useState(initial),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [ticket] = useState(() => crypto.randomUUID());
  async function generate() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const response = await fetch("/api/ai/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea }),
        }),
        res = await response.json();
      if (!response.ok) {
        setMsg(res.error || "Generation failed.");
        return;
      }
      const parsed = planSchema.safeParse(res.plan);
      if (!parsed.success) throw Error();
      setPlan(parsed.data);
    } catch {
      setMsg("Could not generate a plan. Your idea is still here.");
    } finally {
      setBusy(false);
    }
  }
  async function save(mode: "save" | "create") {
    if (busy || !plan) return;
    const checked = planSchema.safeParse(plan);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      setMsg(issue.path.join(" › ") + ": " + issue.message);
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await commit(mode, ticket, id, idea, checked.data);
      if (r.error) setMsg(r.error);
      else if (r.project) {
        router.push("/projects/" + r.project + "?tab=board");
      } else if (r.id) {
        setId(r.id);
        setMsg("Draft saved.");
        router.refresh();
      }
    } catch {
      setMsg("Could not confirm the change. Your edits are still here.");
    } finally {
      setBusy(false);
    }
  }
  function edit(fn: (p: Plan) => void) {
    if (!plan) return;
    const next = structuredClone(plan);
    fn(next);
    setPlan(next);
  }
  return (
    <>
      <section>
        <label>
          Your idea and preferences
          <textarea
            value={idea}
            maxLength={4000}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="What would you like to make? Include your subject, skills or time available."
          />
        </label>
        <small>
          Generating sends this text to Google Gemini. Your workspace files and
          chat stay private.
        </small>
        {!available && (
          <p>Gemini is not configured. You can write and save a manual plan.</p>
        )}
        {!plan && (
          <div className="row">
            <button
              disabled={!available || busy || idea.trim().length < 10}
              onClick={generate}
            >
              {busy ? "Planning…" : "Generate plan"}
            </button>
            <button disabled={busy} onClick={() => setPlan(blankPlan())}>
              Write a manual plan
            </button>
          </div>
        )}
      </section>
      {plan && (
        <fieldset disabled={busy}>
          <legend>Review your plan</legend>
          <section>
            {fields.map(([k, label]) => (
              <label key={k}>
                {label}
                <textarea
                  value={plan[k]}
                  onChange={(e) =>
                    edit((p) => {
                      p[k] = e.target.value;
                    })
                  }
                />
              </label>
            ))}
            <label>
              Project type
              <select
                value={plan.projectType}
                onChange={(e) =>
                  edit((p) => {
                    p.projectType = e.target.value as Plan["projectType"];
                  })
                }
              >
                {["academic", "coding", "idea"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={plan.difficulty}
                onChange={(e) =>
                  edit((p) => {
                    p.difficulty = e.target.value as Plan["difficulty"];
                  })
                }
              >
                {["beginner", "intermediate", "advanced"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {(["features", "suggestedTech"] as const).map((k) => (
              <label key={k}>
                {k === "features" ? "Key features" : "Suggested stack or tools"}{" "}
                (one per line)
                <textarea
                  value={plan[k].join("\n")}
                  onChange={(e) =>
                    edit((p) => {
                      p[k] = e.target.value.split("\n");
                    })
                  }
                />
              </label>
            ))}
          </section>
          {plan.milestones.map((m, i) => (
            <section key={i}>
              <h2>Milestone {i + 1}</h2>
              <label>
                Name
                <input
                  value={m.title}
                  onChange={(e) =>
                    edit((p) => {
                      p.milestones[i].title = e.target.value;
                    })
                  }
                />
              </label>
              <label>
                Milestone goal
                <textarea
                  value={m.description}
                  onChange={(e) =>
                    edit((p) => {
                      p.milestones[i].description = e.target.value;
                    })
                  }
                />
              </label>
              {m.tasks.map((t, j) => (
                <article key={j}>
                  <label>
                    Task {j + 1}
                    <input
                      value={t.title}
                      onChange={(e) =>
                        edit((p) => {
                          p.milestones[i].tasks[j].title = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Task details
                    <input
                      value={t.description}
                      onChange={(e) =>
                        edit((p) => {
                          p.milestones[i].tasks[j].description = e.target.value;
                        })
                      }
                    />
                  </label>
                  <button
                    disabled={m.tasks.length <= 2}
                    onClick={() =>
                      edit((p) => {
                        p.milestones[i].tasks.splice(j, 1);
                      })
                    }
                  >
                    Remove task
                  </button>
                </article>
              ))}
              <div className="row">
                <button
                  disabled={m.tasks.length >= 5}
                  onClick={() =>
                    edit((p) => {
                      p.milestones[i].tasks.push({
                        title: "",
                        description: "",
                      });
                    })
                  }
                >
                  Add task
                </button>
                <button
                  disabled={plan.milestones.length <= 3}
                  onClick={() =>
                    edit((p) => {
                      p.milestones.splice(i, 1);
                    })
                  }
                >
                  Remove milestone
                </button>
              </div>
            </section>
          ))}
          <div className="row">
            <button
              disabled={plan.milestones.length >= 6}
              onClick={() =>
                edit((p) => {
                  p.milestones.push(blankPlan().milestones[0]);
                })
              }
            >
              Add milestone
            </button>
            <button onClick={() => save("save")}>Save draft</button>
            <button onClick={() => save("create")}>
              Create private project
            </button>
          </div>
        </fieldset>
      )}
      <p role="status">{busy ? "Working…" : msg}</p>
    </>
  );
}
