# Real Jobs from CRM + Fully-Wired Detail Page

## Goal

- **Jobs = deals in the "Jobs Pipeline"**. Capacity calendar, jobs list, my-assignments, and job detail all read from `deals` filtered to that pipeline. The standalone `jobs` seed table is retired.
- **Job detail page** shows only real data from the DB (progress, milestones, on-site crew, contractor assignments, notes, blockers, billing readiness), no mock arrays.

## Data model changes

Everything downstream currently keys off `jobs.id` (UUID). Rather than rewriting every FK, we treat a **deal in the Jobs Pipeline** as the job, and change the code so `jobId` throughout the app = `deal.id`. Existing tables that reference `jobs(id)` are re-pointed to `deals(id)`.

Migration:

1. Drop FKs from `schedules.job_id`, `job_contractor_assignments.job_id`, `job_milestones.job_id`, `job_progress_updates.job_id`, `billing_reports.job_id` to `jobs(id)`. Re-add them pointing to `deals(id) ON DELETE CASCADE`.
2. Delete all rows in `schedules`, `job_contractor_assignments`, `job_milestones`, `job_progress_updates`, `billing_reports` first (they reference seed job IDs; there's no way to remap). This wipes calendar entries, contractor assignments, milestones, progress logs, and billing rows. **This is destructive — confirm before running.**
3. Drop the `jobs` table.
4. Create `job_notes` (deal_id, author_id, body, created_at) and `job_blockers` (deal_id, kind, label, body, tone, resolved_at) with RLS + GRANTs.
5. Add helper columns to `deals` if missing: `hours_worked numeric`, `completion_percentage int`, `billing_status text`, `assigned_crew_id uuid`, `supervisor_id uuid`, `start_date date`, `target_finish_date date`. (Several already exist as target_hours/actual_hours — we map to those.)

## Field mapping (deal → job view)

| Job field | Deal source |
|---|---|
| Job code | `deals.quote_id` (or synthesized `D-{short id}` fallback) |
| Job name | `deals.description` truncated, or `deals.client_name + ' — ' + category` |
| Client | `deals.client_name` |
| Client contact | `deals.contact_person`, `phone`, `email` |
| Address | `deals.property_address` |
| Status | `pipeline_stages.name` for `deals.pipeline_stage_id` (only Jobs Pipeline) |
| Estimated hours | `deals.target_hours` |
| Hours worked | `deals.actual_hours` |
| Contract value | `deals.expected_value` |
| Start / finish | `deals.start_date` / `deals.target_finish_date` (new columns) |

Calendar filter: `deals.pipeline_id = <Jobs Pipeline id>` AND stage not in Completed/On Hold/All Done & Paid (configurable later).

## Code changes

`src/lib/db.ts`
- Replace `jobsQuery` with `jobsQuery = deals in Jobs Pipeline`, returning a `JobRow`-shaped DTO built from deal + stage name so components don't need to change field names.
- Replace `jobByIdQuery(id)` — look up deal by id or by quote_id.
- Add `jobMilestonesQuery(dealId)`, `jobNotesQuery(dealId)`, `jobBlockersQuery(dealId)`, `jobOnsiteCrewQuery(dealId)` (staff whose crew = deal.assigned_crew_id).
- Add mutations: `addJobNote`, `resolveJobBlocker`, `addJobBlocker`, `toggleMilestone`, `updateJobProgress`.
- Update `schedulesQuery`, `myAssignmentsQuery`, contractor-assignment queries so `job_id` = deal id.

`src/routes/capacity.tsx`, `src/routes/jobs.tsx`, `src/routes/jobs_.$jobId.tsx`, `src/components/MyAssignmentsPanel.tsx`, `src/components/ContractorAssignmentsCard.tsx`
- Keep the `JobRow` shape and links (`/jobs/$jobId` with jobId = deal id or quote_id). Minimal component-level changes.
- Job detail page: remove `milestonesData`, `crewMembers`, `timeline`, `notes`, `blockers` constants. Replace with live queries + edit forms (add note, add/resolve blocker, tick milestone, update %).

## Out of scope (this pass)

- "Convert deal to job" UI in CRM — a deal enters the Jobs Pipeline via the existing pipeline change; no new button needed.
- Timeline events (job started / weather delay / coat complete) — those were mock only; keep the section hidden until you design a real "job events" feed.
- Historical seed data preservation — the current 6 seed jobs and their schedules/assignments will be wiped.

## Rollout order (single approval per migration)

1. Migration A: add `job_notes`, `job_blockers`, new deal columns.
2. Migration B (destructive): wipe dependent rows, re-point FKs to `deals`, drop `jobs` table.
3. Code refactor in `db.ts` and consuming components.
4. Verify capacity calendar renders deals in Jobs Pipeline, job detail loads live data end-to-end.
