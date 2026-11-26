import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { install } from "./database.mjs";
import { blankPlan, planSchema, ideaInput } from "../lib/plan.ts";
import { snapshotSchema } from "../lib/showcase.ts";
const plan = {
  title: "Campus water survey",
  summary: "Compare water access across campus.",
  projectType: "academic",
  problem: "Water access varies.",
  solution: "Survey the campus.",
  targetAudience: "Students",
  difficulty: "beginner",
  features: ["Student survey"],
  suggestedTech: ["Spreadsheet"],
  milestones: ["Design", "Collect", "Review"].map((title) => ({
    title,
    description: "Complete this stage.",
    tasks: ["Prepare", "Check"].map((t) => ({
      title: t,
      description: "Work with the team.",
    })),
  })),
};
const snap = {
  slug: "campus-water",
  title: "Our public findings",
  description: "A student survey of water access.",
  type: "academic",
  tags: ["research"],
  demo_url: "https://example.org/survey",
  github_url: null,
  cover_image: null,
};
test("plan and publication validators reject incomplete or unsafe input", () => {
  assert.ok(planSchema.safeParse(plan).success);
  assert.ok(!planSchema.safeParse(blankPlan()).success);
  assert.ok(
    !planSchema.safeParse({ ...plan, features: ["<script>x</script>"] })
      .success,
  );
  assert.ok(!ideaInput.safeParse({ idea: "short" }).success);
  assert.ok(
    !ideaInput.safeParse({ idea: "A genuine project", files: ["private"] })
      .success,
  );
  assert.ok(snapshotSchema.safeParse(snap).success);
  assert.ok(
    !snapshotSchema.safeParse({ ...snap, demo_url: "javascript:alert(1)" })
      .success,
  );
});
test("conversion, draft isolation, public snapshots, consent and withdrawal", async () => {
  const pg = new PGlite();
  try {
    await install(pg);
    const q = async (sql, args = []) => (await pg.query(sql, args)).rows;
    const as = async (id) => {
      await pg.exec("reset role;set role authenticated");
      await q("select set_config('brik.test_user',$1,false)", [id]);
    };
    const anon = async () => pg.exec("reset role;set role anon");
    const [owner, member, viewer, other] = Array.from({ length: 4 }, () =>
      randomUUID(),
    );
    for (const [i, id] of [owner, member, viewer, other].entries()) {
      await pg.exec("reset role");
      await q("insert into auth.users(id) values ($1)", [id]);
      await as(id);
      await q(
        "insert into profiles(username,display_name,bio,college) values ($1,$2,'About me','Private College')",
        ["student" + i, "Student " + i],
      );
    }
    await as(owner);
    const [{ id: d }] = await q(
      "insert into idea_plans(input_text,plan_json) values ('Private prompt',$1) returning id",
      [plan],
    );
    await as(other);
    assert.deepEqual(await q("select * from idea_plans"), []);
    const convert = (ticket, v, draft = null) =>
      q("select convert_idea($1,$2,$3) as id", [ticket, v, draft]);
    await assert.rejects(convert(randomUUID(), plan, d));
    await as(owner);
    const bad = structuredClone(plan);
    bad.milestones[2].tasks[1].title = " ";
    await assert.rejects(convert(randomUUID(), bad, d));
    assert.deepEqual(await q("select * from projects"), []);
    assert.equal((await q("select * from idea_plans")).length, 1);
    const ticket = randomUUID(),
      [{ id: p }] = await convert(ticket, plan, d);
    assert.equal((await convert(ticket, plan, d))[0].id, p);
    assert.equal((await q("select * from projects")).length, 1);
    assert.deepEqual(await q("select * from idea_plans"), []);
    assert.equal(
      (
        await q(
          "select * from tasks where status='todo' and assignee_id is null",
        )
      ).length,
      6,
    );
    assert.equal((await q("select * from milestones")).length, 3);
    assert.equal((await q("select reserve_ai_plan() as ok"))[0].ok, true);
    assert.equal((await q("select reserve_ai_plan() as ok"))[0].ok, false);
    await pg.exec("reset role");
    await q(
      "insert into project_members(project_id,user_id,role) values ($1,$2,'member'),($1,$3,'viewer')",
      [p, member, viewer],
    );
    await as(owner);
    await q(
      "insert into messages(project_id,body) values ($1,'private message')",
      [p],
    );
    await pg.exec("reset role");
    await q(
      "insert into storage.objects(bucket_id,name,metadata) values ('project-private',$1,'{\"size\":100}')",
      [p + "/" + owner + "/id/secret.txt"],
    );
    const publish = (s) => q("select set_showcase($1,$2)", [p, s]);
    await as(owner);
    await assert.rejects(publish(snap));
    await q("select approve_portfolio(array['bio'])");
    await anon();
    assert.deepEqual(await q("select slug from public_projects"), []);
    await assert.rejects(q("select reserve_ai_plan()"));
    await as(owner);
    await publish(snap);
    await q("update projects set title='Changed private title' where id=$1", [
      p,
    ]);
    await assert.rejects(q("select hide_portfolio()"));
    await as(viewer);
    await assert.rejects(publish(null));
    await assert.rejects(publish(snap));
    await as(member);
    await assert.rejects(publish(snap));
    await q("select approve_portfolio('{}')");
    await as(owner);
    await assert.rejects(
      q("insert into contributor_consents(project_id,user_id) values ($1,$2)", [
        p,
        member,
      ]),
    );
    await anon();
    assert.deepEqual(await q("select * from published_contributors"), []);
    assert.equal(
      (await q("select title from public_projects"))[0].title,
      snap.title,
    );
    assert.equal(
      (
        await q("select college from public_profiles where username='student0'")
      )[0].college,
      null,
    );
    for (const table of [
      "projects",
      "project_notes",
      "profiles",
      "tasks",
      "milestones",
      "project_invites",
      "messages",
      "project_members",
      "storage.objects",
      "idea_plans",
      "contributor_consents",
      "help_requests",
    ])
      await assert.rejects(q("select * from " + table));
    await assert.rejects(q("select project_id from public_projects"));
    await as(other);
    for (const table of [
      "projects",
      "project_notes",
      "tasks",
      "milestones",
      "messages",
      "storage.objects",
      "idea_plans",
      "project_members",
      "contributor_consents",
    ])
      assert.deepEqual(await q("select * from " + table), []);
    await assert.rejects(
      q("insert into contributor_consents(project_id) values ($1)", [p]),
    );
    await as(member);
    await q("insert into contributor_consents(project_id) values ($1)", [p]);
    await anon();
    assert.deepEqual(await q("select username from published_contributors"), [
      { username: "student1" },
    ]);
    await as(member);
    await q("delete from contributor_consents where project_id=$1", [p]);
    await anon();
    assert.deepEqual(await q("select * from published_contributors"), []);
    await as(member);
    await q("insert into contributor_consents(project_id) values ($1)", [p]);
    await as(owner);
    await q("select manage_member($1,$2,'remove')", [p, member]);
    await anon();
    assert.deepEqual(await q("select * from published_contributors"), []);
    await as(owner);
    await publish(null);
    await anon();
    assert.deepEqual(
      await q("select slug,cover_image from public_projects"),
      [],
    );
    await as(owner);
    await q("select hide_portfolio()");
    await anon();
    assert.deepEqual(
      await q("select username from public_profiles where username='student0'"),
      [],
    );
  } finally {
    await pg.close();
  }
});
