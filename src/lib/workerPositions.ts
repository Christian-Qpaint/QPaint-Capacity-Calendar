export const WORKER_POSITIONS = ['Apprentice', 'Painter', 'Foreman (Crew Leader)', 'Supervisor'] as const

export const WORKER_POSITION_DESCRIPTIONS: Record<string, string> = {
  Supervisor: 'Supervisor (overseeing all crews under their company)',
  'Foreman (Crew Leader)': 'Foreman (Crew Leader)',
}
