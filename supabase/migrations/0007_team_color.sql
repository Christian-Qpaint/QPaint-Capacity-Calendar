-- Per-crew color identity for the Resource Schedule Calendar — lets a crew's bars be recognized at
-- a glance across the whole calendar regardless of which work area/job they're on, rather than the
-- previous work-area-based coloring. Nullable: teams without one yet get a deterministic default
-- color computed client-side from their id, until someone picks a real one (Setup or Calendar).
alter table teams add column color text;
