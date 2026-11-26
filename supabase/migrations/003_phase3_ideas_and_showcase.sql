-- Brik v1: private idea drafts, atomic conversion, approved public snapshots.
begin;
create table public.idea_plans(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.profiles,input_text text not null check(length(input_text)<=4000),plan_json jsonb not null check(jsonb_typeof(plan_json)='object' and octet_length(plan_json::text)<=64000));
create table public.public_profiles(user_id uuid primary key default auth.uid() references public.profiles on delete cascade,username text unique not null,display_name text not null,bio text,skills text,avatar_url text,college text,course text,study_year int);
create table public.public_projects(id uuid primary key default gen_random_uuid(),project_id uuid unique not null references public.projects on delete cascade,portfolio_id uuid not null references public.public_profiles on delete cascade,slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),title text not null check(length(trim(title)) between 1 and 120),description text not null check(length(description)<=4000),type text not null check(type in ('academic','idea','coding')),tags text[] not null default '{}',demo_url text check(demo_url ~ '^https://'),github_url text check(github_url ~ '^https://github[.]com/[A-Za-z0-9-]+/[A-Za-z0-9_.-]+/?$'),cover_image text check(length(cover_image)<=700000 and cover_image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'),published_at timestamptz not null default now());
create table public.contributor_consents(project_id uuid references public.projects on delete cascade,user_id uuid default auth.uid() references public.profiles on delete cascade,primary key(project_id,user_id));
alter table public.idea_plans enable row level security;
revoke all on public.idea_plans from public,anon,authenticated;
alter table public.public_profiles enable row level security;
revoke all on public.public_profiles from public,anon,authenticated;
alter table public.public_projects enable row level security;
revoke all on public.public_projects from public,anon,authenticated;
alter table public.contributor_consents enable row level security;
revoke all on public.contributor_consents from public,anon,authenticated;
grant select,insert(input_text,plan_json),update(input_text,plan_json),delete on public.idea_plans to authenticated;
create policy own_plan on public.idea_plans to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on public.public_profiles to anon,authenticated;
create policy approved_profile on public.public_profiles for select using(true);
-- Approved fields are copied by a checked RPC verifying profile ownership and canonical username.
grant select(id,portfolio_id,slug,title,description,type,tags,demo_url,github_url,cover_image,published_at) on public.public_projects to anon,authenticated;
create policy published on public.public_projects for select using(true);
-- Publish and unpublish RPC must lock project, verify owner and copy only reviewed fields.
grant select,insert(project_id),delete on public.contributor_consents to authenticated;
create policy consent_read on public.contributor_consents for select to authenticated using(user_id=auth.uid() or brik_private.role_for(project_id)='owner');
create policy consent_add on public.contributor_consents for insert to authenticated with check(user_id=auth.uid() and brik_private.role_for(project_id) is not null);
create policy consent_remove on public.contributor_consents for delete to authenticated using(user_id=auth.uid());
create view public.published_contributors with (security_barrier=true) as
 select s.slug,f.username,f.display_name from public.public_projects s join public.contributor_consents c using(project_id) join public.public_profiles f on f.user_id=c.user_id join public.projects p on p.id=s.project_id
 where p.owner_id=c.user_id or exists(select from public.project_members m where m.project_id=s.project_id and m.user_id=c.user_id);
revoke all on public.published_contributors from public,anon,authenticated;
grant select on public.published_contributors to anon,authenticated;
create index on public.idea_plans(user_id);

-- Retain one receipt per conversion so retries cannot create a second project.
create table brik_private.idea_receipts (
 student uuid references public.profiles on delete cascade,
 ticket uuid not null, project uuid not null references public.projects on delete cascade,
 primary key(student,ticket)
);
create table brik_private.ai_usage(student uuid references public.profiles on delete cascade, requested_at timestamptz not null default now());
create index on brik_private.ai_usage(student,requested_at);
alter table brik_private.idea_receipts enable row level security;
alter table brik_private.ai_usage enable row level security;
revoke all on brik_private.idea_receipts,brik_private.ai_usage from public,anon,authenticated;

create function public.reserve_ai_plan() returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if not exists(select from public.profiles where id=actor) then return false; end if;
 perform pg_advisory_xact_lock(748203521);
 delete from brik_private.ai_usage where requested_at<now()-interval '1 day';
 if (select count(*) from brik_private.ai_usage)>=200 or
 (select count(*) from brik_private.ai_usage where student=actor)>=10 or
 exists(select from brik_private.ai_usage where student=actor and requested_at>now()-interval '30 seconds') then return false; end if;
 insert into brik_private.ai_usage(student) values(actor);
 return true;
end $$;

create function public.convert_idea(ticket uuid, plan jsonb, draft uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); pid uuid; mid uuid; m jsonb; t jsonb; n int:=0; pos int; k text; brief text;
begin
 perform 1 from public.profiles where id=actor for update;
 if not found or ticket is null then raise exception 'Profile required'; end if;
 select project into pid from brik_private.idea_receipts where student=actor and idea_receipts.ticket=convert_idea.ticket;
 if found then return pid; end if;
 if draft is not null then
 perform 1 from public.idea_plans where id=draft and user_id=actor for update;
 if not found then raise exception 'Draft unavailable';end if;end if;
 if plan is null or jsonb_typeof(plan)<>'object' or octet_length(plan::text)>64000 then raise exception 'Invalid plan';end if;
 foreach k in array array['title','summary','projectType','problem','solution','targetAudience','difficulty'] loop
 if jsonb_typeof(plan->k) is distinct from 'string' or length(trim(plan->>k)) not between 1 and 2000 then raise exception 'Invalid plan field';end if;end loop;
 if plan->>'difficulty' not in ('beginner','intermediate','advanced') then raise exception 'Invalid difficulty';end if;
 foreach k in array array['features','suggestedTech'] loop
 if jsonb_typeof(plan->k) is distinct from 'array' or jsonb_array_length(plan->k) not between 1 and 12 then raise exception 'Invalid list';end if;
 for t in select value from jsonb_array_elements(plan->k) loop
 if jsonb_typeof(t)<>'string' or length(trim(t#>>'{}')) not between 1 and 180 then raise exception 'Invalid list item';end if;end loop;end loop;
 if jsonb_typeof(plan->'milestones') is distinct from 'array' or jsonb_array_length(plan->'milestones') not between 3 and 6 then raise exception 'Use 3 to 6 milestones';end if;
 insert into public.projects(owner_id,title,summary,type) values(actor,plan->>'title',plan->>'summary',plan->>'projectType') returning id into pid;
 brief:=format('## Problem%s%s%s## Solution%s%s%s## Audience%s%s%s## Difficulty%s%s%s## Features%s%s%s## Suggested tools%s%s',
 chr(10),plan->>'problem',chr(10)||chr(10),chr(10),plan->>'solution',chr(10)||chr(10),chr(10),plan->>'targetAudience',chr(10)||chr(10),chr(10),plan->>'difficulty',chr(10)||chr(10),chr(10),(select string_agg(value,chr(10)) from jsonb_array_elements_text(plan->'features')),chr(10)||chr(10),chr(10),(select string_agg(value,chr(10)) from jsonb_array_elements_text(plan->'suggestedTech')));
 insert into public.project_notes(project_id,title,content_md) values(pid,'Reviewed idea plan',brief);
 for m in select value from jsonb_array_elements(plan->'milestones') loop
 if jsonb_typeof(m->'title') is distinct from 'string' or jsonb_typeof(m->'description') is distinct from 'string' or length(trim(m->>'description')) not between 1 and 500 then raise exception 'Invalid plan item';end if;
 if jsonb_typeof(m->'tasks') is distinct from 'array' or jsonb_array_length(m->'tasks') not between 2 and 5 then raise exception 'Use 2 to 5 tasks per milestone';end if;
 insert into public.milestones(project_id,title,description,position) values(pid,m->>'title',m->>'description',n) returning id into mid;
 pos:=0;
 for t in select value from jsonb_array_elements(m->'tasks') loop
 if jsonb_typeof(t->'title') is distinct from 'string' or jsonb_typeof(t->'description') is distinct from 'string' or length(trim(t->>'description')) not between 1 and 500 then raise exception 'Invalid plan item';end if;
 insert into public.tasks(project_id,milestone_id,title,description,position) values(pid,mid,t->>'title',t->>'description',n*5+pos);
 pos:=pos+1;end loop;n:=n+1;end loop;
 insert into brik_private.idea_receipts values(actor,ticket,pid);
 delete from public.idea_plans where id=draft and user_id=actor;
 return pid;
end $$;

-- Explicit portfolio approval copies only the selected fields of the caller.
create function public.approve_portfolio(fields text[]) returns text language plpgsql security definer set search_path='' as $$
declare u public.profiles;
begin
 select * into strict u from public.profiles where id=auth.uid() for update;
 insert into public.public_profiles values(u.id,u.username,u.display_name,
 case when 'bio'=any(fields) then u.bio end,case when 'skills'=any(fields) then u.skills end,
 case when 'avatar_url'=any(fields) then u.avatar_url end,case when 'college'=any(fields) then u.college end,
 case when 'course'=any(fields) then u.course end,case when 'study_year'=any(fields) then u.study_year end)
 on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,bio=excluded.bio,skills=excluded.skills,
 avatar_url=excluded.avatar_url,college=excluded.college,course=excluded.course,study_year=excluded.study_year;
 return u.username;
end $$;

create function public.owner_showcase(p uuid) returns table(slug text,title text,description text,type text,tags text[],demo_url text,github_url text,cover_image text)
language sql stable security definer set search_path='' as $$
 select s.slug,s.title,s.description,s.type,s.tags,s.demo_url,s.github_url,s.cover_image from public.public_projects s
 where s.project_id=p and brik_private.role_for(p)='owner'
$$;

create function public.set_showcase(p uuid, snapshot jsonb) returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); labels text[]; address text;
begin
 perform 1 from public.projects where id=p and owner_id=actor for update;
 if not found then raise exception 'Owner access required';end if;
 if snapshot is null then delete from public.public_projects where project_id=p;return null;end if;
 if not exists(select from public.public_profiles where user_id=actor) then raise exception 'Approve your portfolio first';end if;
 if jsonb_typeof(snapshot->'tags') is distinct from 'array' or jsonb_array_length(snapshot->'tags')>8 then raise exception 'Invalid tags';end if;
 select array(select jsonb_array_elements_text(snapshot->'tags')) into labels;
 if exists(select from unnest(labels) v where length(trim(v)) not between 1 and 32) then raise exception 'Invalid tag';end if;
 foreach address in array array[snapshot->>'demo_url',snapshot->>'github_url'] loop
 if address is not null and (length(address)>500 or address !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]]*)?$') then raise exception 'Invalid link';end if;end loop;
 insert into public.public_projects(project_id,portfolio_id,slug,title,description,type,tags,demo_url,github_url,cover_image)
 values(p,actor,snapshot->>'slug',snapshot->>'title',snapshot->>'description',snapshot->>'type',labels,snapshot->>'demo_url',snapshot->>'github_url',snapshot->>'cover_image')
 on conflict(project_id) do update set slug=excluded.slug,title=excluded.title,description=excluded.description,type=excluded.type,tags=excluded.tags,demo_url=excluded.demo_url,github_url=excluded.github_url,cover_image=excluded.cover_image;
 return snapshot->>'slug';
end $$;
alter table public.contributor_consents add foreign key(user_id) references public.public_profiles(user_id) on delete cascade;

-- Clear opt-in on removal, even if the student later rejoins.
create function brik_private.clear_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.contributor_consents where project_id=old.project_id and user_id=old.user_id;return old;end $$;
create trigger clear_consent after delete on public.project_members for each row execute function brik_private.clear_consent();
create index on public.public_projects(portfolio_id,published_at);
revoke all on function public.reserve_ai_plan(), public.convert_idea(uuid,jsonb,uuid),public.approve_portfolio(text[]),public.owner_showcase(uuid),public.set_showcase(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_ai_plan(), public.convert_idea(uuid,jsonb,uuid),public.approve_portfolio(text[]),public.owner_showcase(uuid),public.set_showcase(uuid,jsonb) to authenticated;
create function public.hide_portfolio() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.public_profiles where user_id=auth.uid() for update;
 if exists(select from public.public_projects where portfolio_id=auth.uid()) then raise exception 'Unpublish first';end if;
 delete from public.contributor_consents where user_id=auth.uid();
 delete from public.public_profiles where user_id=auth.uid();
end $$;
revoke all on function public.hide_portfolio() from public,anon,authenticated;
grant execute on function public.hide_portfolio() to authenticated;
commit;
