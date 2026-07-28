import { Home, Briefcase, Store, Landmark, PaintRoller, Building2, CircleHelp } from 'lucide-react'
import type { JobCategory } from '@/types'

export const JOB_CATEGORY_ICONS: Record<JobCategory, typeof Home> = {
  Residential: Home,
  Corporate: Briefcase,
  Commercial: Store,
  Government: Landmark,
  QPaint: PaintRoller,
  'Work Projects': Building2,
  Other: CircleHelp,
}
