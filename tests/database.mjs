import { readFile } from "node:fs/promises";
export async function install(pg) {
  await pg.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create schema realtime;create table realtime.messages(extension text);alter table realtime.messages enable row level security;create function realtime.topic() returns text language sql as $$select current_setting('brik.topic',true)$$;grant usage on schema realtime to authenticated;grant select on realtime.messages to authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('brik.test_user',true),'')::uuid $$;
 grant usage on schema auth,storage to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,created_at timestamptz default now());
 alter table storage.objects enable row level security; grant select,delete,insert on storage.objects to authenticated;
 create publication supabase_realtime;`);
  for (const path of [
    "supabase/migrations/001_brik.sql",
    "supabase/migrations/002_phase2_teams_and_help.sql",
    "supabase/migrations/003_phase3_ideas_and_showcase.sql",
  ])
    await pg.exec(await readFile(path, "utf8"));
}
