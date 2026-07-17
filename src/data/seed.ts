// QPaint OS — Module 1 mock data.
// Per the Developer Handoff Brief, Section 6: "No historical data migration... use manually-entered
// placeholder values in the meantime if needed to keep building unblocked" — Pipedrive isn't wired
// up yet, so this stands in for it. Numbers are internally consistent (computed via src/lib/formulas
// and src/lib/schedule) rather than copied verbatim from the wireframe mockups, which were two
// separately-illustrated examples that don't numerically reconcile with each other.

import type {
  Client,
  Contractor,
  Credential,
  DailyHoursEntry,
  Job,
  ScheduleBlock,
  Team,
  TeamMembership,
  User,
  WeeklyActual,
  Worker,
} from '@/types'
import { STANDARD_DOLLAR_RATE_PER_HOUR as RATE_PER_HOUR } from '@/lib/constants'

export const clients: Client[] = [
  { id: 'cl-1', name: 'Andrew Norton', type: 'Individual', contactInfo: 'andrew.norton@example.com' },
  { id: 'cl-2', name: 'Priya Kumar', type: 'Individual', contactInfo: 'priya.kumar@example.com' },
  { id: 'cl-3', name: 'Buhot St Body Corporate', type: 'Body Corporate', contactInfo: 'admin@buhotbc.example.com' },
  { id: 'cl-4', name: 'Dornoch Holdings', type: 'Company', contactInfo: 'facilities@dornoch.example.com' },
  { id: 'cl-5', name: 'Liverpool Rd Pty Ltd', type: 'Company', contactInfo: 'ops@liverpoolrd.example.com' },
  { id: 'cl-6', name: 'Jarvis Residential Trust', type: 'Individual', contactInfo: 'trust@jarvis.example.com' },
  { id: 'cl-7', name: 'Department of Education — Aratula SS', type: 'Government', contactInfo: 'facilities@qed.example.gov.au' },
  { id: 'cl-8', name: 'Sam Dillon-Reyes', type: 'Individual', contactInfo: 'sdr@example.com' },
]

export const contractors: Contractor[] = [
  { id: 'ct-matt', name: "Matt's Painting", reportedMonthlyCapacity: 50000 },
  { id: 'ct-rossi', name: 'Rossi Coatings', reportedMonthlyCapacity: 30000 },
  { id: 'ct-dillon', name: 'Dillon', reportedMonthlyCapacity: 20000 },
]

export const credentials: Credential[] = [
  { id: 'cr-1', contractorId: 'ct-matt', credentialType: 'Insurance', number: 'INS-88213', expiryDate: '2027-01-01', jobTypeScope: null },
  { id: 'cr-2', contractorId: 'ct-matt', credentialType: 'White Card', number: 'WC-55201', expiryDate: '2026-08-01', jobTypeScope: null },
  { id: 'cr-3', contractorId: 'ct-rossi', credentialType: 'Licence', number: 'LIC-90211', expiryDate: '2027-06-01', jobTypeScope: null },
  { id: 'cr-4', contractorId: 'ct-rossi', credentialType: 'Insurance', number: 'INS-11209', expiryDate: '2027-06-01', jobTypeScope: null },
  { id: 'cr-5', contractorId: 'ct-rossi', credentialType: 'WHS Induction', number: 'WHS-4471', expiryDate: '2027-01-01', jobTypeScope: 'Government' },
  { id: 'cr-6', contractorId: 'ct-dillon', credentialType: 'Insurance', number: 'INS-30021', expiryDate: '2026-06-01', jobTypeScope: null },
]

export const teams: Team[] = [
  { id: 'tm-a', name: 'Team A — Cornel', type: 'QPaint', headcount: 2, standardHoursPerWeek: 38 },
  { id: 'tm-b', name: 'Team B — Steve', type: 'QPaint', headcount: 3, standardHoursPerWeek: 38 },
  { id: 'tm-c', name: 'Team C — Jordan', type: 'QPaint', headcount: 1, standardHoursPerWeek: 38 },
  { id: 'tm-matt-1', name: 'Team 1', type: 'Contractor', contractorId: 'ct-matt' },
  { id: 'tm-matt-2', name: 'Team 2', type: 'Contractor', contractorId: 'ct-matt' },
  { id: 'tm-rossi-1', name: 'Rossi Coatings', type: 'Contractor', contractorId: 'ct-rossi' },
  { id: 'tm-dillon-1', name: 'Dillon', type: 'Contractor', contractorId: 'ct-dillon' },
]

export const workers: Worker[] = [
  { id: 'wk-1', firstName: 'Cornel', lastName: 'Botha', phone: '0412 000 001', email: 'cornel@qpaint.com.au', address: '12 Fig St, Brisbane', position: 'Team Leader', workerType: 'Internal', whiteCardNumber: 'WC-10001', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-2', firstName: 'Liam', lastName: 'Fraser', phone: '0412 000 002', email: 'liam.f@qpaint.com.au', address: '4 Palm St, Brisbane', position: 'Painter', workerType: 'Internal', whiteCardNumber: 'WC-10002', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-3', firstName: 'Steve', lastName: 'Marlow', phone: '0412 000 003', email: 'steve@qpaint.com.au', address: '9 Oak St, Brisbane', position: 'Team Leader', workerType: 'Internal', whiteCardNumber: 'WC-10003', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-4', firstName: 'Noah', lastName: 'Kelly', phone: '0412 000 004', email: 'noah.k@qpaint.com.au', address: '21 Elm St, Brisbane', position: 'Painter', workerType: 'Internal', whiteCardNumber: 'WC-10004', qbuildInductionDone: true, qbuildInductionVerified: false },
  { id: 'wk-5', firstName: 'Ethan', lastName: 'Ho', phone: '0412 000 005', email: 'ethan.h@qpaint.com.au', address: '3 Birch St, Brisbane', position: 'Painter', workerType: 'Internal', whiteCardNumber: 'WC-10005', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-6', firstName: 'Jordan', lastName: 'Pryce', phone: '0412 000 006', email: 'jordan@qpaint.com.au', address: '17 Ash St, Brisbane', position: 'Foreperson', workerType: 'Internal', whiteCardNumber: 'WC-10006', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-7', firstName: 'Matt', lastName: 'Ryan', phone: '0413 000 007', email: 'matt@mattspainting.example.com', address: '8 Industrial Ave, Brisbane', position: 'Team Leader', workerType: 'Contractor', contractorId: 'ct-matt', whiteCardNumber: 'WC-20001', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-8', firstName: 'Enzo', lastName: 'Rossi', phone: '0413 000 008', email: 'enzo@rossicoatings.example.com', address: '15 Trade St, Brisbane', position: 'Team Leader', workerType: 'Contractor', contractorId: 'ct-rossi', whiteCardNumber: 'WC-20002', qbuildInductionDone: true, qbuildInductionVerified: true },
  { id: 'wk-9', firstName: 'Sam', lastName: 'Dillon', phone: '0413 000 009', email: 'sam@dillonpainting.example.com', address: '6 Trade St, Brisbane', position: 'Team Leader', workerType: 'Contractor', contractorId: 'ct-dillon', whiteCardNumber: 'WC-20003', qbuildInductionDone: false, qbuildInductionVerified: false },
]

export const teamMemberships: TeamMembership[] = [
  { id: 'tmb-1', workerId: 'wk-1', teamId: 'tm-a', startDate: '2026-01-01', membershipType: 'Core' },
  { id: 'tmb-2', workerId: 'wk-2', teamId: 'tm-a', startDate: '2026-01-01', membershipType: 'Core' },
  { id: 'tmb-3', workerId: 'wk-3', teamId: 'tm-b', startDate: '2026-01-01', membershipType: 'Core' },
  { id: 'tmb-4', workerId: 'wk-4', teamId: 'tm-b', startDate: '2026-01-01', membershipType: 'Core' },
  { id: 'tmb-5', workerId: 'wk-5', teamId: 'tm-b', startDate: '2026-01-01', membershipType: 'Core' },
  { id: 'tmb-6', workerId: 'wk-6', teamId: 'tm-c', startDate: '2026-01-01', membershipType: 'Core' },
  // Liam (core to Team A) borrowed onto Team C for one week — additive, not a replacement.
  { id: 'tmb-7', workerId: 'wk-2', teamId: 'tm-c', startDate: '2026-07-13', endDate: '2026-07-17', membershipType: 'Floating' },
]

export const jobs: Job[] = [
  { id: 'jb-1', pipedriveDealId: 'PD-1001', clientId: 'cl-1', address: '24 Carrington Road, Indooroopilly', category: 'Residential', totalValue: 29454.7, targetHours: 214, dateWon: '2026-04-24', actualHoursSource: 'computed' },
  { id: 'jb-2', pipedriveDealId: 'PD-1002', clientId: 'cl-2', address: '17 Drury St, Paddington', category: 'Residential', totalValue: 24 * RATE_PER_HOUR, targetHours: 24, dateWon: '2026-05-01', actualHoursSource: 'computed' },
  { id: 'jb-3', pipedriveDealId: 'PD-1003', clientId: 'cl-3', address: '40 Buhot St, Toowong', category: 'Corporate', totalValue: 40 * RATE_PER_HOUR, targetHours: 40, dateWon: '2026-05-05', actualHoursSource: 'computed' },
  { id: 'jb-4', pipedriveDealId: 'PD-1004', clientId: 'cl-4', address: '144 Dornoch Tce, West End', category: 'Corporate', totalValue: 40 * RATE_PER_HOUR, targetHours: 40, dateWon: '2026-05-10', actualHoursSource: 'computed' },
  { id: 'jb-5', pipedriveDealId: 'PD-1005', clientId: 'cl-5', address: '22 Liverpool Rd, Toowong', category: 'Corporate', totalValue: 40 * RATE_PER_HOUR, targetHours: 40, dateWon: '2026-05-15', actualHoursSource: 'computed' },
  { id: 'jb-6', pipedriveDealId: 'PD-1006', clientId: 'cl-6', address: '61 Jarvis Rd, Bardon', category: 'Residential', totalValue: 40 * RATE_PER_HOUR, targetHours: 40, dateWon: '2026-05-20', actualHoursSource: 'computed' },
  { id: 'jb-7', pipedriveDealId: 'PD-1007', clientId: 'cl-7', address: 'Aratula State School, Aratula', category: 'Government', totalValue: 24 * RATE_PER_HOUR, targetHours: 24, dateWon: '2026-04-01', actualHoursSource: 'computed' },
  { id: 'jb-8', pipedriveDealId: 'PD-1008', clientId: 'cl-8', address: '10 Plumer St, Auchenflower', category: 'Residential', totalValue: 16 * RATE_PER_HOUR, targetHours: 16, dateWon: '2026-06-01', actualHoursSource: 'computed' },
]

export const scheduleBlocks: ScheduleBlock[] = [
  { id: 'sb-1', jobId: 'jb-1', teamId: 'tm-a', workArea: 'External', startDate: '2026-07-06', endDate: '2026-07-20', phaseHours: 90, status: 'Scheduled', percentComplete: 65, percentCompleteUpdatedBy: 'Cornel', percentCompleteUpdatedAt: '2026-07-12' },
  { id: 'sb-2', jobId: 'jb-1', teamId: 'tm-b', workArea: 'External', startDate: '2026-07-27', endDate: '2026-08-15', phaseHours: 124, status: 'Scheduled', percentComplete: 0 },
  { id: 'sb-3', jobId: 'jb-2', teamId: 'tm-b', workArea: 'External', startDate: '2026-07-06', endDate: '2026-07-08', phaseHours: 24, status: 'In Production', percentComplete: 40 },
  { id: 'sb-4', jobId: 'jb-3', teamId: 'tm-b', workArea: 'Internal', startDate: '2026-07-13', endDate: '2026-07-17', phaseHours: 40, status: 'Scheduled', percentComplete: 0 },
  { id: 'sb-5', jobId: 'jb-4', teamId: 'tm-c', workArea: 'Roof', startDate: '2026-07-06', endDate: '2026-07-12', phaseHours: 40, status: 'In Production', percentComplete: 55, notes: 'Runs into weekend' },
  { id: 'sb-6', jobId: 'jb-5', teamId: 'tm-matt-1', workArea: 'External', startDate: '2026-07-06', endDate: '2026-07-10', phaseHours: 40, status: 'In Production', percentComplete: 70 },
  { id: 'sb-7', jobId: 'jb-6', teamId: 'tm-matt-2', workArea: 'Decks', startDate: '2026-07-13', endDate: '2026-07-19', phaseHours: 40, status: 'Scheduled', percentComplete: 0 },
  { id: 'sb-8', jobId: 'jb-7', teamId: 'tm-rossi-1', workArea: 'External', startDate: '2026-07-08', endDate: '2026-07-10', phaseHours: 24, status: 'In Production', percentComplete: 50 },
  { id: 'sb-9', jobId: 'jb-8', teamId: 'tm-dillon-1', workArea: 'Internal', startDate: '2026-07-09', endDate: '2026-07-10', phaseHours: 16, status: 'In Production', percentComplete: 30 },
]

export const dailyHoursEntries: DailyHoursEntry[] = [
  { id: 'dh-1', scheduleBlockId: 'sb-1', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-06', hours: 8 },
  { id: 'dh-2', scheduleBlockId: 'sb-1', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-07', hours: 8 },
  { id: 'dh-3', scheduleBlockId: 'sb-1', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-08', hours: 7.5 },
  { id: 'dh-4', scheduleBlockId: 'sb-1', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-09', hours: 8 },
  { id: 'dh-5', scheduleBlockId: 'sb-1', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-10', hours: 8 },
  { id: 'dh-6', scheduleBlockId: 'sb-3', teamId: 'tm-b', enteredByUserId: 'u-steve', date: '2026-07-06', hours: 8 },
  { id: 'dh-7', scheduleBlockId: 'sb-3', teamId: 'tm-b', enteredByUserId: 'u-steve', date: '2026-07-07', hours: 8 },
  // 144 Dornoch Tce (sb-5): Team C is primary, but Team A floated 2 days of help onto the same
  // phase — the multi-Team dollar-split scenario (Formula 9 / Decision 33).
  { id: 'dh-8', scheduleBlockId: 'sb-5', teamId: 'tm-c', enteredByUserId: 'u-jordan', date: '2026-07-06', hours: 8 },
  { id: 'dh-9', scheduleBlockId: 'sb-5', teamId: 'tm-c', enteredByUserId: 'u-jordan', date: '2026-07-07', hours: 8 },
  { id: 'dh-10', scheduleBlockId: 'sb-5', teamId: 'tm-c', enteredByUserId: 'u-jordan', date: '2026-07-08', hours: 8 },
  { id: 'dh-11', scheduleBlockId: 'sb-5', teamId: 'tm-c', enteredByUserId: 'u-jordan', date: '2026-07-09', hours: 8 },
  { id: 'dh-12', scheduleBlockId: 'sb-5', teamId: 'tm-c', enteredByUserId: 'u-jordan', date: '2026-07-10', hours: 8 },
  { id: 'dh-13', scheduleBlockId: 'sb-5', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-08', hours: 4 },
  { id: 'dh-14', scheduleBlockId: 'sb-5', teamId: 'tm-a', enteredByUserId: 'u-cornel', date: '2026-07-09', hours: 4 },
]

export const weeklyActuals: WeeklyActual[] = [
  { id: 'wa-1', jobId: 'jb-1', weekEnding: '2026-07-12', actualHours: 40 },
  { id: 'wa-2', jobId: 'jb-2', weekEnding: '2026-07-12', actualHours: 16 },
]

export const users: User[] = [
  { id: 'u-owner', name: 'Christian (Owner)', role: 'owner' },
  { id: 'u-ops', name: 'Priya (Ops Manager)', role: 'ops_manager' },
  { id: 'u-scheduler', name: 'Jess (Scheduler/PM)', role: 'scheduler_pm' },
  { id: 'u-cornel', name: 'Cornel Botha', role: 'team_leader_foreperson', teamId: 'tm-a', workerId: 'wk-1' },
  { id: 'u-jordan', name: 'Jordan Pryce', role: 'team_leader_foreperson', teamId: 'tm-c', workerId: 'wk-6' },
  { id: 'u-liam', name: 'Liam Fraser', role: 'painter_crew_member', teamId: 'tm-a', workerId: 'wk-2' },
]
