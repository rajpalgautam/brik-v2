import { install } from "./database.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { PGlite } from "@electric-sql/pglite";
test("private workspace, community and public snapshot permissions", async () => {
  const pg = new PGlite();
  try {
    await install(pg);

    const ids = Array.from(
      { length: 4 },
      (_, i) => "00000000-0000-4000-8000-00000000000" + i,
    );
    const [owner, member, viewer, peer] = ids;
    const act = async (id) =>
      pg.exec(
        "reset role; set role authenticated; set brik.test_user='" + id + "'",
      );
    const rows = async (sql) => (await pg.query(sql)).rows;
    for (const [i, id] of ids.entries()) {
      await pg.exec("reset role; insert into auth.users values ('" + id + "')");
      await act(id);
      await pg.exec(
        "insert into profiles(username,display_name) values ('student" +
          i +
          "','Student')",
      );
    }
    await act(owner);
    await pg.exec(
      "insert into projects(title,type) values ('Private thesis','academic')",
    );
    const [{ id: p }] = await rows("select id from projects");
    await pg.exec(`reset role; insert into project_members(project_id,user_id,role) values ('${p}','${member}','member'),('${p}','${viewer}','viewer');
 insert into storage.objects(bucket_id,name,metadata) values ('project-private','${p}/${owner}/test/notes.txt','{"size":40}');`);
    await act(member);
    await pg.exec(`insert into project_notes(project_id,title,content_md) values ('${p}','Research','secret');
 insert into messages(project_id,body) values ('${p}','private chat');
 insert into tasks(project_id,title) values ('${p}','Review');
 insert into help_requests(project_id,title,body) values ('${p}','Slide feedback','Review my public summary');`);
    const [{ id: h }] = await rows("select id from help_requests");
    await act(viewer);
    assert.equal((await rows("select * from messages")).length, 0);
    assert.equal((await rows("select * from tasks")).length, 1);
    assert.equal(
      (await rows(`select * from workspace_files('${p}')`)).length,
      1,
    );
    await assert.rejects(
      pg.exec(`insert into messages(project_id,body) values ('${p}','bad')`),
    );
    await assert.rejects(
      pg.exec(
        `insert into project_notes(project_id,title,content_md) values ('${p}','bad','bad')`,
      ),
    );
    await act(peer);
    await pg.exec(
      `insert into help_replies(request_id,body,kind) values ('${h}','I can review','offer')`,
    );
    for (const t of [
      "projects",
      "project_notes",
      "tasks",
      "messages",
      "project_members",
      "storage.objects",
    ])
      assert.deepEqual(await rows("select * from " + t), []);
    await assert.rejects(pg.exec("select project_id from help_requests"));
    await assert.rejects(
      pg.exec(
        `insert into project_members values ('${p}','${peer}','member',now())`,
      ),
    );
    await act(member);
    await assert.rejects(pg.exec(`update projects set owner_id='${member}'`));
    await pg.exec(
      `reset role;delete from project_members where user_id='${member}'`,
    );
    await act(member);
    assert.deepEqual(await rows("select * from messages"), []);
    await pg.exec("reset role; set role anon");
    await assert.rejects(pg.exec("select id from help_requests"));
    await assert.rejects(pg.exec("select * from projects"));
    assert.deepEqual(await rows("select slug from public_projects"), []);
    await assert.rejects(pg.exec("select project_id from public_projects"));
  } finally {
    await pg.close();
  }
});
