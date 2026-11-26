# Brik

## Start with Google Sheets

Follow [the Sheets setup guide](sheets/README.md) to deploy the tracker. This repository already includes the homepage change. In Vercel set BRIK_SHEETS_APP_URL to your deployed Google Apps Script URL ending in /exec and redeploy. Without this variable the homepage opens the original Supabase workspace described below.

Brik v1 is a student workspace for private projects, team collaboration, peer help, AI planning and opt-in public portfolios. Use Google or an email magic link, choose a username, create an academic, coding or idea project, and keep its notes, repository link and files together.

## Install or upgrade the database

Run each missing migration **once**, in order, in the Supabase SQL Editor as the project database owner.

| Starting point | Migrations in supabase/migrations |
|---|---|
| New Supabase project | 001_brik.sql → 002_phase2_teams_and_help.sql → 003_phase3_ideas_and_showcase.sql |
| Phase 1 already installed | 002_phase2_teams_and_help.sql → 003_phase3_ideas_and_showcase.sql |
| Phase 2 already installed | 003_phase3_ideas_and_showcase.sql |

Migration 001 creates the private project bucket and its Storage policies. Migration 002 adds collaboration tables, Realtime channel access and the messages publication. In Supabase, enable Realtime for the project and verify public.messages is in supabase_realtime. Migration 003 adds private drafts, atomic project conversion, generation limits, public snapshots, portfolio fields and contributor consent. Use the project's existing Auth, Storage and Realtime schemas. Keep brik_private outside the exposed API schemas.

For email invitations, set server-only `RESEND_API_KEY` and `INVITE_EMAIL_FROM` to a Resend key and a sender on your verified domain. Keep `NEXT_PUBLIC_APP_URL` set to the canonical app origin. If the provider is unavailable, the Owner sees a delivery status and an email-bound private link. Configure your host to redact invite paths from access logs and exclude them from analytics. Application code logs no invitation tokens.

## Run locally on Windows or macOS

Install Node 24 LTS and open a terminal in the extracted brik folder. On Windows use PowerShell.

```powershell
npm ci
Copy-Item .env.example .env.local
```

On macOS use Terminal.

```sh
npm ci
cp .env.example .env.local
```

1. Create or select your Supabase project and apply the migrations from the table above.
2. In Project Settings → API Keys, copy the project URL and publishable key into their corresponding .env.local entries. Put the server-only service role key in SUPABASE_SERVICE_ROLE_KEY. It is used only for uploads, after file validation and user access checks. Use a fresh project so unrelated permissive Storage policies cannot overlap the Brik bucket.
3. In Authentication → URL Configuration, set Site URL to http://localhost:3000 and allow http://localhost:3000/auth/callback and http://localhost:3000/auth/confirm. Set NEXT_PUBLIC_APP_URL to the same origin without the trailing slash.
4. Enable Email in Auth providers. Configure SMTP for real students and set the Magic Link email template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Keep Auth rate limits enabled. Supabase accepting a send request is distinct from inbox delivery.
5. Create a Google web OAuth client. Copy the callback shown in Supabase's Google provider settings into Google's authorized redirect URIs. Put the Google client ID and secret in Supabase and enable the provider. Brik receives the resulting auth code at /auth/callback.
6. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). In .env.local set GEMINI_API_KEY and optionally GEMINI_MODEL. The default is gemini-3.5-flash-lite. Enable API access and the required quota for the selected model on your Google project. Keep the API key server-only. Without a key students can still write a manual plan, save a private draft and create a project.
7. Run these commands on either platform. Restart the dev server after editing .env.local.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run dev
```

Open http://localhost:3000. For production, import this folder into a Next.js-compatible host such as Vercel, set the corresponding public and server-only variables there before building, and update the origin and redirect allowlist in Supabase. Never commit .env.local or put the service key in a NEXT_PUBLIC variable.

## Routes

| Phase | Routes | Purpose |
|---|---|---|
| 1 | /, /login, /auth/callback, /auth/confirm | Sign in and restore the session |
| 1 | /onboarding, /settings/profile | Private profile, optional avatar URL, college, course, study year and skills |
| 1 | /dashboard | Search and filter owned and shared projects |
| 1 | /projects/[id]?tab=overview, files, notes or settings | Private files, Markdown notes, GitHub link and working details |
| 2 | /projects/[id]?tab=board, chat, members or help | Tasks and milestones, persistent chat, invitations and help requests |
| 2 | /invite/[token], /help, /help/[id] | Explicit invite acceptance and student-only peer help |
| 3 | /ideas, POST /api/ai/plan | Server-only Gemini generation, private drafts and reviewed conversion |
| 3 | /p/[slug], /u/[username] | Approved showcase snapshots and portfolios |

**Folder map.** app/ contains routes, native forms and server actions. lib/ contains the request-scoped Supabase client and file validation. proxy.ts refreshes sessions. supabase/migrations/ contains installable SQL.  tests/ contains the upload and role checks.

## Access decisions

The project is also its team. projects.owner_id is the single Owner. project_members represents accepted Member and Viewer grants. Invitations and community replies never create grants on their own. Notes have a database-maintained author and update time. The Storage object is the file record, with its project, uploader, generated ID and filename encoded in its private path. Downloads use a 60-second signed URL. Remove files before deleting a project. Uploads are limited to 10 MiB each and 100 MiB per project. A database trigger checks actual stored sizes and serializes writes against the project row. Native downloads and sanitized Markdown are the only content presentation paths.

| Data | Read | Change |
|---|---|---|
| Private overview, files, notes, board | Accepted Owner, Member, Viewer | Owner and Member. Project deletion is Owner-only |
| Persistent Realtime chat | Owner and Member | Owner and Member send as themselves |
| Profile and AI drafts | Author | Author |
| Invite metadata | Owner | Owner-controlled transaction. Redemption validates the authenticated recipient |
| Peer-help request | Signed-in students see the posted fields | Owner or Member of the source project |
| Community reply, resource or offer | Signed-in students | Student posts as themselves on an open request, can remove their own reply |
| Public portfolio and showcase | Anyone | Explicit profile approval, Owner-only project publish/unpublish |
| Contributor appearance | Anyone on the published page | Contributor opts in personally, current team membership required |

The SQL uses column grants as well as row policies. Community readers request explicit help columns, excluding the private project ID. Showcase readers request approved fields, excluding the private project ID. No public route loads a private project and filters it in the browser.

## Using Teams and Peer Help

- **Members** lists accepted teammates. Owners manage roles, remove students, create invitations and revoke active links. Shareable links default to five uses over seven days. Email invitations are single-use and check the verified account email. Opening an invitation shows the role. Only pressing Accept joins the team.
- **Board** has three columns. Open Edit or move to change a task’s column, priority, assignee, milestone or position. Keyboard controls work on mobile and desktop.
- **Chat** loads recent persisted messages first, then subscribes to private Supabase Realtime changes. Load older messages on demand. Only Owners and Members can open or send to chat.
- **Project Help** lets an Owner or Member ask a question visible to signed-in students. Only the submitted text is shared. In Peer Help, students can suggest a fix, share an HTTPS resource or offer to collaborate. Owners or Members can resolve the request to close replies.
- **Invite this student** on a reply sends an account-bound invitation to the commenter's Peer Help inbox. They use the same review and acceptance screen, without revealing their email address. Both creation and acceptance recheck authorization inside the database.

## Idea Lab and public pages

In Idea Lab, enter an idea, subject, skill level or time constraint. Gemini receives only this text. The single POST /api/ai/plan endpoint verifies sign-in, caps input at 4,000 characters, reserves quota in PostgreSQL and validates the structured response. A student can request one generation per 30 seconds, ten per rolling day, with an app-wide cap of 200 requests per rolling day. A provider failure uses one reservation. Output is bounded to 8,192 tokens. Provider-side spending controls can be set in the Google project.

Review the title, type, summary, audience, problem, solution, difficulty, features, tools and 3–6 milestones. Edit, add or remove tasks (2–5 per milestone). Save draft keeps the plan private. Create private project saves the reviewed overview and a private planning note, populates ordered milestones with unassigned To Do tasks and opens the Board. The database transaction rolls back on failure. Retrying the same creation request returns the original project.

In My profile, publish the name and username you want to share. Check each optional profile field to include and use Update approved profile after changing private details. The shareable address is /u/your-username. Each teammate can choose contributor credit in Project → Showcase. Credit requires a published profile, current team membership and personal opt-in.

The project Owner writes a separate public title, summary, type and tags, optionally adds HTTPS demo/GitHub links and chooses a new cover image. Preview the snapshot, then confirm publication. A cover is a separately selected PNG, JPEG or WebP up to 512 KiB, stored with the snapshot. The public pages query approved records using an anonymous client with uncached reads. Later private edits do not change the snapshot. Unpublish removes the page and its cover, while the private project remains available to the team. To take down a portfolio, unpublish its owned showcases first, then choose Hide portfolio in profile settings.

## Checks

npm test executes the SQL on embedded PostgreSQL with small Supabase auth and storage stand-ins. It loads all three migrations, switches database roles and identities, and checks private reads, chat denial, forged writes, file visibility, revocation, signed-in peer replies and anonymous column restrictions. It also checks rejected uploads and plan formats, conversion rollback and replay, generation throttling, approved-field publication, contributor withdrawal and unpublishing. These checks do not exercise hosted Auth, mail delivery or the Storage HTTP service.

With a configured Supabase project, verify both sign-in methods with separate accounts, unused and duplicate usernames, persistence after reload, project filters, Markdown escaping, valid document upload, file download and expiry, oversized/renamed binary rejection, deletion confirmation and direct project URL denial for the second account. Confirm at phone width and with keyboard-only navigation. For live Phase 2 QA, use separate Owner, Member, Viewer and outside-student accounts. Check email delivery and private-link acceptance through login and onboarding. Open two browsers on Chat and verify delivery, reconnection and role revocation. Post a help request, reply from the outside account, send a commenter invitation and verify the outsider sees private data only after acceptance. For live Phase 3 QA, generate a Gemini plan, edit a task, save/reopen the draft and create a project. Check that the Board matches the edits. Preview and publish a sample showcase, view it in a signed-out window, toggle a contributor credit and finally unpublish. Check that the public URL returns a missing-page response after removal.
