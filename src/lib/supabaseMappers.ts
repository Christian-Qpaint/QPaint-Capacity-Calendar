// snake_case DB rows <-> camelCase app entities. Explicit per-entity mappers rather than a generic
// case converter — small enough to keep, and a compile error here is a lot more legible than a
// silent runtime mismatch from a generic transform.

import type {
  Client,
  Contractor,
  Credential,
  DailyHoursEntry,
  Job,
  MonthlySnapshot,
  MonthlyTarget,
  ScheduleBlock,
  Team,
  TeamMembership,
  WeeklyActual,
  Worker,
} from '@/types'

export function mapClient(r: any): Client {
  return { id: r.id, name: r.name, type: r.type, contactInfo: r.contact_info }
}
export function clientToRow(c: Omit<Client, 'id'>) {
  return { name: c.name, type: c.type, contact_info: c.contactInfo }
}

export function mapContractor(r: any): Contractor {
  return {
    id: r.id,
    name: r.name,
    nickname: r.nickname ?? undefined,
    reportedMonthlyCapacity: r.reported_monthly_capacity,
    tradingName: r.trading_name ?? undefined,
    abn: r.abn ?? undefined,
    acn: r.acn ?? undefined,
    gstRegistered: r.gst_registered ?? undefined,
    licenceCategory: r.licence_category ?? undefined,
    address: r.address ?? undefined,
    suburb: r.suburb ?? undefined,
    state: r.state ?? undefined,
    postcode: r.postcode ?? undefined,
    primaryContactName: r.primary_contact_name ?? undefined,
    primaryContactMobile: r.primary_contact_mobile ?? undefined,
    primaryContactEmail: r.primary_contact_email ?? undefined,
    preferredArea: r.preferred_area ?? undefined,
    afterHoursAvailable: r.after_hours_available ?? undefined,
    ownEquipment: r.own_equipment ?? undefined,
    ownTransport: r.own_transport ?? undefined,
    yearsExperience: r.years_experience ?? undefined,
    reference1Name: r.reference_1_name ?? undefined,
    reference1Phone: r.reference_1_phone ?? undefined,
    reference2Name: r.reference_2_name ?? undefined,
    reference2Phone: r.reference_2_phone ?? undefined,
    approved: r.approved ?? undefined,
    active: r.active ?? undefined,
    lastUpdated: r.last_updated ?? undefined,
  }
}
export function contractorToRow(c: Omit<Contractor, 'id'>) {
  return {
    name: c.name,
    nickname: c.nickname ?? null,
    reported_monthly_capacity: c.reportedMonthlyCapacity,
    trading_name: c.tradingName ?? null,
    abn: c.abn ?? null,
    acn: c.acn ?? null,
    gst_registered: c.gstRegistered ?? null,
    licence_category: c.licenceCategory ?? null,
    address: c.address ?? null,
    suburb: c.suburb ?? null,
    state: c.state ?? null,
    postcode: c.postcode ?? null,
    primary_contact_name: c.primaryContactName ?? null,
    primary_contact_mobile: c.primaryContactMobile ?? null,
    primary_contact_email: c.primaryContactEmail ?? null,
    preferred_area: c.preferredArea ?? null,
    after_hours_available: c.afterHoursAvailable ?? null,
    own_equipment: c.ownEquipment ?? null,
    own_transport: c.ownTransport ?? null,
    years_experience: c.yearsExperience ?? null,
    reference_1_name: c.reference1Name ?? null,
    reference_1_phone: c.reference1Phone ?? null,
    reference_2_name: c.reference2Name ?? null,
    reference_2_phone: c.reference2Phone ?? null,
    approved: c.approved ?? null,
    active: c.active ?? null,
    last_updated: c.lastUpdated ?? null,
  }
}

export function mapTeam(r: any): Team {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    contractorId: r.contractor_id ?? undefined,
    headcount: r.headcount ?? undefined,
    standardHoursPerWeek: r.standard_hours_per_week ?? undefined,
    color: r.color ?? undefined,
  }
}
export function teamToRow(t: Omit<Team, 'id'>) {
  return {
    name: t.name,
    type: t.type,
    contractor_id: t.contractorId ?? null,
    headcount: t.headcount ?? null,
    standard_hours_per_week: t.standardHoursPerWeek ?? null,
    color: t.color ?? null,
  }
}

export function mapWorker(r: any): Worker {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    email: r.email,
    address: r.address,
    position: r.position,
    workerType: r.worker_type,
    contractorId: r.contractor_id ?? undefined,
    whiteCardNumber: r.white_card_number,
    qbuildInductionDone: r.qbuild_induction_done,
    qbuildInductionVerified: r.qbuild_induction_verified,
  }
}
export function workerToRow(w: Omit<Worker, 'id'>) {
  return {
    first_name: w.firstName,
    last_name: w.lastName,
    phone: w.phone,
    email: w.email,
    address: w.address,
    position: w.position,
    worker_type: w.workerType,
    contractor_id: w.contractorId ?? null,
    white_card_number: w.whiteCardNumber,
    qbuild_induction_done: w.qbuildInductionDone,
    qbuild_induction_verified: w.qbuildInductionVerified,
  }
}

export function mapTeamMembership(r: any): TeamMembership {
  return {
    id: r.id,
    workerId: r.worker_id,
    teamId: r.team_id,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    membershipType: r.membership_type,
  }
}
export function teamMembershipToRow(m: Omit<TeamMembership, 'id'>) {
  return {
    worker_id: m.workerId,
    team_id: m.teamId,
    start_date: m.startDate,
    end_date: m.endDate ?? null,
    membership_type: m.membershipType,
  }
}

export function mapCredential(r: any): Credential {
  return {
    id: r.id,
    contractorId: r.contractor_id,
    credentialType: r.credential_type,
    number: r.number ?? undefined,
    issuer: r.issuer ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    coverageAmount: r.coverage_amount ?? undefined,
    jobTypeScope: r.job_type_scope,
  }
}
export function credentialToRow(c: Omit<Credential, 'id'>) {
  return {
    contractor_id: c.contractorId,
    credential_type: c.credentialType,
    number: c.number ?? null,
    issuer: c.issuer ?? null,
    expiry_date: c.expiryDate ?? null,
    coverage_amount: c.coverageAmount ?? null,
    job_type_scope: c.jobTypeScope,
  }
}

export function mapJob(r: any): Job {
  return {
    id: r.id,
    pipedriveDealId: r.pipedrive_deal_id,
    clientId: r.client_id,
    address: r.address,
    category: r.category,
    totalValue: r.total_value,
    targetHours: r.target_hours,
    dateWon: r.date_won,
    pipedriveStageId: r.pipedrive_stage_id ?? undefined,
    pipedriveDealTitle: r.pipedrive_deal_title ?? undefined,
    actualHoursOverride: r.actual_hours_override ?? undefined,
    actualHoursSource: r.actual_hours_source ?? 'computed',
    productionPercentOverride: r.production_percent_override ?? undefined,
    productionPercentSource: r.production_percent_source ?? 'computed',
  }
}

export function mapScheduleBlock(r: any): ScheduleBlock {
  return {
    id: r.id,
    jobId: r.job_id,
    teamId: r.team_id,
    workArea: r.work_area,
    startDate: r.start_date,
    endDate: r.end_date,
    phaseHours: r.phase_hours,
    status: r.status,
    percentComplete: r.percent_complete,
    percentCompleteUpdatedBy: r.percent_complete_updated_by ?? undefined,
    percentCompleteUpdatedAt: r.percent_complete_updated_at ?? undefined,
    notes: r.notes ?? undefined,
  }
}
export function scheduleBlockToRow(b: Omit<ScheduleBlock, 'id'>) {
  return {
    job_id: b.jobId,
    team_id: b.teamId,
    work_area: b.workArea,
    start_date: b.startDate,
    end_date: b.endDate,
    phase_hours: b.phaseHours,
    status: b.status,
    percent_complete: b.percentComplete,
    percent_complete_updated_by: b.percentCompleteUpdatedBy ?? null,
    percent_complete_updated_at: b.percentCompleteUpdatedAt ?? null,
    notes: b.notes ?? null,
  }
}

export function mapDailyHoursEntry(r: any): DailyHoursEntry {
  return {
    id: r.id,
    scheduleBlockId: r.schedule_block_id,
    teamId: r.team_id,
    enteredByUserId: r.entered_by_user_id,
    date: r.date,
    hours: r.hours,
  }
}
export function dailyHoursEntryToRow(e: Omit<DailyHoursEntry, 'id'>) {
  return {
    schedule_block_id: e.scheduleBlockId,
    team_id: e.teamId,
    entered_by_user_id: e.enteredByUserId,
    date: e.date,
    hours: e.hours,
  }
}

export function mapWeeklyActual(r: any): WeeklyActual {
  return { id: r.id, jobId: r.job_id, weekEnding: r.week_ending, actualHours: r.actual_hours }
}

export function mapMonthlyTarget(r: any): MonthlyTarget {
  return { id: r.id, year: r.year, month: r.month, targetDollars: r.target_dollars }
}
export function monthlyTargetToRow(t: Omit<MonthlyTarget, 'id'>) {
  return { year: t.year, month: t.month, target_dollars: t.targetDollars }
}

export function mapMonthlySnapshot(r: any): MonthlySnapshot {
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    targetDollars: r.target_dollars,
    actualDollars: r.actual_dollars,
    capturedAt: r.captured_at,
  }
}
export function monthlySnapshotToRow(s: Omit<MonthlySnapshot, 'id' | 'capturedAt'>) {
  return { year: s.year, month: s.month, target_dollars: s.targetDollars, actual_dollars: s.actualDollars }
}
