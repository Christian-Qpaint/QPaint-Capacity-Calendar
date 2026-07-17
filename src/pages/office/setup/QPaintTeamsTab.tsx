import { useState } from 'react'
import { useData } from '@/context/DataContext'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TeamDrawer } from './drawers/TeamDrawer'
import { todayIso } from '@/lib/schedule'
import { TeamColorDot } from '@/components/TeamColorDot'
import { Plus } from 'lucide-react'
import type { Team } from '@/types'

export function QPaintTeamsTab() {
  const { teams, teamMemberships } = useData()
  const qpaintTeams = teams.filter((t) => t.type === 'QPaint')
  const [selected, setSelected] = useState<Team | null>(null)
  const [creating, setCreating] = useState(false)

  const today = todayIso()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Internal crews — click a row for members, capacity, and floating staff.</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add QPaint Team
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Headcount</TableHead>
              <TableHead>Std hrs/week</TableHead>
              <TableHead>Weekly capacity</TableHead>
              <TableHead>Core members</TableHead>
              <TableHead>Floating this week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {qpaintTeams.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No QPaint teams yet — add one to get started.
                </TableCell>
              </TableRow>
            )}
            {qpaintTeams.map((team) => {
              const coreCount = teamMemberships.filter((m) => m.teamId === team.id && m.membershipType === 'Core').length
              const floatingCount = teamMemberships.filter(
                (m) => m.teamId === team.id && m.membershipType === 'Floating' && m.startDate <= today && (!m.endDate || m.endDate >= today),
              ).length
              return (
                <TableRow key={team.id} className="cursor-pointer" onClick={() => setSelected(team)}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <TeamColorDot team={team} />
                      {team.name}
                    </span>
                  </TableCell>
                  <TableCell>{team.headcount ?? '—'}</TableCell>
                  <TableCell>{team.standardHoursPerWeek ?? '—'}</TableCell>
                  <TableCell>{(team.headcount ?? 0) * (team.standardHoursPerWeek ?? 0)} hrs</TableCell>
                  <TableCell>{coreCount}</TableCell>
                  <TableCell className="text-muted-foreground">{floatingCount || '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <TeamDrawer open={!!selected} onOpenChange={(open) => !open && setSelected(null)} team={selected} />
      <TeamDrawer open={creating} onOpenChange={setCreating} team={null} />
    </div>
  )
}
