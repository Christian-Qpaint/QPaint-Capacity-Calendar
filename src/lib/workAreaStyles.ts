import type { WorkArea } from '@/types'

export const WORK_AREAS: WorkArea[] = ['External', 'Internal', 'Roof', 'Epoxy Floors', 'Decks']

export const WORK_AREA_STYLES: Record<WorkArea, { dot: string; bg: string; text: string }> = {
  External: { dot: '#F0997B', bg: '#F5C4B3', text: '#4A1B0C' },
  Internal: { dot: '#5DCAA5', bg: '#9FE1CB', text: '#04342C' },
  Roof: { dot: '#EF9F27', bg: '#FAC775', text: '#412402' },
  'Epoxy Floors': { dot: '#AFA9EC', bg: '#CECBF6', text: '#26215C' },
  Decks: { dot: '#ED93B1', bg: '#ED93B1', text: '#4B1528' },
}
