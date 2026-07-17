-- Production Pace must reach Team Leader/Foreperson and Painter/Crew Member roles as a normalized
-- percentage only — never the raw Production Rate or the $ figures it's derived from (main Decision
-- Log, Section 5; Developer Handoff Brief Formula 8). jobs_view already nulls total_value for those
-- roles at the query layer, which means the pace calculation itself must happen server-side, inside
-- this SECURITY DEFINER function, so the raw dollar figure never travels to the client at all —
-- not even transiently before being discarded.

create function get_production_pace(p_schedule_block_id uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_job_total_value numeric;
  v_job_target_hours numeric;
  v_phase_hours numeric;
  v_percent_complete numeric;
  v_cumulative_hours numeric;
  v_phase_value numeric;
  v_production_rate numeric;
  v_quoted_rate numeric;
begin
  select j.total_value, j.target_hours, sb.phase_hours, sb.percent_complete
    into v_job_total_value, v_job_target_hours, v_phase_hours, v_percent_complete
  from schedule_blocks sb
  join jobs j on j.id = sb.job_id
  where sb.id = p_schedule_block_id;

  if v_job_total_value is null or v_job_target_hours is null or v_job_target_hours = 0 then
    return null;
  end if;

  select coalesce(sum(hours), 0) into v_cumulative_hours
  from daily_hours_entries
  where schedule_block_id = p_schedule_block_id;

  if v_cumulative_hours = 0 then
    return null;
  end if;

  -- Formula 1
  v_phase_value := v_job_total_value * (v_phase_hours / v_job_target_hours);
  -- Formula 7
  v_production_rate := (v_phase_value * (v_percent_complete / 100)) / v_cumulative_hours;
  -- Formula 8 (literal spec — denominator uses job.target_hours, not phase_hours)
  v_quoted_rate := v_phase_value / v_job_target_hours;

  if v_quoted_rate = 0 then
    return null;
  end if;

  return (v_production_rate / v_quoted_rate) * 100;
end;
$$;

-- Callable by anyone signed in. SECURITY DEFINER means this function reads the real total_value
-- internally (bypassing the caller's RLS/jobs_view masking) so it can compute the ratio — but it
-- only ever returns that ratio as a percentage, never the dollar figures themselves. That's the
-- security boundary: not row access, but what the return value can contain.
grant execute on function get_production_pace(uuid) to authenticated;
