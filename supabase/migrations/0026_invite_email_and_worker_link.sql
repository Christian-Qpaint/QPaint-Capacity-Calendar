-- Invites can now be emailed automatically, and can be tied to a worker record. When the invite is
-- accepted, the new login is linked to that worker (users.worker_id) and to the worker's crew
-- (users.team_id) — that is how a Crew Leader login ends up seeing only their own crew's jobs.
alter table user_invites add column worker_id uuid references workers(id) on delete set null;
alter table user_invites add column email_sent_at timestamptz;
alter table user_invites add column email_error text;
