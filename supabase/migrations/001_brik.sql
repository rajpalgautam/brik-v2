begin;
create schema if not exists brik_private;
revoke all on schema brik_private from public;
grant usage on schema brik_private to authenticated;
create table public.profiles (
 id uuid primary key default auth.uid() references auth.users on delete cascade,
 username text unique not null check(username ~ '^[a-z][a-z0-9_]{2,29}$'),
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 bio text not null default '' check(length(bio)<=500), college text check(length(college)<=100),
 course text check(length(course)<=100), study_year int check(study_year between 1 and 12),
 skills text not null default '' check(length(skills)<=300),
 avatar_url text check(avatar_url ~ '^https://' and length(avatar_url)<=500)
);
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.profiles,
 title text not null check(length(trim(title)) between 1 and 120),
 summary text not null default '' check(length(summary)<=4000),
 type text not null check(type in ('academic','coding','idea')),
 status text not null default 'planning' check(status in ('planning','active','completed')),
 github_url text check(github_url ~ '^https://github[.]com/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+/?$'),
 updated_at timestamptz not null default now()
);
create table public.project_members (
 project_id uuid references public.projects on delete cascade, user_id uuid references public.profiles on delete cascade,
 role text not null check(role in ('member','viewer')), joined_at timestamptz default now(), primary key(project_id,user_id)
);
create index on public.projects(owner_id);
create index on public.project_members(user_id);
create function brik_private.role_for(p uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select from public.projects where id=p and owner_id=auth.uid()) then 'owner'
 else (select role from public.project_members where project_id=p and user_id=auth.uid()) end
$$;
revoke all on function brik_private.role_for(uuid) from public;
grant execute on function brik_private.role_for(uuid) to authenticated;
create table public.project_notes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 title text not null check(length(trim(title)) between 1 and 120), content_md text not null check(length(content_md)<=20000),
 updated_by uuid not null default auth.uid() references public.profiles, updated_at timestamptz not null default now()
);
create function brik_private.stamp() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); if tg_table_name='project_notes' then new.updated_by=auth.uid(); end if; return new; end $$;
create trigger stamp before update on public.project_notes for each row execute function brik_private.stamp();
create trigger stamp before update on public.projects for each row execute function brik_private.stamp();
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_notes enable row level security;
revoke all on public.profiles,public.projects,public.project_members,public.project_notes from public,anon,authenticated;
grant select,insert(username,display_name,bio,college,course,study_year,skills,avatar_url),update(username,display_name,bio,college,course,study_year,skills,avatar_url) on public.profiles to authenticated;
create policy own_profile on public.profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant select,insert(title,summary,type,status,github_url),update(title,summary,type,status,github_url),delete on public.projects to authenticated;
create policy project_read on public.projects for select to authenticated using(brik_private.role_for(id) is not null);
create policy project_create on public.projects for insert to authenticated with check(owner_id=auth.uid());
create policy project_edit on public.projects for update to authenticated using(brik_private.role_for(id) in ('owner','member'));
create policy project_delete on public.projects for delete to authenticated using(owner_id=auth.uid());
grant select on public.project_members to authenticated;
create policy members_read on public.project_members for select to authenticated using(brik_private.role_for(project_id) is not null);
grant select,insert(project_id,title,content_md),update(title,content_md),delete on public.project_notes to authenticated;
create policy note_read on public.project_notes for select to authenticated using(brik_private.role_for(project_id) is not null);
create policy note_write on public.project_notes for all to authenticated using(brik_private.role_for(project_id) in ('owner','member')) with check(brik_private.role_for(project_id) in ('owner','member'));
create index on public.project_notes(project_id);
-- Storage is the file catalog. Never duplicate metadata or create orphan catalog entries.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('project-private','project-private',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg','image/webp','text/plain','text/markdown','text/csv']);
create function brik_private.path_project(path text) returns uuid language sql immutable set search_path='' as $$
 select case when split_part(path,'/',1) ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then split_part(path,'/',1)::uuid end $$;
create policy brik_file_read on storage.objects for select to authenticated using(bucket_id='project-private' and brik_private.role_for(brik_private.path_project(name)) is not null);
create policy brik_file_remove on storage.objects for delete to authenticated using(bucket_id='project-private' and brik_private.role_for(brik_private.path_project(name)) in ('owner','member'));
-- Server validates content before uploading. The trigger rechecks the actor, role and actual quota.
create function brik_private.file_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid; actor uuid; used bigint;
begin
 if new.bucket_id <> 'project-private' then return new; end if;
 p=brik_private.path_project(new.name); actor=split_part(new.name,'/',2)::uuid;
 perform 1 from public.projects where id=p and (owner_id=actor or exists(select from public.project_members where project_id=p and user_id=actor and role='member')) for update;
 if not found then raise exception 'Workspace access changed'; end if;
 select coalesce(sum((metadata->>'size')::bigint),0) into used from storage.objects where bucket_id=new.bucket_id and name like p::text||'/%' and id<>new.id;
 if used+coalesce((new.metadata->>'size')::bigint,0)>104857600 then raise exception 'Workspace storage is full'; end if;
 return new;
end $$;
create trigger brik_file_guard before insert or update on storage.objects for each row execute function brik_private.file_guard();
create function public.workspace_files(p uuid) returns table(path text, bytes bigint, uploaded_at timestamptz) language sql stable security invoker set search_path='' as $$
 select name,(metadata->>'size')::bigint,created_at from storage.objects where bucket_id='project-private' and name like p::text||'/%' order by created_at desc $$;
revoke all on function public.workspace_files(uuid) from public,anon;
grant execute on function public.workspace_files(uuid) to authenticated;
-- Prevent project deletion until Storage API has removed the files.
create function brik_private.empty_project() returns trigger language plpgsql security definer set search_path='' as $$
begin if exists(select from storage.objects where bucket_id='project-private' and name like old.id::text||'/%') then raise exception 'Remove files first'; end if; return old; end $$;
create trigger check_files before delete on public.projects for each row execute function brik_private.empty_project();
commit;
