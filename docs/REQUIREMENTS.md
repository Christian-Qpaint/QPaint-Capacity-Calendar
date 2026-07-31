# QPaint Operations Platform (QOP) — Requirements

> **Source of truth.** Imported from `LOVABLE - Command Center.pdf` (v1.0 Draft, 30 Jun 2026).
> All future feature work in this project must conform to this document. When the doc and the app
> disagree, the doc wins unless explicitly overridden by the user in chat.
>
> **PDF parser cap.** The upload's first 50 pages were extracted. Section
> `05_UI_UX_GUIDELINES.md` onward (UI/UX, Roles & Permissions, AI Spec, API Integrations,
> Reporting & Analytics, Roadmap, Changelog) was beyond the cap and is **not yet captured here** —
> re-upload those pages separately to extend this file.

---

## 0. Product Vision

QOP is the **central operating system** for QPaint — not a CRM. It consolidates sales, planning,
scheduling, workforce management, execution, reporting, finance, and AI into one app, replacing
PipeDrive, Tom's Planner, CrewTraka, Excel sheets, and ad-hoc docs.

### Vision & mission
- Most intelligent ops platform for painting / construction.
- Manage every project's full lifecycle from enquiry → scheduling → execution → reporting → closure.
- Reduce manual processes, duplicated data, missed deadlines; improve utilization, forecasting,
  profitability, and real-time visibility.

### Product goals
1. **Single source of truth** — one record per fact, no conflicts across systems.
2. **Replace multiple apps** — PipeDrive, Tom's Planner, CrewTraka, Excel, manual reports.
3. **Operational visibility** — what jobs exist, what's scheduled, who's available, who's
   overloaded, what's delayed, where money is lost, current capacity.
4. **Capacity-driven operations** — every assignment considers hours, skills, workload, equipment,
   conflicts, priority. Capacity planning is the core capability.
5. **AI-assisted business** — summaries, capacity forecasts, scheduling recommendations, delay
   prediction, profitability analysis, workload balancing, natural-language reporting. AI assists,
   never replaces human decision-makers.

### Product philosophy
- **Operations first.** CRM feeds operations.
- **Scheduling is the engine.** CRM → Jobs → Scheduling → Execution → Reporting → Analytics.
- **Data before opinion.** Surface metrics before users ask.
- **Automation by default** (Jobs, Work Orders, notifications, capacity calc, progress, KPIs).
- **AI everywhere** — Dashboard, Jobs, Scheduling, Reporting, Capacity, CRM, Finance.

### Target users
Executive Management, Operations Manager, Scheduler, Supervisor, Field Employee, Sales, Finance.

### Scope
- **In:** CRM, Companies, Contacts, Jobs, Work Orders, Scheduling, Capacity Planning, Teams,
  Employees, Resources, Finance KPIs, Reporting, AI Assistant, Notifications, Dashboards,
  Automations.
- **Out (current):** Payroll, full accounting, inventory, procurement, HR recruitment, asset
  depreciation, public customer portal, marketing automation, e-commerce, manufacturing.

### Guiding principle
**Build once. Scale forever.** Every architectural decision favours maintainability,
extensibility, and operational excellence over short-term convenience.

---

## 1. Functional Requirements

### Primary modules
Dashboard · CRM · Companies · Contacts · Opportunities · Jobs · Work Orders · Scheduling ·
Capacity Planning · Teams · Employees · Resources · Finance · Reporting · AI Assistant ·
Notifications · Settings.

### Global requirements (per module where applicable)
Global Search, Saved Filters, Sorting, Column Visibility, Bulk Actions, Export, Import, Activity
Timeline, Attachments, Notes, Mentions, Comments, Audit History, AI Actions, Mobile
Responsiveness, Dark Mode (future), Role-Based Permissions.

### Dashboard
Real-time business overview. Configurable widgets: Jobs Today, Jobs This Week, Active
Opportunities, Revenue, Gross Profit, Labour Utilization, Capacity Utilization, Team Workload,
Delayed Jobs, Overdue Tasks, Resource Availability, Upcoming Milestones, AI Insights. Users can
rearrange / resize / hide / save layouts.

### CRM
Companies, Contacts, Opportunities, Activities, Emails, Phone Calls, Meetings, Quotes, Documents,
Attachments. Each opportunity: pipeline, stage, probability, estimated revenue, expected close
date, owner. **Winning an opportunity must auto-create a Job.**

### Companies
Name, Industry, ABN, Billing Address, Site Addresses, Contacts, Notes, Files, Opportunities,
Jobs, Financial Summary.

### Contacts
First/Last Name, Company, Position, Email, Phone, Mobile, Preferred Contact Method, Notes,
Communication History.

### Jobs
Central operational entity.
- **General:** Job Number, Title, Description, Status, Priority, Customer, Site, Supervisor.
- **Planning:** Planned Start, Planned Finish, Estimated Hours / Cost / Revenue.
- **Execution:** Actual Start, Actual Finish, Actual Hours / Cost / Revenue.
- **Operations:** Assigned Team, Sub Team, Resources, Required Skills.
- **Progress:** Percentage Complete, Risks, Issues, Milestones, Dependencies.
- **Financial:** Budget, Variance, Profit, Margin.
- **Views:** Table, Kanban, Calendar, Timeline, Gantt, Map (future).
- **Actions:** Create, Duplicate, Archive, Schedule, Assign Team / Resources, Upload Docs, Notes,
  Photos, Time Entry, Generate Report, Close Job.

### Work Orders
Children of Jobs (Preparation, Interior, Exterior, Scaffolding, Cleaning, Inspection…). Each:
Assigned Team, Status, Hours, Resources, Dependencies, Progress, Photos, Checklist.

### Scheduling (core engine)
- **Views:** Daily, Weekly, Monthly, Timeline, Gantt, Team, Resource, Employee.
- **Features:** Drag and drop, multi-select, resize blocks, split / merge jobs, conflict detection,
  capacity warnings, suggested assignments, schedule templates, filters, search.
- **Actions:** Assign, Move, Extend, Shorten, Duplicate, Cancel, Lock, Publish.

### Capacity Planning
Display Available / Planned / Actual / Remaining Hours, Utilization %, Forecast, Team & Employee
Capacity. Indicator colours: Green = Available, Yellow = Near Capacity, Red = Over Capacity
(thresholds per BR-401).

### Teams
Hierarchy: Business Unit → Division → Team → Sub Team → Employee. Each Team: Manager, Capacity,
Skills, Active Jobs, Utilization.

### Employees
General (Name, Position, Team, Skills, Certifications), Availability (Working Days, Leave, Public
Holidays), Performance (Utilization, Assigned Jobs, Hours Worked).

### Resources
Vehicles, Equipment, Contractors, Machinery, Shared Assets. Each: Status, Availability, Location,
Maintenance Schedule.

### Finance (operational only)
Revenue, Labour Cost, Material Cost, Budget, Variance, Gross Profit, Margin. Supports forecasting,
cost tracking, planned vs actual.

### Reporting
Filter by date range, customer, team, employee, supervisor, status, job type, region. Export PDF,
Excel, CSV. Future: scheduled reports, email reports.

### AI Assistant
Read access to operational data with permission scoping. Capabilities: summaries,
recommendations, capacity analysis, profit analysis, scheduling suggestions, risk detection,
natural-language search. Example commands: *"Show tomorrow's schedule." / "Move Job 203 to next
Monday." / "Which team is overloaded?" / "Compare target vs actual labour."*

### Notifications
In-App, Email, SMS (future), Microsoft Teams (future). Triggers: Job Assigned / Delayed, Schedule
Changed, Resource Conflict, Capacity Exceeded, Opportunity Won, Invoice Ready.

### Search
Global index across Jobs, Companies, Contacts, Employees, Resources, Work Orders, Notes,
Documents. Partial matching, filters, recent & saved searches.

### Attachments
Images, PDF, Word, Excel; CAD & video future. Each supports version history, preview, download,
comments.

### Activity Timeline
Append-only per entity: Created, Edited, Assigned, Scheduled, Completed, Commented, Uploaded,
AI Generated. Never deleted.

### Audit Trail
Log User, Timestamp, Previous Value, New Value, Entity, Action.

### Non-functional
- **Performance:** dashboards < 2s, ≥ 100k jobs, concurrent users, real-time schedule updates,
  minimal page reloads, optimistic UI.
- **Security:** RBAC, secure auth, session timeout, audit logging, file permissions, API auth,
  encrypted transmission.
- **Accessibility:** keyboard nav, screen-reader compatible, high-contrast, clear focus,
  accessible colour usage.
- **Mobile (field staff):** view schedules, check in/out, upload photos, record time, complete
  checklists, add notes, report issues. Prioritise speed and offline resilience where feasible.

---

## 2. Database Schema (logical)

### Design principles
UUID PKs · soft deletes (`deleted_at`) · automatic `created_at` / `updated_at` · auditability ·
referential integrity · extensibility via Custom Fields · transactional vs analytical separation
where appropriate.

### Base entity standard
`id` UUID, `created_at`, `updated_at`, `deleted_at` (nullable), `created_by` UUID, `updated_by` UUID.

### Entities

| Entity | Key fields |
| --- | --- |
| **Companies** | company_name, trading_name, abn, industry, email, phone, website, billing_address_id, notes, status |
| **Contacts** | company_id, first_name, last_name, email, mobile, phone, job_title, preferred_contact_method |
| **Opportunities** | company_id, contact_id, title, pipeline, stage, estimated_value, probability, expected_close_date, owner_id, status — *Won ⇒ auto Job* |
| **Jobs** | job_number, company_id, contact_id, title, description, status, priority, planned_start/finish, estimated_hours/cost/revenue, actual_start/finish/hours/cost/revenue, supervisor_id, team_id, sub_team_id, progress_percent, health_status, completion_status |
| **Work Orders** | job_id, title, description, status, sequence, planned_hours/start/finish, actual_hours/start/finish |
| **Tasks** | work_order_id, assigned_employee_id, assigned_resource_id, title, status, priority, planned_hours, actual_hours |
| **Teams** | parent_team_id, team_name, manager_id, capacity_hours, color |
| **Employees** | employee_number, first_name, last_name, email, phone, team_id, sub_team_id, role, employment_type, hourly_cost, active |
| **Skills** | skill_name, description |
| **Employee Skills** | employee_id, skill_id, proficiency |
| **Resources** | resource_type, resource_name, serial_number, status, location, available |
| **Resource Bookings** | resource_id, job_id, work_order_id, employee_id, start, finish |
| **Schedules** | job_id, work_order_id, assigned_team, assigned_employee, start_datetime, finish_datetime, schedule_status |
| **Capacity Records** | entity_type, entity_id, date, available_hours, allocated_hours, utilization_percent |
| **Time Entries** | employee_id, job_id, work_order_id, clock_in, clock_out, total_hours |
| **Documents** | filename, file_type, file_size, storage_path, uploaded_by |
| **Photos** | category: Before / During / After / Defect / Inspection |
| **Notes** | mentions, rich text, attachments |
| **Activities** | append-only — Created / Updated / Assigned / Scheduled / Completed / Commented / AI Generated |
| **Notifications** | In-App / Email / Push (future) / SMS (future) |
| **Automations** | Opportunity Won, Job Created, Schedule Changed, Capacity Exceeded |
| **AI Conversations** | user_prompt, ai_response, context_snapshot, referenced_entities, timestamp |
| **Custom Fields** | text/number/date/boolean/dropdown/multi-select, applicable to Companies, Contacts, Jobs, Work Orders, Resources, Employees |

### Relationship overview
```
COMPANY 1—∞ CONTACT, OPPORTUNITY, JOB
OPPORTUNITY 1—1 JOB (converts_to)
JOB 1—∞ WORK_ORDER, SCHEDULE, DOCUMENT, NOTE, ACTIVITY, PHOTO, RESOURCE_BOOKING
WORK_ORDER 1—∞ TASK
TEAM 1—∞ SUB_TEAM 1—∞ EMPLOYEE
TEAM 1—∞ JOB (assigned)
EMPLOYEE 1—∞ TIME_ENTRY
RESOURCE 1—∞ RESOURCE_BOOKING
```

### Enumerations (centralised)
Job Status, Opportunity Stage, Priority, Resource Status, Schedule Status, Team Type,
Notification Type, Activity Type.

### Indexing
FKs, Job Number, Company Name, Opportunity Stage, Schedule Date, Employee, Team, Resource,
Status, Created Date. Composite indexes on `(status, planned_start)`, `(team_id, planned_start)`,
`(company_id, status)`.

---

## 3. Business Rules

Precedence: Company Policies → Safety & Compliance → Operational → Financial → Scheduling →
User Preferences. Rules are deterministic, auditable, consistent, low-touch, configurable.

### Opportunities
- **BR-001** Opportunity must belong to one Company + one Primary Contact.
- **BR-002** Exactly one owner at any time.
- **BR-003 (Conversion)** Won ⇒ auto-create Job, link, copy customer/site/quote/attachments,
  record conversion date, log activity.
- **BR-004** Lost cannot generate Jobs. Loss reason mandatory.

### Jobs
- **BR-100** Unique Job Number, immutable after creation.
- **BR-101** Customer, Site, Supervisor required before scheduling.
- **BR-102** Cannot be marked Complete until: all Work Orders complete, no active scheduling,
  required inspections done, issues resolved, required documents uploaded.
- **BR-103** Closed jobs read-only; only Admins may reopen.

### Work Orders
- **BR-200** Belongs to exactly one Job.
- **BR-201** Cannot begin until predecessors complete (if dependencies exist).
- **BR-202** Work Order progress contributes toward overall Job progress.

### Scheduling
- **BR-300** Required: Start, Finish, Team OR Employee, Job.
- **BR-301** No employee double-booking; exception needs Admin approval.
- **BR-302** No simultaneous resource bookings across jobs.
- **BR-303** Default to standard business hours; overtime flagged separately.
- **BR-304** No scheduling employees on approved leave.
- **BR-305** Public-holiday scheduling shows warning; allowed per policy.
- **BR-306** Weekend scheduling only if explicitly enabled for Job/Team.

### Capacity
- **BR-400 Formula** `Utilization = Allocated Hours ÷ Available Hours × 100`.
- **BR-401 Thresholds (configurable)** Green 0–80% · Yellow 81–95% · Red 96–100% · Critical >100%.
  > **Project note.** App-current thresholds (in `src/lib/capacity.ts`) are
  > 0–70 / 71–90 / 91–100 / >100 from earlier instructions. Reconcile with the doc on next pass.
- **BR-402** Over-threshold ⇒ warn, highlight, notify Operations Managers, recommend alternatives.
- **BR-403** Forecast includes planned schedules, leave, public holidays, existing commitments.

### Resources
- **BR-500** Unavailable resources (Maintenance / Broken / Reserved / Retired) cannot be assigned.
- **BR-501** Maintenance auto-flags unavailable.
- **BR-502** Shared resource = one booking at a time.

### Employees
- **BR-600** Inactive employees get no new assignments.
- **BR-601** Mandatory skills enforced where required.
- **BR-602** Expired certifications block applicable assignments.
- **BR-603** Each Team has one active Supervisor.

### Financial
- **BR-700** Every metric records Planned, Actual, Variance (hours, labour cost, revenue,
  material cost).
- **BR-701** `Variance = Actual − Planned`.
- **BR-702** `Gross Profit = Revenue − Total Cost`.
- **BR-703** `Margin = Gross Profit ÷ Revenue × 100`.

### Reporting
- **BR-800** Operational dashboards always current; refresh caches automatically.
- **BR-801** Historical reports immutable; corrections via adjustment records.
- **BR-802** Reports show Generated Date, Filters Used, Generated By.

### Notifications
- **BR-900** Triggers: Job Assigned, Schedule Changed, Capacity Exceeded, Opportunity Won,
  Resource Conflict, Deadline Missed, Work Order Completed.
- **BR-901** Unread until acknowledged.

### AI
- **BR-1000** Reads per user permissions; never expose restricted info.
- **BR-1001** No auto-execute of critical actions (schedule changes, resource reassignment, job
  closure, capacity redistribution) — require user confirmation.
- **BR-1002** Explainability: every recommendation includes Why, Supporting Data, Expected Impact.

### Activity / Security
- **BR-1100** Activity history immutable, append-only.
- **BR-1101** Log User, Timestamp, Action, Entity, Previous Value, New Value.
- **BR-1200** Soft delete; archive rather than purge.
- **BR-1201** RBAC enforced.
- **BR-1202** Financial info gated to authorised users only.

### Automation
- **BR-1300 Opportunity Won** ⇒ Create Job, Assign Pipeline, Generate Activity, Notify Operations.
- **BR-1301 Job Completion** ⇒ Notify Stakeholders, Update Reports, Lock Schedule, Archive Tasks.
- **BR-1302 Schedule Change** ⇒ Notify Team, Recalculate Capacity, Refresh Dashboards, Log Activity.

### Validation (must prevent)
Duplicate Job Numbers · Duplicate Resource Bookings · Negative Hours · Invalid Date Ranges ·
Circular Dependencies · Missing Required Fields · Past Scheduling (configurable) · Closing Jobs
with open Work Orders.

### Configurable (admin)
Working Hours, Capacity Thresholds, Public Holidays, Business Units, Job Statuses, Opportunity
Stages, Notification Rules, Automation Rules, AI Features — all without software changes.

---

## 4. Workflows

End-to-end flow:
`Lead → Opportunity → Quote → Won → Job → Work Orders → Scheduling → Execution → QA →
Completion → Invoice → Closed`.

| ID | Workflow | Summary |
| --- | --- | --- |
| WF-001 | Customer Acquisition | Lead → Company → Contact → Opportunity → Assign Salesperson → Schedule follow-up. |
| WF-002 | Opportunity Management | Opportunity → Qualified → Quoted → Negotiation → Won / Lost. Won auto-creates Job; Lost requires reason / competitor / notes. |
| WF-003 | Opportunity → Job Conversion | On Won: generate Job Number, create Job, link Opportunity, copy company/contact/site/quote/attachments, notify Operations, log activity. |
| WF-004 | Job Creation | Create Job → Supervisor → Team → Estimate Hours → Estimate Cost → Create Work Orders → Ready for Scheduling. Required: Customer, Site, Supervisor, Planned Hours, Planned Revenue. |
| WF-005 | Work Order Creation | Multiple Work Orders per Job, each with schedule / team / resources / progress. |
| WF-006 | Capacity Planning | Job → Required Hours → Available Teams → Capacity Engine → Available? → Schedule or Recommend (another team / date) + Notify Scheduler. |
| WF-007 | Scheduling | Job → Select Team → Assign Employees → Assign Resources → Create Schedule → Publish. Validate leave, holidays, bookings, equipment. |
| WF-008 | Resource Booking | Select Resource → Check Availability → Reserve → Assign to Schedule → Confirm. Conflicts prevent booking. |
| WF-009 | Employee Assignment | Select Team → Filter Skills → Check Capacity → Check Leave → Assign → Notify Employee. |
| WF-010 | Leave Request | Employee submit → Supervisor approve/reject → Update Capacity → Update Schedule → Notify. Approved leave blocks scheduling. |
| WF-011 | Daily Operations | Supervisor opens dashboard: today's jobs, team & resource allocation, risks, delays. Updates notes / photos / issues. |
| WF-012 | Time Tracking | Clock In → Work → Break → Resume → Clock Out → Submit. Hours flow into Job, Work Order, Capacity, Reporting. |
| WF-013 | Progress Updates | Employee updates % complete / notes / photos / issues ⇒ recalc Job Progress, Team Progress, KPIs. |
| WF-014 | Schedule Changes | Auto-recalc capacity, notify team, refresh dashboards & reports, log activity. |
| WF-015 | Delayed Job | Actual Finish > Planned Finish ⇒ flag, notify Supervisor & Operations, recommend action, update dashboard. |
| WF-016 | Risk Detection | Triggers: budget exceeded, capacity exceeded, delayed WOs, missing resources, low progress, safety issues. Status: Green / Yellow / Orange / Red / Critical. |
| WF-017 | AI Scheduling Assistant | e.g. "Move Job 245 to next Tuesday" ⇒ AI reads schedule, validates capacity & resources, recommends, user confirms, updates schedule, notifies team. |
| WF-018 | AI Operations Summary | "Summarize today's operations" ⇒ AI gathers active jobs, delays, revenue, risks, team utilisation, returns executive summary. |
| WF-019 | Job Completion | Validate all WOs complete + required photos + required docs + Supervisor approval ⇒ Mark Complete → Generate Report → Notify Finance → Archive Schedule. |
| WF-020 | Invoice Ready | Completed Job → Finance Review → Invoice Generated → Customer Billed → Payment Tracking. |
| WF-021 | Reporting | Nightly refresh of KPIs / Capacity / Revenue / Utilisation / Dashboards; real-time reports update continuously. |
| WF-022 | Notification Lifecycle | Event → Generated → Received → Viewed → Acknowledged → Archived. Types: Information / Warning / Critical. |
| WF-023 | Document Management | Upload → Virus Scan → Store → Version → Link to Entity → Preview. Linkable to Company / Opportunity / Job / Work Order / Employee. |
| WF-024 | Activity Timeline | Every important action creates an immutable Activity entry. |
| WF-025 | Exception Workflow | Detect → Prevent → Explain → Recommend Solution (double-booking, missing resources/skills, capacity overflow, expired certs). |
| WF-026 | Approval Workflow | Items: Leave, Budget Increase, Schedule Override, Resource Override, Job Closure. Request → Review → Approve/Reject → Notify → Log. |
| WF-027 | Dashboard Refresh | On any operational data change update KPIs, widgets, AI context, notifications — no full page reload. |

### Workflow design principles
Minimise manual data entry · prefer automation · prevent invalid states · preserve audit history ·
update related modules automatically · keep users notified · provide AI assistance · support
future expansion without redesign.

---

## 5. UI / UX Guidelines

### Color palette
- **Neutral:** Dark Gray, Medium Gray, Light Gray.
- **Accent / status:** Blue (Information / Links / Help), Orange (Warnings, capacity nearing
  limit), Red (Errors, Critical alerts, Over capacity), Green (Primary actions, Success, Positive
  KPIs). Gray for backgrounds, borders, secondary actions.

### Typography
Modern sans-serif. Hierarchy: H1 page title · H2 section title · H3 card title · Body 14–16px ·
Caption 12px · Monospace for IDs / Job Numbers / codes.

### Layout
Every page: **Header → Filters → Main Content → Supporting Panels.** Whitespace > clutter.

### Navigation
- **Sidebar order:** Dashboard · Operations · Jobs · Scheduling · Capacity · Teams · Resources ·
  CRM · Finance · Reports · AI Assistant · Settings.
- **Top bar:** Search, Notifications, Quick Create, AI Assistant, Profile, Help.
- **Breadcrumbs** on every page except Dashboard (e.g. `Dashboard › Operations › Jobs › JOB-245`).

### Components
- **Cards** (KPIs, stats, summaries, AI recs) — Title + Primary Value + Supporting Info.
- **Tables** are the primary interface. Must support sort, filter, pagination, column reorder,
  column visibility, export, bulk actions. Standard row actions: View, Edit, Duplicate, Archive,
  Delete (soft), Assign, Generate Report.
- **Kanban** for CRM, Jobs, Work Orders — cards show Title, Customer, Status, Progress, Priority,
  Assigned Team.
- **Calendar** views: Daily / Weekly / Monthly / Resources / Employees / Teams.
- **Timeline** supports zoom, drag, resize, dependencies, milestones, today indicator,
  weekend highlight.
- **Gantt** supports dependencies, critical path, progress, milestones, actual vs planned.
- **Forms** group related fields, use tabs (General / Planning / Scheduling / Finance / Documents
  / History), validate immediately (not on save), show clear message + suggested fix + field
  highlight.
- **Buttons:** Primary = solid QPaint Green · Secondary = outline · Danger = red · Text = minimal.
- **Icons:** one consistent library; never mix styles.

### States
- **Empty:** illustration + description + primary action ("No Jobs Found" → Create New Job).
- **Loading:** skeletons / progress / placeholder cards — never blank screens.
- **Error:** what happened + why + how to fix. Never expose technical errors.

### Global UX
- **Global Search** accessible from every page (Jobs, Customers, Employees, Resources, Work
  Orders, Documents, AI Conversations).
- **Filters** on every operational page: Status, Team, Supervisor, Customer, Date, Priority,
  Region, Saved Filters.
- **Floating Quick Actions:** Create Job, Schedule Job, Assign Team, Upload Photo, Generate
  Report, Ask AI.
- **Notifications** grouped Today / Yesterday / Earlier. Categories Info / Warning / Critical.
- **AI** is integrated — accessible from header, context panels, job pages, scheduling, reports.
  Automatically understands current page context.

### Page-level layouts
- **Dashboard:** Top KPIs → Middle operational widgets → Bottom reports / AI insights / notifications.
- **Job Detail:** Header → Job Information → Tabs (Overview · Work Orders · Schedule · Resources ·
  Finance · Documents · Activity · AI).
- **Employee:** Profile → Schedule → Capacity → Assignments → Time Entries → Documents → Performance.
- **Capacity Planner:** Left Teams · Center Timeline · Right Capacity Summary · Bottom Recommendations.

### Mobile (field workers)
Prioritise Today's Jobs, Schedule, Time Tracking, Photos, Notes, Issues, Documents.
Desktop-only: Advanced Reporting, Administration, Bulk Editing, Complex Analytics.

### Accessibility
Keyboard nav, high contrast, screen readers, visible focus states, accessible colours, large
click targets.

### Performance targets
Page load < 2s · Navigation < 300ms · Search < 500ms · Schedule updates real-time.

---

## 6. User Roles & Permissions (RBAC)

### Principles
Least Privilege · Role-Based Access · Auditability · Separation of Duties · Configurable ·
Future multi-tenant. URL knowledge alone never grants access.

### Permission verbs
View · Create · Edit · Delete · Approve · Assign · Schedule · Export · Import · Manage Settings ·
Execute AI Actions · Override Rules.

### Default roles
1. **System Administrator** — Full unrestricted access; configuration, security, integrations,
   user management, audit logs, rule overrides.
2. **Executive** — Dashboard, Reports, Finance, Capacity, Jobs, AI, CRM. View all operational
   data, export, approve strategic workflows. Cannot modify system / security / users.
3. **Operations Manager** — Dashboard, Jobs, Scheduling, Capacity, Teams, Resources, Reports, AI.
   Create / Edit Jobs, assign teams, approve scheduling, manage capacity, view financial KPIs.
4. **Scheduler** — Scheduling, Capacity, Jobs, Teams, Employees, Resources. Cannot delete jobs or
   view confidential finance.
5. **Project Manager** — Assigned Jobs, Work Orders, Resources, Team Progress, AI. Cannot access
   unrelated projects or company settings.
6. **Supervisor** — Assigned Jobs, Work Orders, Team Members, Schedule, Photos, Documents. Update
   progress, complete WOs, upload photos, record time. Cannot edit budgets, delete jobs, edit
   finance.
7. **Sales Representative** — Companies, Contacts, Opportunities, Activities, Quotes.
8. **Finance Officer** — Finance, Jobs, Reports, Revenue, Costs. Cannot modify schedules.
9. **Field Employee** — Only assigned work. View today's schedule, clock in/out, upload photos,
   submit notes, complete tasks. No finance, no other teams.
10. **Contractor** — Only assigned work. No employees / finance / CRM.
11. **Read-Only User** — Auditors / consultants / executives / future clients.
12. **Guest** — Temporary / demos. No operational permissions.

### Module access matrix (summary)

| Module | Admin | Exec | Ops | Sched | PM | Super | Sales | Fin | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CRM | ✓ | ✓ | View | View | View | – | ✓ | View | – |
| Jobs | ✓ | ✓ | ✓ | ✓ | ✓ | View | View | View | Assigned |
| Work Orders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | View | View | Assigned |
| Scheduling | ✓ | View | ✓ | ✓ | View | View | – | – | Assigned |
| Capacity | ✓ | ✓ | ✓ | ✓ | View | – | – | View | – |
| Teams | ✓ | View | ✓ | View | View | View | – | – | – |
| Employees | ✓ | View | ✓ | View | View | View | – | – | Self |
| Resources | ✓ | View | ✓ | ✓ | View | View | – | – | Assigned |
| Finance | ✓ | ✓ | KPI only | – | View | – | – | ✓ | – |
| Reports | ✓ | ✓ | ✓ | View | View | View | View | ✓ | – |
| AI | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Limited |

### Record ownership
Sales Reps see their own opportunities · PMs see assigned jobs · Employees see assigned WOs ·
Supervisors see assigned teams. Admins may override.

### Approval matrix

| Action | Approver |
| --- | --- |
| Leave Request | Supervisor |
| Budget Increase | Operations Manager |
| Schedule Override | Operations Manager |
| Capacity Override | Operations Manager |
| Job Closure | Supervisor or Operations Manager |
| User Creation | Administrator |
| Permission Changes | Administrator |

### AI permissions
AI respects RBAC. Field Employee asking "Show company profit." must be refused. Never expose
hidden records, salaries, restricted finance, or admin settings.

### Audit-required events
Login, Logout, Permission Change, User Creation, Schedule Override, Budget Modification, Job
Deletion, Job Closure, AI Administrative Actions. Records: User, Timestamp, Entity, Action,
Previous Value, New Value, IP (future). Immutable.

### Future enhancements
Custom Roles, Department / Region / Branch-based permissions, Multi-Company, Project-level,
Temporary / Time-limited access, Approval Chains, SSO, MFA.

---

## 7. System Architecture

### Principles
Modular · Domain-Driven · API-First · Event-Driven Automation · AI-Ready · Mobile-First APIs ·
Secure by Default · Observable · Scalable · Maintainable. Business architecture must remain
portable beyond the initial Lovable implementation.

### Layered architecture
- **Presentation** — UI, forms, dashboards, tables, calendar, timeline, gantt, mobile. **No
  business logic.**
- **Application** — workflows, validation, automation, commands/queries, permissions, notifications.
- **Domain** — business rules, entities, calculations, scheduling logic, capacity logic, financial
  logic. UI-independent.
- **Infrastructure** — DB, file storage, auth, email, APIs, AI services, logging.

### Core modules
CRM (Contacts/Quotes/Sales → outputs Jobs) · Operations (Jobs / WOs / Execution / Progress /
Docs) · Scheduling (Calendar / Assignments / Timelines / Resource & Team planning) · Capacity
(Utilization / Forecasting / Availability / Workforce planning) · Finance (Budgets / Revenue /
Costs / Profitability / Variance) · Reporting (KPIs / Dashboards / Exports / Analytics) · AI
(Recommendations / Summaries / Predictions / Workflow assistance).

### Data flow (canonical)
`Lead → Opportunity → Won → Job → Work Orders → Scheduling → Execution → Time Tracking →
Reporting → Invoice`. Every module updates the same operational dataset. **No duplicate business
records.**

### Event flow (example)
`Opportunity Won → Create Job → Create Activity → Notify Operations → Generate Work Orders →
Schedule Required → Update Dashboard`. Events trigger automation. Examples: Job Created, Job
Assigned, Schedule Updated, Employee Assigned, Capacity Exceeded, Resource Conflict, Job Completed.

### Module dependencies
`CRM → Jobs → WorkOrders → Scheduling → Capacity → Reporting → Dashboard → AI`. One-directional
where possible. No circular deps.

### Frontend architecture
Sidebar Nav · Header · Main Workspace · Context Panel · AI Panel · Notification Center.
Reusable components: Tables, Forms, Cards, Timeline, Calendar, Charts, Modals, Drawers.

### State management
- **UI state:** sidebar, current page, filters, active tab.
- **Business state:** Jobs, Employees, Reports — must stay synchronised across the app.

### Data synchronisation
Real-time updates · Optimistic updates · Background refresh · Conflict resolution. Whenever
operational data changes, refresh Dashboard, Reports, Capacity, AI Context, Notifications
automatically.

### API design
Each module exposes services (CRM, Job, Schedule, Capacity, Resource, Report, AI). No
module-to-module DB access — use service boundaries.

### Background processing
Async: Report Generation, AI Summaries, Email Notifications, Capacity Recalc, Dashboard Refresh,
Imports, Exports. UI never waits on long-running processes.

### Search architecture
Global search indexes Jobs, Contacts, Employees, Resources, Documents, Notes, Work Orders.
Results grouped by entity type.

### Notification architecture
`Business Event → Notification Service → Delivery Channel → User`. Channels: In-App, Email,
Future SMS / Push / Slack.

### AI architecture
AI is a platform service, never an isolated chatbot. Accesses Jobs, Scheduling, Capacity,
Reporting, CRM, Employees, Resources, Documents, Notes, Work Orders. Automatically knows the
user's current context (e.g. viewing Job 247 → AI knows it).

### Logging
System logs: errors, warnings, performance, API calls, user actions. Audit logs: business
changes, permission changes, financial changes.

### Scalability
Architecture must support future modules without rework: Inventory, Procurement, Fleet, Payroll,
GIS, Asset Management, Customer Portal, Supplier Portal.

### Security
Every request validates Authentication → Authorization → Business Rules → Data Validation.
Client-side validation never replaces server-side.

### Availability
High Availability · Automatic Recovery · Graceful Error Handling. Critical ops continue even if
AI is unavailable.

### Guiding principle
Create a scalable, modular, AI-powered operations platform where every business function shares
a common operational data model.

---

## 8. AI Specification

### Principles
Context-aware · Explainable · Permission-aware · Data-driven · Action-oriented · Non-destructive
by default · Fast · Transparent. Every recommendation includes the reasoning.

### Vision
Long term: manage the business through natural language ("Move the Smith job to Friday." /
"Who is over capacity next week?"). AI becomes the primary interface to operational data.

### AI roles
1. **Operations Assistant** — today's schedule, active jobs, delays, conflicts, availability.
2. **Scheduler** — suggests team / employee / resource / equipment assignments based on skills,
   availability, location, workload.
3. **Capacity Planner** — analyses utilisation, future demand, bottlenecks; recommends ahead of
   problems.
4. **Executive Advisor** — weekly ops report, financial health, capacity forecast, profitability,
   risks.
5. **Reporting Assistant** — natural-language report generation ("Export completed jobs for June").
6. **Knowledge Assistant** — searches Jobs, Documents, Notes, Activities, Policies via questions.

### Context awareness
AI automatically knows current page, Job, Company, Employee, Schedule, Filters, Date Range, User.
"Why is this delayed?" while on Job QP-1023 ⇒ AI knows "this" = QP-1023.

### Permissions
AI must always respect RBAC. Never reveal hidden records, salaries, restricted finance, or admin
settings. Permission check occurs before every response.

### Command categories
- **Operational:** "Show today's schedule." / "What is delayed?"
- **Scheduling:** "Move this job." / "Reassign Team A." / "Find another crew."
- **Capacity:** "Which teams are overloaded?" / "Who has spare capacity?"
- **Financial:** "Show revenue." / "Profit by project."
- **CRM:** "New opportunities." / "Upcoming follow-ups."
- **Reporting:** "Export report." / "Weekly summary."

### Capabilities
- **Natural-language search** replaces traditional search boxes.
- **Summarisation** — Jobs, Companies, Meetings, Reports, Daily Ops, Weekly Performance.
- **Recommendation engine** — better schedules, team reallocations, resource substitutions,
  risk mitigation, cost reductions. Every rec includes Reason, Confidence, Expected Impact.
- **Risk detection** — delays, budget overruns, capacity overload, resource shortages, missing
  approvals/documents. Levels: Low / Medium / High / Critical.
- **Forecasting** — capacity, revenue, labour demand, resource utilisation, completion dates.
  Improves with historical data.

### AI scheduling considers
Employee availability, leave, public holidays, skills, certifications, team capacity, equipment,
existing bookings, job priority, customer deadlines.

### Explainability (required on every rec)
Why? · What data was used? · What alternatives exist? · What happens if ignored?

### AI actions (with confirmation)
Create Job / WO · Schedule Job · Reassign Team · Generate Report · Export Data · Send
Notification · Create Meeting. High-impact actions ALWAYS require confirmation.

### AI restrictions
Must never automatically Delete · Close Jobs · Change Budgets · Approve Leave · Modify
Permissions · Override Capacity · Approve Invoices.

### Memory & learning
Session memory: recent conversations, current page, filters, open records, active reports.
Learn from accepted/rejected recommendations, FAQs, scheduling and capacity decisions.

### Prompt framework (internal)
Every request gathers: User · Role · Permissions · Current Page · Current Entity · Current
Filters · Relevant Data · Business Rules → produces response.

### Provider abstraction
Configurable: OpenAI · Anthropic Claude · Google Gemini · Microsoft Copilot · Local LLMs.
Provider swappable without changing app logic.

### Conversation history
Record User, Timestamp, Prompt, Response, Referenced Entities, Executed Actions. Searchable.

### AI panel UI
Chat Interface · Suggested Prompts · Recent Questions · Recommended Actions · Context Indicator ·
Action Confirmation Dialog. Invokable from anywhere.

### Example workflows
- **Daily Briefing.** "Good morning." → today's jobs, staff, weather (future), capacity warnings,
  critical delays, high-priority tasks.
- **Scheduling.** "Move Job QP-245 to next Monday." → check capacity / resources / leave →
  find conflicts → suggest best slot → confirm → update schedule → notify.
- **Executive Summary.** "How is the business performing?" → revenue, margin, active jobs, jobs
  at risk, utilisation, forecast, variance, recommended actions.

### Long-term vision
AI evolves into the **Digital Operations Manager** — proactively monitors operations, surfaces
risks, recommends improvements.

---

## 9. API Integrations

### Principles
API-First · Event-Driven · Secure · Fault Tolerant · Retryable · Observable · Loosely Coupled ·
Replaceable. No module depends directly on a third-party API — all integrations go through an
Integration Service so providers can be swapped without affecting business logic.

### Categories
CRM · Communication · Calendar · AI · File Storage · Future Enterprise.

### CRM — PipeDrive
Current primary CRM. Strategy: Read + Sync → Read-Only → Retired. Syncs Contacts, Activities,
Notes, Files. QOP progressively replaces PipeDrive.

### Email
Providers: Microsoft 365, Gmail, SMTP. Capabilities: Send / Receive / Tracking / Attachments /
Notifications. Future: auto-link emails to Companies, Jobs, Opportunities, Contacts.

### Calendar
Providers: Google Calendar, Microsoft Outlook. Capabilities: Meetings, Staff Availability, Leave,
Scheduling. Future: two-way sync.

### AI providers
OpenAI · Anthropic Claude · Google Gemini · Azure OpenAI · Local LLM. Configurable.

### Authentication
Current: Email + Password. Future: Microsoft Entra ID, Google OAuth, SAML, SSO, MFA.

### File storage
Local · AWS S3 · Azure Blob · Google Cloud Storage. Files: PDF, Word, Excel, Images, Videos, CAD.

### Notifications
Channels: In-App, Email. Future: SMS, Push, Microsoft Teams, Slack, WhatsApp Business.

### Reporting exports
CSV · Excel · PDF. Future: Power BI dataset, Tableau extract, scheduled email reports.

### Future integrations
- **GIS / Maps (Google Maps)** — job locations, route planning, crew locations, travel estimates.
- **Weather** — forecast, rain alerts, wind warnings (feeds scheduling engine).
- **Payroll** — time entries, approved hours, leave, overtime. QOP remains source of truth.
- **Accounting (Xero / MYOB / QuickBooks)** — invoices, customer sync, payment status, costs.
- **Document Signing (DocuSign / Adobe Sign)** — contracts, variations, client acceptance.
- **SMS** — reminders, schedule changes, alerts.
- **Mobile Push (Android / iOS)** — assigned job, schedule updated, leave approved, resource
  conflict.

### Internal APIs
Each module exposes a service (CRM API, Job API, Schedule API, Capacity API, Employee API,
Resource API, Finance API, Report API, Notification API, AI API). Inter-module communication
through service interfaces — never direct DB access.

### Webhooks
Events: Opportunity Won · Job Created · Job Updated · Schedule Changed · Employee Assigned ·
Capacity Exceeded · Work Order Completed · Invoice Generated. Payload includes Event Name,
Timestamp, Entity Type, Entity ID, Changed Fields, User, Correlation ID.

### Event bus
Business events publish centrally. Example: `Job Updated → Publish → Capacity Module + Reporting
+ Notifications + AI Context + Dashboard Refresh`. Reduces coupling.

### Error handling
Retry · Log · Notify admins · Continue operating. Non-essential integration failures must not
block mission-critical workflows.

### Synchronisation
Direction (Import / Export / Two-Way) · Frequency (Real-Time / Scheduled / Manual) · Conflict
Resolution (Source of Truth / Last Updated / Manual Review).

### Versioning & rate limiting
`/api/v1/...` — breaking changes require a new version. Configurable rate limits per
authenticated user, public API, integration API, AI request.

### Monitoring
Per integration: response time, error rate, success rate, retry count, sync duration, queue
length. Admin Integration Health Dashboard.

### Security
HTTPS · Authentication · Authorization · Encrypted Secrets · Token Rotation · Audit Logging.
Credentials never in app code.

### Integration roadmap
- **Phase 1:** PipeDrive sync · Email · AI · File Uploads.
- **Phase 2:** Calendar · Notifications · Accounting · Reporting Exports.
- **Phase 3:** Payroll · Maps · Weather · Mobile Push · Document Signing.
- **Phase 4:** Enterprise ERP · Fleet · IoT · Advanced Analytics · External Customer Portal.

### Guiding principle
QOP is the **operational source of truth**. External systems enhance, never define, it.

---

## 10. Reporting & Analytics

### Principles
Real-Time · Actionable · Drillable · Filterable · Exportable · Shareable · AI-Enhanced ·
Permission Aware. Users should never need Excel to understand performance.

### Hierarchy (every KPI drills down)
`Executive Dashboard → Operations Dashboard → Department Dashboard → Team Dashboard → Job
Dashboard → Individual Records`.

### Dashboard types
- **Executive** — Revenue, Gross Profit, Margin, Active Jobs, Jobs Completed, Jobs At Risk,
  Capacity Utilization, Labour Utilization, Forecast Revenue, AI Executive Summary.
- **Operations** — Jobs Today / This Week, Delayed, Critical, Team Workload, Schedule Changes,
  Resource Availability, Capacity Warnings, Safety Alerts, AI Operational Summary.
- **Scheduling** — Today's Schedule, Unassigned, Overbooked Teams, Available Employees,
  Equipment, Upcoming Leave, Capacity Forecast.
- **Capacity** — Team Capacity, Employee Utilization, Future Capacity, Overallocated,
  Underutilized, Trends.
- **Finance** — Revenue, Cost, Budget, Variance, Profit, Margin, Labour Cost, Material Cost,
  Invoice Status.
- **CRM** — Opportunities, Pipeline Value, Win Rate, Average Deal Size, Follow-ups, Sales Forecast.

### KPI categories
- **Operational:** Active / Completed / Delayed / Cancelled Jobs, Avg Job Duration, WOs
  Completed / Outstanding.
- **Scheduling:** Jobs Scheduled Today / Week, Schedule Changes, Double Bookings, Unassigned,
  Avg Scheduling Time.
- **Capacity:** Utilization, Available Hours, Allocated Hours, Overtime, Idle Time, Team &
  Employee Utilization.
- **Financial:** Revenue, Labour Cost, Material Cost, Gross Profit, Net Margin, Budget Variance,
  Revenue Forecast.
- **Workforce:** Attendance, Leave, Overtime, Productivity, Hours Worked, Jobs Per Employee,
  Avg Completion Rate.
- **Customer:** Active Customers, Repeat Customers, Revenue Per Customer, Opportunity Conversion
  Rate, CSAT (future).

### Standard reports
- **Daily Operations** — Today's Jobs, Staff Allocation, Capacity, Delays, Resource Issues, AI Summary.
- **Weekly Operations** — Jobs Completed / Delayed, Capacity Trends, Labour Utilization, Revenue,
  AI Insights.
- **Monthly Executive** — Revenue, Profit, Margin, Operational Performance, Team Performance,
  Forecast, Strategic Recommendations.
- **Job Performance** — Planned vs Actual Hours / Cost, Variance, Completion Time, Profitability,
  Issues Encountered.
- **Team Performance** — Jobs Completed, Hours Worked, Utilization, Overtime, Capacity, Avg
  Productivity.
- **Employee Performance** — Assigned / Completed Jobs, Hours, Attendance, Utilization,
  Certifications, Leave.

### Report filters
Date Range · Company · Customer · Team · Employee · Supervisor · Region · Job Status · Priority ·
Work Order Status · Resource · Business Unit. Saved filter sets supported.

### Drill-down
`Revenue → Customer → Jobs → Work Orders → Time Entries`. No KPI without a path to underlying
records.

### Charts
Line · Bar · Stacked Bar · Area · Pie · Donut · Heat Map · Timeline · Gantt · Calendar Heatmap ·
KPI Cards. Interactive.

### Forecasting
Revenue · Capacity · Labour Demand · Equipment Usage · Cash Flow (future) · Resource Availability
· Completion Dates. Auto-updates on data change.

### Trend analysis
Daily / Weekly / Monthly / Quarterly / Yearly. Indicators: Improving / Stable / Declining.

### AI analytics
Insights: why revenue declined, which jobs will overrun, which teams overloaded, which customers
most profitable, suggested improvements, predicted scheduling conflicts. Proactive anomaly surfacing.

### Alerts
Budget Overruns · Capacity Overload · Delayed Jobs · Missing Time Entries · Low Productivity ·
Expiring Certifications · Resource Conflicts. Visible on dashboards, optional notifications.

### Exports & scheduling
PDF · Excel (.xlsx) · CSV. Future: Power BI dataset, Tableau extract, scheduled email reports.
Schedule frequency Daily / Weekly / Monthly / Quarterly; delivery Email / In-App / Shared Link
(future).

### Data refresh

| Report Type | Refresh |
| --- | --- |
| Operational Dashboards | Real-time |
| Scheduling | Real-time |
| Capacity | Real-time |
| Executive Dashboard | Every 5 minutes |
| Financial Reports | Configurable |
| Historical Reports | On demand |

### Security & audit
Reports respect RBAC (Finance restricted, Employees see only their own performance, Supervisors
see assigned teams unless granted more). Every report logs User, Report Name, Generation Time,
Filters Applied, Export Format, Delivery Method.

### Future analytics
Predictive Cost Overruns · Predictive Labour Demand · Customer Lifetime Value · Resource
Optimization · Route Optimization · AI Anomaly Detection · Predictive Maintenance · ML Capacity
Models.

### Reporting design principle
Every report answers: **What happened? · What is happening now? · What is likely to happen next?**

---

## 11. Product Roadmap

### Vision
Replace PipeDrive, Tom's Planner, CrewTraka. Centralise operational data. Enable AI-assisted
decision making. Automate workflows. Improve scheduling and capacity. Real-time executive reporting.

### Development principles
Each phase delivers usable business value · avoids unnecessary complexity · builds on previous
phases · minimises technical debt · prioritises operational workflows over cosmetics.

### Phase 1 — Foundation (current)
Authentication · User Management · Dashboard · Companies · Contacts · Opportunities · Jobs ·
Work Orders · Core Database · Activity Timeline. *(PDF truncated here — Phases 2+ not yet ingested.)*

---

## 12. Not Yet Imported

The source PDF tail (Roadmap Phases 2+, Changelog, any later appendices) was beyond the 50-page
parse cap. Re-upload that tail and I'll append.

---

## 13. Current App ↔ Doc Reconciliation (open items)

Where the live app diverges from this doc. Tracked, not yet resolved.

- **Capacity thresholds.** App uses 70 / 90 / 100 (per `src/lib/capacity.ts`). Doc BR-401 says
  80 / 95 / 100 (configurable). Section 5 colour usage also says Orange = nearing limit, Red =
  over capacity. Pick canonical values.
- **CRM stages.** App pipeline is the QPaint 6-stage flow. Doc uses generic Qualified → Quoted →
  Negotiation → Won/Lost. Keep current 6-stage as the QPaint override.
- **Module coverage.** Built today: Dashboard, Jobs, Job Detail, Capacity Calendar, Crews, Staff,
  CRM (+ Deal Detail), Reports, AI Assistant, Settings. **Not yet built:** Companies, Contacts,
  Opportunities (as a separate module distinct from CRM/Deals), Work Orders, Tasks, Resources,
  Finance, Notifications, Activity Timeline, Audit Trail, Custom Fields, Approvals,
  Breadcrumbs, Global Search, Quick Create, Notification Center.
- **Sidebar order.** Doc order: Dashboard · Operations · Jobs · Scheduling · Capacity · Teams ·
  Resources · CRM · Finance · Reports · AI Assistant · Settings. Current sidebar groups
  differently (Operations / People / Insights).
- **Job Detail tabs.** Doc requires Overview · Work Orders · Schedule · Resources · Finance ·
  Documents · Activity · AI. Current page is a flat layout.
- **Auto-conversion BR-1300.** Manual "Convert to Job" exists; auto-conversion on Won not wired.
- **Soft delete / audit trail.** Not implemented (required by BR-1100/1200 and §6 audit list).
- **RBAC.** No roles / permissions table yet — the full 12-role matrix is unimplemented.
- **AI explainability.** AI Assistant responses don't include Why / Data / Alternatives / Impact
  as required by §8.
- **AI permission scoping.** AI has no per-user permission filter yet.
- **Drill-down.** Report KPIs are not yet drillable down to records.
- **Real-time refresh.** Dashboards refresh on navigation, not via realtime channels.

---

## 14. Product Roadmap — Phases 1–10 (from 11_ROADMAP)

Source: `LOVABLE_-_Command_Center_3.pdf` (pp. 1–5). Each phase lists deliverables and success criteria. Treat phase order as the canonical build sequence.

### Phase 1 — Foundation (CRM + Jobs core)
Notes, File Uploads, Search, Basic Reporting. **Success:** users manage customers and jobs in QOP; operational data centralized; PipeDrive sync operational; basic dashboards available.

### Phase 2 — Scheduling Engine
Calendar Views, Timeline, Drag-and-Drop Scheduling, Team Assignment, Employee Assignment, Resource Scheduling, Conflict Detection, Leave Management, Schedule Templates, Schedule Publishing. **Success:** jobs scheduled entirely in QOP; spreadsheets retired; auto conflict warnings.

### Phase 3 — Capacity Management
Capacity Dashboard, Team Capacity, Employee Capacity, Forecasting, Capacity Heatmaps, Utilization Metrics, Workload Balancing, Capacity Recommendations. **Success:** managers visualize future workload; over-allocation detected automatically; decisions data-driven.

### Phase 4 — Mobile Operations
Mobile-Friendly UI, Daily Schedule, Clock In/Out, Time Tracking, Photo Uploads, Notes, Issue Reporting, Limited Offline Support, Push Notifications. **Success:** field staff operate without desktop; supervisors get real-time progress.

### Phase 5 — Operational Intelligence
AI Chat Assistant, Operational Summaries, AI Search, Schedule Recommendations, Capacity Recommendations, Executive Summaries, Risk Detection, AI Report Generation. **Success:** natural-language queries against operational data; AI recommendations reduce manual planning.

### Phase 6 — Financial Intelligence
Budget Tracking, Labour Cost Tracking, Planned vs Actual, Profitability Analysis, Margin Reporting, Invoice Readiness, Financial Dashboards. **Success:** project profitability visible in real time; overruns detected early.

### Phase 7 — Enterprise Integrations
Accounting Integration, Calendar Sync, Email Integration, Document Signing, Payroll Export, Maps, Weather, BI Platform Exports. **Success:** data flows automatically between QOP and external systems.

### Phase 8 — Predictive Operations
Predictive Scheduling, Predictive Capacity, Delay Prediction, Cost Forecasting, AI Optimization Engine, Workforce Simulation, What-if Scenarios. **Success:** risks identified before they occur; AI proactively recommends improvements.

### Phase 9 — Enterprise Platform
Multi-Company Support, Multi-Branch Support, Regional Permissions, Custom Workflows, Custom Fields, Enterprise Audit Logs, API Marketplace. **Success:** multiple business units served from a single deployment.

### Phase 10 — Digital Operations Platform
Digital Operations Command Center, Autonomous Operational Recommendations, Voice Commands, AI Agents, Cross-Department Automation, Advanced Forecasting, Executive Copilot, Organization Knowledge Graph. **Success:** management operates the business primarily through AI-assisted workflows; QOP is the single source of operational truth.

### Future Modules (post Phase 10)
Inventory · Procurement · Fleet · Asset · Supplier Portal · Customer Portal · Safety & Compliance · QA · GIS Mapping · Predictive Maintenance · Training · Equipment Tracking · IoT · Contract Management · Tender Management. Must integrate with existing architecture.

### Technical Roadmap
- **Foundation:** DB optimization, API standardization, Auth, RBAC, Audit Logging.
- **Scalability:** Event Bus, Queue Processing, Caching, Background Workers, Real-Time Sync.
- **Observability:** Monitoring, Logging, Error Tracking, Performance Metrics, Integration Health Dashboard.
- **Security:** MFA, SSO, API Keys, Secret Management, Data Encryption, Security Auditing.

---

## 15. Product Specification — Master Principles (from 12_PRODUCT_SPECIFICATION)

### Core Domains
CRM (customer acquisition + opportunities) · Operations (jobs, work orders, delivery) · Scheduling · Capacity · Teams · Resources · Finance · AI · Reporting · Admin.

### Master Principles
1. **Single source of truth** — no data duplication across modules.
2. **Configurability over hard-coding** — capacity thresholds, statuses, stages, fields configurable.
3. **AI is first-class** — every domain exposes AI-readable structure.
4. **Explainability** — every AI output ships with Why, Supporting Evidence, Expected Impact.
5. **Auditability** — every critical action traceable (schedule changes, budget updates, job closures).

### Performance Targets
- Page load: standard pages < ~2s.
- Reports: standard reports < ~10s.

### Coding Standards
Clear naming · small reusable components · separation of concerns · strong typing.

### Future-Proofing
Must support multi-company, white-label, regional rules, additional industries, marketplace extensions, third-party plugins, custom workflows, advanced analytics, autonomous AI agents.

### Definition of Done
Feature only "done" when: covered by tests, audited, permission-scoped, AI-readable, documented, performant.

---

## 16. Lovable Development Rules (from 13_LOVABLE_DEVELOPMENT_RULES — **Critical**)

These rules govern *how* features are built inside this app. Violations create technical debt.

### Configurability
No duplicate pages or APIs. Everything configurable.

### Build Reusable Components
**Never build page-specific components.** Build reusable primitives: Button, Table, Form, Modal, Card, Badge, Tabs, Filters. Page files compose these.

### API-First Design
Every major feature designed as if another app will consume it. Avoid UI-dependent logic.

### No Business Logic Inside UI
The UI must never determine: capacity, scheduling, profitability, permissions, risk. All such logic lives in service modules (e.g. `src/lib/capacity.ts`, future `src/lib/risk.ts`, `src/lib/permissions.ts`).

### Component Standards
Every component must: be reusable · accept props/config · handle loading, empty, and error states · support permissions · support accessibility.

### Form Standards
Validated · consistent layout · clear errors · reusable field components.

### Error Handling
Gracefully handle network failures, permission errors, validation failures, integration failures, unexpected exceptions. Users always see helpful messages.

### Security
Every operation validates: authentication, authorization, input, ownership/scope.

### UI Consistency
Consistent spacing, typography, colours, buttons, icons, navigation, layouts, interaction patterns. Use the existing design system tokens — never hardcode colours.

### Mindset
This is not isolated pages — it is the enterprise operations platform that will become QPaint's primary operating system. Every change should strengthen architecture, reduce debt, improve usability, support expansion.

---

## 17. Implementation Plan — Phase Order (from 14_IMPLEMENTATION_PLAN)

Canonical build sequence (override the generic Phase 1–10 above when scheduling work):

```
Foundation → Core CRM → Jobs → Work Orders → Scheduling → Capacity → Dashboards → AI → Finance → Reporting
```

### Per-phase task lists
- **Foundation:** auth, RBAC, audit log, base components, settings.
- **CRM:** Companies · Contacts · Opportunities · Activities · Notes · Attachments · Opportunity pipeline · Search. *Exit:* PipeDrive basic functionality replaced.
- **Jobs:** Job CRUD, lifecycle, linkage to Opportunities.
- **Work Orders:** child entity of Job, granular scheduling unit.
- **Scheduling:** Calendar · Timeline · Drag-and-drop · Team/Employee/Resource assignment · Conflict detection · Leave integration. *Exit:* all scheduling happens in QOP.
- **Capacity:** capacity engine, heatmaps, recommendations.
- **Dashboards:** role-based dashboards.
- **AI:** chat, summaries, recommendations, risk detection.
- **Finance:** budgets, planned vs actual, profitability, invoice readiness. *Exit:* project profitability visible real time.
- **Reporting:** operational · capacity · financial · team · executive reports · export engine.

### Per-milestone Testing Checklist
Before closing any milestone, verify: CRUD · Permissions · Validation · Search · Filters · Notifications · Audit logs · Mobile responsiveness · AI compatibility · Performance.

### Release Train
- **Production v1.0:** Foundation + CRM + Jobs + Scheduling + Capacity + Dashboards + stable integrations.
- **Production v2.0:** full PipeDrive replacement · predictive AI · advanced capacity planning · enterprise capabilities.

### Guiding Principle
Ship reusable, configurable, AI-readable building blocks — not isolated pages.

---

## 18. Database Dictionary (from 15_DATABASE_DICTIONARY)

Canonical naming and entity catalog. Apply to all future migrations.

### Naming Conventions
- **Tables / Entities:** PascalCase conceptually (`Company`, `Job`, `Employee`, `WorkOrder`); physical table names stay snake_case plural (`companies`, `work_orders`).
- **Fields:** snake_case (`planned_hours`, `actual_hours`, `customer_id`).

### Data Type Standards
UUID PKs · `timestamptz` for all dates · `numeric(12,2)` for money · `int` for hours · `text` for free text · enums for statuses/stages.

### Core Entities (canonical fields)

**COMPANY** — customer organisation.
- Fields: name, industry, billing_address, primary_contact_id, status, owner_id.
- One Company → many Contacts, Opportunities, Jobs.

**CONTACT** — person belonging to a Company.
- Fields: company_id, first_name, last_name, email, phone, role, status.

**OPPORTUNITY** — sales pipeline record.
- Fields: company_id, contact_id, title, value, currency, stage, status, owner_id, expected_close_date, source.
- Indexes: owner_id, stage, status.

**JOB** — operational project (created from won Opportunity).
- Fields: opportunity_id, company_id, title, description, status, planned_start, planned_end, planned_hours, actual_hours, planned_cost, actual_cost, assigned_team_id, owner_id, health_status.

**WORK ORDER** — child of Job, granular schedulable unit.
- Fields: job_id, title, description, sequence, planned_hours, actual_hours, planned_cost, actual_cost, assigned_team_id, status, scheduled_start, scheduled_end.

**TEAM**
- Fields: name, supervisor_id, business_unit_id, division_id.

**EMPLOYEE**
- Fields: first_name, last_name, role, team_id, skills, availability_status, contact info.

**RESOURCE** — vehicles, equipment, scaffold, machines.
- Fields: name, category, serial_number, location, notes, status.

**SCHEDULE** — represents scheduled work (block on the calendar).
- Fields: job_id, work_order_id, team_id, employee_id, resource_id, start_at, end_at, status, notes.

**ACTIVITY** — timeline event on any entity.
- Fields: entity_type, entity_id, activity_type, description, created_by, created_at.

**DOCUMENT**
- Fields: entity_type, entity_id, file_name, storage_path, mime_type, uploaded_by, uploaded_at.

**NOTIFICATION**
- Fields: user_id, entity_type, entity_id, type, message, read_at.

**AUDIT_LOG** *(immutable — never edit or delete)*
- Fields: user_id, entity_type, entity_id, action, previous_value, new_value, ip_address, timestamp.

**SETTINGS** — Company settings, business hours, public holidays, capacity rules, stages, statuses, currencies.

### Future Entities (reserve names; do not implement yet)
FleetMaintenance · CustomerPortalUser · ComplianceDocument · SafetyIncident · RiskAssessment · Invoice · Payment · Quote · Variation · Contract.

### Database Principles
3NF where practical · UUID PKs · FK relationships · **soft deletes** for business records · **immutable audit logs** · consistent naming · indexed hot fields · no duplicated business data · schema designed for multi-company scalability.

---

## 19. Reconciliation Updates (delta from Command Center 3)

Add to the open items in §13:

- **Naming.** Standardize on snake_case fields and PascalCase entity names per §18. Current `JobRow` etc. mostly matches; verify migrations follow.
- **Work Orders entity missing.** Required as Job child for scheduling granularity (Phase: Work Orders, before Scheduling). Not implemented.
- **Resources entity missing.** Vehicles / equipment / scaffold scheduling not modelled.
- **Activities + Documents + Notifications tables missing.** Required cross-cutting entities.
- **Audit log immutability.** When implemented, must reject UPDATE/DELETE at the DB level.
- **Soft deletes.** Add `deleted_at` to business tables (companies, contacts, opportunities, jobs, work_orders, teams, employees, resources).
- **Settings entity.** Capacity thresholds, business hours, holidays, stages, statuses must move from code constants into a `settings` table.
- **AI explainability contract.** Every AI response object must include `{ why, evidence, expected_impact, alternatives? }` — wire into AI Assistant.
- **Performance budgets.** Add a perf check: pages < 2s, reports < 10s.
- **Component reuse audit.** Several pages still contain page-specific layouts — extract into shared primitives per §16.
