import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useData } from '@/context/DataContext'
import { usePermissions } from '@/context/PermissionsContext'
import { usePersistedState } from '@/hooks/usePersistedState'
import { cn } from '@/lib/utils'
import { QPaintTeamsTab } from './setup/QPaintTeamsTab'
import { ContractorsTab } from './setup/ContractorsTab'
import { WorkersTab } from './setup/WorkersTab'
import { ArrowRight, ChevronDown, ChevronUp, CircleCheck, CircleDot, Lightbulb } from 'lucide-react'

type WorkforceTab = 'qpaint' | 'contractors' | 'workers'

interface Step {
  number: number
  tab: WorkforceTab
  title: string
  why: ReactNode
  status: 'done' | 'todo' | 'optional'
  detail: string
}

/** Everything the crews, contractors and people of QPaint hang off — split out of Settings so a
 * non-technical user lands on a page that tells them what to do first, in order, instead of three
 * unexplained tabs. The steps follow the real prerequisites: crews first (people and logins attach
 * to a crew), contractors next (contractor staff need their company), then the people. */
export function Workforce() {
  const { teams, contractors, workers, teamMemberships } = useData()
  const { hasPermission } = usePermissions()
  const [tab, setTab] = useState<WorkforceTab>('qpaint')
  const [guideOpen, setGuideOpen] = usePersistedState('qpaint:workforce:guideOpen', true)

  const crewCount = teams.filter((t) => t.type === 'QPaint').length
  const contractorCount = contractors.length
  const workerCount = workers.length
  const coreWorkerIds = new Set(teamMemberships.filter((m) => m.membershipType === 'Core').map((m) => m.workerId))
  const floatingCount = workers.filter((w) => w.workerType === 'Internal' && !coreWorkerIds.has(w.id)).length

  const steps: Step[] = [
    {
      number: 1,
      tab: 'qpaint',
      title: 'Set up your crews',
      why: 'A crew is a team that gets booked onto jobs. Start here — your people, your crew leaders’ logins and the Scheduler all attach to a crew.',
      status: crewCount > 0 ? 'done' : 'todo',
      detail: crewCount > 0 ? `${crewCount} ${crewCount === 1 ? 'crew' : 'crews'} set up` : 'No crews yet',
    },
    {
      number: 2,
      tab: 'contractors',
      title: 'Add contractors (only if you use them)',
      why: 'Subcontractor companies and their crews. Skip this step if you only work with your own staff.',
      status: contractorCount > 0 ? 'done' : 'optional',
      detail: contractorCount > 0 ? `${contractorCount} added` : 'Optional',
    },
    {
      number: 3,
      tab: 'workers',
      title: 'Add your people',
      why: (
        <>
          Everyone who works on site — employees and contractor staff. You can add someone before you know their crew; they show as{' '}
          <strong>Floating</strong> until you pick one. Contractor staff need their company added first (step 2).
        </>
      ),
      status: workerCount > 0 ? 'done' : 'todo',
      detail: workerCount > 0 ? `${workerCount} ${workerCount === 1 ? 'person' : 'people'}${floatingCount > 0 ? ` · ${floatingCount} floating` : ''}` : 'No people yet',
    },
  ]

  const nextStep = steps.find((s) => s.status === 'todo')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium">Workforce</h1>
          <p className="text-sm text-muted-foreground">Your crews, contractors and people — what the Scheduler and Production pages are built on.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setGuideOpen((v) => !v)}>
          <Lightbulb /> {guideOpen ? 'Hide guide' : 'Show guide'}
          {guideOpen ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {guideOpen && (
        <Card className="gap-4 border-2 bg-muted/40 p-4">
          <div>
            <p className="text-sm font-semibold">Start here — do these in order</p>
            <p className="text-xs text-muted-foreground">
              {nextStep ? `Next up: step ${nextStep.number} — ${nextStep.title.toLowerCase()}.` : 'Everything is set up. You can come back to any step to add or change things.'}
            </p>
          </div>
          <ol className="space-y-2">
            {steps.map((s) => {
              const isNext = nextStep?.number === s.number
              return (
                <li
                  key={s.number}
                  className={cn(
                    'flex flex-wrap items-start gap-3 rounded-lg bg-card p-3 shadow-xs',
                    isNext && 'ring-2 ring-info-fill',
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {s.status === 'done' ? (
                      <CircleCheck className="size-5 text-success" aria-label="Done" />
                    ) : (
                      <CircleDot className={cn('size-5', isNext ? 'text-info' : 'text-muted-foreground')} aria-label="To do" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      Step {s.number}: {s.title}
                      {isNext && <Badge className="bg-info-bg text-info hover:bg-info-bg">Do this first</Badge>}
                      {s.status === 'optional' && <Badge variant="secondary">Optional</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.why}</p>
                    <p className="text-xs font-medium">{s.detail}</p>
                  </div>
                  <Button size="sm" variant={isNext ? 'default' : 'outline'} onClick={() => setTab(s.tab)}>
                    {s.status === 'done' ? 'Open' : 'Go'} <ArrowRight />
                  </Button>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            After that: give each crew leader their own login
            {hasPermission('settings.manage_users') ? (
              <>
                {' '}in <Link to="/settings" className="font-medium text-info hover:underline">Settings</Link>
              </>
            ) : (
              ' (ask the owner — it’s done in Settings)'
            )}
            , then book crews onto jobs in the Scheduler.
          </p>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as WorkforceTab)}>
        <TabsList>
          <TabsTrigger value="qpaint">1. QPaint Teams</TabsTrigger>
          <TabsTrigger value="contractors">2. Contractors</TabsTrigger>
          <TabsTrigger value="workers">3. Workers</TabsTrigger>
        </TabsList>
        <TabsContent value="qpaint" className="pt-4">
          <QPaintTeamsTab />
        </TabsContent>
        <TabsContent value="contractors" className="pt-4">
          <ContractorsTab />
        </TabsContent>
        <TabsContent value="workers" className="pt-4">
          <WorkersTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
