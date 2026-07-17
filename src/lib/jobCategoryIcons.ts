import { Home, Briefcase, Store, Landmark } from 'lucide-react'
import type { JobCategory } from '@/types'

export const JOB_CATEGORY_ICONS: Record<JobCategory, typeof Home> = {
  Residential: Home,
  Corporate: Briefcase,
  Commercial: Store,
  Government: Landmark,
}
