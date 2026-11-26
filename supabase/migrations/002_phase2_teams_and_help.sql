begin;
create table public.milestones(id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,title text not null check(length(trim(title)) between 1 and 120),description text default '' check(length(description)<=2000),position int not null default 0,unique(project_id,id));
create table public.tasks(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,milestone_id uuid,title text not null check(length(trim(title)) between 1 and 120),description text default '' check(length(description)<=2000),status text not null default 'todo' check(status in ('todo','in_progress','done')),priority text not null default 'normal' check(priority in ('low','normal','high')),position int not null default 0,assignee_id uuid references public.profiles,created_by uuid not null default auth.uid() references public.profiles,foreign key(project_id,milestone_id) references public.milestones(project_id,id) on delete set null (milestone_id));
create table public.messages(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,sender_id uuid not null default auth.uid() references public.profiles,body text not null check(length(trim(body)) between 1 and 3000),created_at timestamptz not null default now());
create table public.project_invites(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,created_by uuid not null default auth.uid() references public.profiles,role text not null check(role in ('member','viewer')),token_hash text unique not null,target_email text,expires_at timestamptz not null default now()+interval '7 days',max_uses int not null default 5 check(max_uses between 1 and 50),uses_count int not null default 0 check(uses_count between 0 and max_uses),revoked_at timestamptz,check(target_email is null or max_uses=1));
create table public.help_requests(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,author_id uuid not null default auth.uid() references public.profiles,title text not null check(length(trim(title)) between 1 and 120),body text not null check(length(trim(body)) between 1 and 3000),closed boolean not null default false,created_at timestamptz not null default now());
create table public.help_replies(id uuid primary key default gen_random_uuid(),request_id uuid not null references public.help_requests on delete cascade,author_id uuid not null default auth.uid() references public.profiles,body text not null check(length(trim(body)) between 1 and 2000),kind text not null check(kind in ('suggestion','resource','offer')),resource_url text check(resource_url ~ '^https://' and length(resource_url)<=500),created_at timestamptz not null default now());
alter table public.milestones enable row level security;
revoke all on public.milestones from public,anon,authenticated;
alter table public.tasks enable row level security;
revoke all on public.tasks from public,anon,authenticated;
alter table public.messages enable row level security;
revoke all on public.messages from public,anon,authenticated;
alter table public.project_invites enable row level security;
revoke all on public.project_invites from public,anon,authenticated;
alter table public.help_requests enable row level security;
revoke all on public.help_requests from public,anon,authenticated;
alter table public.help_replies enable row level security;
revoke all on public.help_replies from public,anon,authenticated;
grant select,insert(project_id,title,description,position),update(title,description,position),delete on public.milestones to authenticated;
create policy team_read on public.milestones for select to authenticated using(brik_private.role_for(project_id) is not null);
create policy team_edit on public.milestones for all to authenticated using(brik_private.role_for(project_id) in ('owner','member')) with check(brik_private.role_for(project_id) in ('owner','member'));
grant select,insert(project_id,title,description,milestone_id,status,priority,position,assignee_id),update(title,description,milestone_id,status,priority,position,assignee_id),delete on public.tasks to authenticated;
create policy team_read on public.tasks for select to authenticated using(brik_private.role_for(project_id) is not null);
create policy team_edit on public.tasks for all to authenticated using(brik_private.role_for(project_id) in ('owner','member')) with check(brik_private.role_for(project_id) in ('owner','member'));
create function brik_private.check_assignee() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=new.project_id for update;
 if new.assignee_id is not null and not exists(select from public.projects where id=new.project_id and owner_id=new.assignee_id) and not exists(select from public.project_members where project_id=new.project_id and user_id=new.assignee_id and role='member') then raise exception 'Invalid assignee'; end if; return new;
end $$;
create trigger assign before insert or update of assignee_id on public.tasks for each row execute function brik_private.check_assignee();
grant select,insert(project_id,body) on public.messages to authenticated;
create policy chat_read on public.messages for select to authenticated using(brik_private.role_for(project_id) in ('owner','member'));
create policy chat_send on public.messages for insert to authenticated with check(brik_private.role_for(project_id) in ('owner','member') and sender_id=auth.uid());
alter publication supabase_realtime add table public.messages;
grant select(id,project_id,target_email,role,expires_at,uses_count,max_uses,revoked_at) on public.project_invites to authenticated;
create policy invite_metadata on public.project_invites for select to authenticated using(brik_private.role_for(project_id)='owner');
-- Membership and invite writes are reserved for the checked transactional RPCs in Phase 2.
grant select(id,title,body,closed,created_at,author_id),insert(project_id,title,body),update(title,body,closed),delete on public.help_requests to authenticated;
create policy student_read on public.help_requests for select to authenticated using(true);
create policy team_post on public.help_requests for insert to authenticated with check(brik_private.role_for(project_id) in ('owner','member') and author_id=auth.uid());
create policy team_edit on public.help_requests for update to authenticated using(brik_private.role_for(project_id) in ('owner','member'));
create policy team_remove on public.help_requests for delete to authenticated using(brik_private.role_for(project_id) in ('owner','member'));
grant select,insert(request_id,body,kind,resource_url),delete on public.help_replies to authenticated;
create policy student_read on public.help_replies for select to authenticated using(true);
create policy student_reply on public.help_replies for insert to authenticated with check(author_id=auth.uid() and exists(select from public.help_requests where id=request_id and not closed));
create policy own_reply on public.help_replies for delete to authenticated using(author_id=auth.uid());
create index on public.messages(project_id,created_at);
create index on public.tasks(project_id,status,position);
create index on public.help_replies(request_id,created_at);
create index on public.help_requests(project_id);
create index on public.project_invites(project_id,expires_at);

alter table public.project_invites add created_at timestamptz not null default now(),
 add target_user uuid references public.profiles on delete cascade,
 add check(target_user is null or (target_email is null and max_uses=1));
create index on public.project_invites(created_by,created_at);
create table brik_private.redemptions(invite_id uuid references public.project_invites on delete cascade,
 student uuid references public.profiles on delete cascade, primary key(invite_id,student));
revoke all on brik_private.redemptions from public,anon,authenticated;
alter table brik_private.redemptions enable row level security;

create function public.make_invite(p uuid, desired_role text, fingerprint text, email_address text, allowed_uses int, reply uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare recipient uuid; new_id uuid;
begin
 perform 1 from public.projects where id=p and owner_id=auth.uid() for update;
 if not found then raise exception 'Owner access required'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if (select count(*) from public.project_invites where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Hourly invitation limit reached'; end if;
 if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' or desired_role not in ('viewer','member') then raise exception 'Invalid invitation'; end if;
 if email_address is not null and (length(email_address)>254 or email_address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'Invalid email'; end if;
 if reply is not null then
 select r.author_id into strict recipient from public.help_replies r join public.help_requests h on h.id=r.request_id where r.id=reply and h.project_id=p;
 if recipient=auth.uid() or exists(select from public.project_members where project_id=p and user_id=recipient) then raise exception 'Already on the team'; end if;
 end if;
 insert into public.project_invites(project_id,role,token_hash,target_email,target_user,max_uses)
 values(p,desired_role,fingerprint,lower(trim(email_address)),recipient,allowed_uses) returning id into new_id;
 return new_id;
end $$;

-- A commenter can open their account-bound invitation by ID. Other invitations require the secret.
create function public.inspect_invite(ticket text) returns table(invite_role text) language sql stable security definer set search_path='' as $$
 select i.role from public.project_invites i where auth.uid() is not null and
 (i.token_hash=encode(sha256(convert_to(ticket,'UTF8')),'hex') or (i.target_user=auth.uid() and i.id::text=ticket))
 and (i.target_user is null or i.target_user=auth.uid())
 and (i.target_email is null or exists(select from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=i.target_email))
 and i.revoked_at is null and i.expires_at>now() and i.uses_count<i.max_uses
$$;
create function public.accept_invite(ticket text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.project_invites; p uuid; actor uuid:=auth.uid();
begin
 select project_id into p from public.project_invites where token_hash=encode(sha256(convert_to(ticket,'UTF8')),'hex') or (target_user=actor and id::text=ticket);
 perform 1 from public.projects where id=p for update;
 select * into i from public.project_invites where project_id=p and (token_hash=encode(sha256(convert_to(ticket,'UTF8')),'hex') or (target_user=actor and id::text=ticket)) for update;
 if actor is null or i.id is null then raise exception 'Invitation unavailable'; end if;
 if exists(select from brik_private.redemptions where invite_id=i.id and student=actor) and brik_private.role_for(p) is not null then return p; end if;
 if not exists(select from public.inspect_invite(ticket)) or exists(select from brik_private.redemptions where invite_id=i.id and student=actor) then raise exception 'Invitation unavailable'; end if;
 if brik_private.role_for(p) is not null then return p; end if;
 insert into public.project_members(project_id,user_id,role) values(p,actor,i.role);
 insert into brik_private.redemptions values(i.id,actor);
 update public.project_invites set uses_count=uses_count+1 where id=i.id;
 return p;
end $$;
create function public.manage_member(p uuid, student uuid, new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p and owner_id=auth.uid() for update;
 if not found or student=auth.uid() then raise exception 'Owner access required'; end if;
 if new_role='remove' then delete from public.project_members where project_id=p and user_id=student;
 else update public.project_members set role=new_role where project_id=p and user_id=student; end if;
 if not found then raise exception 'Member unavailable'; end if;
 if new_role in ('remove','viewer') then update public.tasks set assignee_id=null where project_id=p and assignee_id=student; end if;
end $$;
grant update(revoked_at) on public.project_invites to authenticated;
create policy revoke_invite on public.project_invites for update to authenticated using(brik_private.role_for(project_id)='owner' and revoked_at is null) with check(brik_private.role_for(project_id)='owner' and revoked_at is not null);
create function public.team_roster(p uuid) returns table(student uuid,label text,team_role text) language sql stable security definer set search_path='' as $$
 select f.id,f.display_name,t.role from (select owner_id as id,'owner' as role from public.projects where id=p union all select user_id,role from public.project_members where project_id=p) t join public.profiles f using(id) where brik_private.role_for(p) is not null order by (t.role='owner') desc,f.display_name
$$;
create function public.project_requests(p uuid) returns table(id uuid,title text,closed boolean) language sql stable security definer set search_path='' as $$
 select h.id,h.title,h.closed from public.help_requests h where project_id=p and brik_private.role_for(p) is not null order by h.created_at desc
$$;
create function public.help_workspace(thread uuid) returns uuid language sql stable security definer set search_path='' as $$
 select project_id from public.help_requests where id=thread and brik_private.role_for(project_id) in ('member','owner')
$$;
create function public.thread_people(thread uuid) returns table(student uuid,label text) language sql stable security definer set search_path='' as $$
 select id,display_name from public.profiles where id in (select author_id from public.help_requests where id=thread union select author_id from public.help_replies where request_id=thread)
$$;
create function public.my_invitations() returns table(ticket uuid,invite_role text) language sql stable security definer set search_path='' as $$
 select id,role from public.project_invites where target_user=auth.uid() and revoked_at is null and expires_at>now() and uses_count<max_uses and brik_private.role_for(project_id) is null
$$;
revoke all on function public.make_invite(uuid,text,text,text,int,uuid),public.inspect_invite(text),public.accept_invite(text),public.manage_member(uuid,uuid,text),public.team_roster(uuid),public.project_requests(uuid),public.help_workspace(uuid),public.thread_people(uuid),public.my_invitations() from public,anon,authenticated;
grant execute on function public.make_invite(uuid,text,text,text,int,uuid),public.inspect_invite(text),public.accept_invite(text),public.manage_member(uuid,uuid,text),public.team_roster(uuid),public.project_requests(uuid),public.help_workspace(uuid),public.thread_people(uuid),public.my_invitations() to authenticated;
grant insert(id) on public.messages to authenticated;
create policy brik_chat_channel on realtime.messages for select to authenticated using(extension='broadcast' and split_part(realtime.topic(),'/',2)='chat' and brik_private.role_for(brik_private.path_project(realtime.topic())) in ('owner','member'));
-- Bound rapid writes at the database boundary, including direct authenticated clients.
create index on public.messages(sender_id,created_at);
create index on public.help_replies(author_id,created_at);
create index on public.help_requests(author_id,created_at);
create function brik_private.limit_student_posts() returns trigger language plpgsql security definer set search_path='' as $$
declare recent int;
begin
 perform 1 from public.profiles where id=auth.uid() for update;
 if tg_table_name='messages' then select count(*) into recent from public.messages where sender_id=auth.uid() and created_at>now()-interval '1 minute';
 elsif tg_table_name='help_requests' then select count(*) into recent from public.help_requests where author_id=auth.uid() and created_at>now()-interval '10 minutes';
 else
 perform 1 from public.help_requests where id=new.request_id and not closed for share;
 if not found then raise exception 'Request is closed'; end if;
 select count(*) into recent from public.help_replies where author_id=auth.uid() and created_at>now()-interval '1 minute';
 end if;
 if recent >= (case tg_table_name when 'messages' then 40 when 'help_requests' then 5 else 15 end) then raise exception 'Please try again later';end if;
 return new;
end $$;
create trigger limit_messages before insert on public.messages for each row execute function brik_private.limit_student_posts();
create trigger limit_requests before insert on public.help_requests for each row execute function brik_private.limit_student_posts();
create trigger limit_replies before insert on public.help_replies for each row execute function brik_private.limit_student_posts();
commit;
