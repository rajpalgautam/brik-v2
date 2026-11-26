import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { install } from "./database.mjs";
test("explicit invitation acceptance, role changes, and student-only peer help", async () => {
  const pg = new PGlite();
  try {
    await install(pg);
    const [owner, viewer, member, peer, other] = Array.from({ length: 5 }, () =>
      randomUUID(),
    );
    const rows = async (sql, args = []) => (await pg.query(sql, args)).rows;
    const as = async (id) => {
      await pg.exec("reset role;set role authenticated");
      await rows("select set_config('brik.test_user',$1,false)", [id]);
    };
    for (const [i, id] of [owner, viewer, member, peer, other].entries()) {
      await pg.exec("reset role");
      await rows("insert into auth.users values ($1,$2,now())", [
        id,
        i + "@school.test",
      ]);
      await as(id);
      await rows("insert into profiles(username,display_name) values ($1,$2)", [
        "student" + i,
        "Student " + i,
      ]);
    }
    await as(owner);
    await rows(
      "insert into projects(title,type) values ('Design report','academic')",
    );
    const [{ id: p }] = await rows("select id from projects");
    const invite = async (
      role = "member",
      email = null,
      uses = 1,
      reply = null,
    ) => {
      const ticket = randomBytes(32).toString("hex"),
        hash = createHash("sha256").update(ticket).digest("hex");
      const [{ id }] = await rows(
        "select make_invite($1,$2,$3,$4,$5,$6) as id",
        [p, role, hash, email, uses, reply],
      );
      return { ticket, id };
    };
    const accept = (t) => rows("select accept_invite($1) as project", [t]);
    const preview = (t) => rows("select * from inspect_invite($1)", [t]);
    const count = async (id) =>
      (
        await rows("select uses_count from project_invites where id=$1", [id])
      )[0].uses_count;
    const link = await invite("viewer", null, 1),
      email = await invite("member", "2@school.test"),
      shared = await invite("member", null, 2);
    await assert.rejects(invite("owner"));
    await assert.rejects(invite("member", "2@school.test", 3));
    await as(viewer);
    assert.equal((await preview(link.ticket))[0].invite_role, "viewer");
    assert.deepEqual(await rows("select * from projects"), []);
    await assert.rejects(accept(email.ticket));
    await assert.rejects(invite());
    await assert.rejects(rows("select token_hash from project_invites"));
    assert.equal((await accept(link.ticket))[0].project, p);
    await accept(link.ticket);
    assert.deepEqual(await rows("select * from messages"), []);
    await assert.rejects(
      rows("insert into tasks(project_id,title) values ($1,'no')", [p]),
    );
    await assert.rejects(
      rows(
        "insert into help_requests(project_id,title,body) values ($1,'no','no')",
        [p],
      ),
    );
    await assert.rejects(
      rows("select manage_member($1,$2,'member')", [p, viewer]),
    );
    await as(peer);
    await assert.rejects(accept(link.ticket));
    await as(owner);
    assert.equal(await count(link.id), 1);
    await pg.exec("reset role");
    await rows("update auth.users set email_confirmed_at=null where id=$1", [
      member,
    ]);
    await as(member);
    await assert.rejects(accept(email.ticket));
    await pg.exec("reset role");
    await rows("update auth.users set email_confirmed_at=now() where id=$1", [
      member,
    ]);
    await as(member);
    await accept(email.ticket);
    await rows(
      "insert into messages(project_id,body) values ($1,'Team only')",
      [p],
    );
    await rows(
      "insert into tasks(project_id,title,assignee_id) values ($1,'Draft', $2)",
      [p, member],
    );
    await assert.rejects(
      rows(
        "insert into tasks(project_id,title,assignee_id) values ($1,'Invalid',$2)",
        [p, viewer],
      ),
    );
    await rows(
      "insert into help_requests(project_id,title,body) values ($1,'Review slides','How to clarify slide one?')",
      [p],
    );
    const [{ id: h }] = await rows("select id from help_requests");
    await as(peer);
    await rows(
      "insert into help_replies(request_id,body,kind) values ($1,'I can help','offer')",
      [h],
    );
    const [{ id: r }] = await rows("select id from help_replies");
    assert.deepEqual(await rows("select * from team_roster($1)", [p]), []);
    assert.deepEqual(await rows("select * from project_requests($1)", [p]), []);
    assert.equal(
      (await rows("select help_workspace($1) as id", [h]))[0].id,
      null,
    );
    assert.equal(
      (
        await rows(
          "update help_requests set closed=true where id=$1 returning id",
          [h],
        )
      ).length,
      0,
    );
    await assert.rejects(invite("member", null, 1, r));
    await as(owner);
    const comment = await invite("member", null, 1, r);
    const revoke = await invite(),
      expire = await invite();
    await rows("update project_invites set revoked_at=now() where id=$1", [
      revoke.id,
    ]);
    await pg.exec("reset role");
    await rows(
      "update project_invites set expires_at=now()-interval '1 second' where id=$1",
      [expire.id],
    );
    await as(other);
    await assert.rejects(accept(revoke.ticket));
    await assert.rejects(accept(expire.ticket));
    await assert.rejects(accept(comment.ticket));
    await assert.rejects(accept(comment.id));
    await as(peer);
    assert.deepEqual(await rows("select ticket from my_invitations()"), [
      { ticket: comment.id },
    ]);
    assert.deepEqual(await rows("select * from projects"), []);
    await accept(comment.id);
    assert.equal((await rows("select * from messages")).length, 1);
    await as(member);
    await rows("update help_requests set closed=true where id=$1", [h]);
    await as(other);
    await assert.rejects(
      rows(
        "insert into help_replies(request_id,body,kind) values ($1,'late','offer')",
        [h],
      ),
    );
    await as(owner);
    await rows("select manage_member($1,$2,'viewer')", [p, member]);
    await as(member);
    assert.deepEqual(await rows("select * from messages"), []);
    assert.equal(
      (await rows("select assignee_id from tasks"))[0].assignee_id,
      null,
    );
    await assert.rejects(
      rows("insert into messages(project_id,body) values ($1,'denied')", [p]),
    );
    await as(owner);
    await rows("select manage_member($1,$2,'remove')", [p, peer]);
    await as(peer);
    await assert.rejects(accept(comment.ticket));
    assert.deepEqual(await rows("select * from tasks"), []);
    await as(other);
    await accept(shared.ticket);
    await accept(shared.ticket);
    await as(peer);
    await accept(shared.ticket);
    await as(owner);
    assert.equal(await count(shared.id), 2);
    await pg.exec(
      "reset role; insert into realtime.messages values ('broadcast')",
    );
    await rows("select set_config('brik.topic',$1,false)", [p + "/chat"]);
    for (const [actor, expected] of [
      [owner, 1],
      [viewer, 0],
      [member, 0],
      [peer, 1],
    ]) {
      await as(actor);
      assert.equal(
        (await rows("select * from realtime.messages")).length,
        expected,
      );
    }
    await pg.exec("reset role;set role anon");
    await assert.rejects(preview(shared.ticket));
    await assert.rejects(accept(shared.ticket));
  } finally {
    await pg.close();
  }
});
