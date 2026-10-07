import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { OfficeLayout } from '@/components/layout/OfficeLayout'
import { FieldLayout } from '@/components/layout/FieldLayout'
import { RequireAuth, RequirePermission } from '@/components/RouteGuards'
import { usePermissions } from '@/context/PermissionsContext'
import { Login } from '@/pages/Login'
import { AcceptInvite } from '@/pages/AcceptInvite'
import { CapacityBoard } from '@/pages/office/CapacityBoard'
import { TargetHistory } from '@/pages/office/TargetHistory'
import { JobsList } from '@/pages/office/JobsList'
import { JobPhaseScheduling } from '@/pages/office/JobPhaseScheduling'
import { ResourceCalendar } from '@/pages/office/ResourceCalendar'
import { SalesAvailability } from '@/pages/office/SalesAvailability'
import { Workforce } from '@/pages/office/Workforce'
import { Settings } from '@/pages/office/Settings'
import { MarketingDashboard } from '@/pages/office/marketing/MarketingDashboard'
import { AdsManagement } from '@/pages/office/marketing/AdsManagement'
import { FinanceOverview } from '@/pages/office/FinanceOverview'
import { CrmBoard } from '@/pages/office/deals/CrmBoard'
import { CrmConfig } from '@/pages/office/deals/CrmConfig'
import { LogHours } from '@/pages/field/LogHours'
import { UpdateProgress } from '@/pages/field/UpdateProgress'
import { CrewProduction } from '@/pages/field/CrewProduction'

// The old combined Settings page lived at /setup: crews/contractors/workers moved to /workforce,
// accounts (?tab=users / invites) to /settings — keep old links and bookmarks working.
function SetupRedirect() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab')
  if (tab === 'users' || tab === 'invites') return <Navigate to={`/settings?tab=${tab}`} replace />
  return <Navigate to="/workforce" replace />
}

function RoleHome() {
  const { hasPermission } = usePermissions()
  if (hasPermission('production.view')) return <Navigate to="/capacity" replace />
  if (hasPermission('crm.view')) return <Navigate to="/deals" replace />
  if (hasPermission('jobs.view')) return <Navigate to="/jobs" replace />
  if (hasPermission('scheduler.view')) return <Navigate to="/calendar" replace />
  if (hasPermission('sales.view_availability')) return <Navigate to="/sales" replace />
  if (hasPermission('marketing.view')) return <Navigate to="/marketing" replace />
  // Crew Leaders have no other permission above (no office/CRM/marketing access) and no longer
  // have field.log_hours either — their only Field page is their restricted Production view.
  if (hasPermission('field.view_production')) return <Navigate to="/my-production" replace />
  return <Navigate to="/log-hours" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHome />} />

        <Route element={<OfficeLayout />}>
          <Route element={<RequirePermission permissionKey="production.view" />}>
            <Route path="/capacity" element={<CapacityBoard />} />
            <Route path="/capacity/history" element={<TargetHistory />} />
          </Route>

          <Route element={<RequirePermission permissionKey="jobs.view" />}>
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/:jobId" element={<JobPhaseScheduling />} />
          </Route>

          <Route element={<RequirePermission permissionKey="crm.view" />}>
            <Route path="/deals" element={<CrmBoard />} />
            <Route element={<RequirePermission permissionKey="crm.manage_config" />}>
              <Route path="/deals/config" element={<CrmConfig />} />
            </Route>
          </Route>

          <Route element={<RequirePermission permissionKey="scheduler.view" />}>
            <Route path="/calendar" element={<ResourceCalendar />} />
          </Route>

          <Route element={<RequirePermission permissionKey="sales.view_availability" />}>
            <Route path="/sales" element={<SalesAvailability />} />
          </Route>

          <Route element={<RequirePermission permissionKey="workforce.view" />}>
            <Route path="/workforce" element={<Workforce />} />
          </Route>

          <Route element={<RequirePermission permissionKey="settings.manage_users" />}>
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="/setup" element={<SetupRedirect />} />

          <Route element={<RequirePermission permissionKey="marketing.view" />}>
            <Route path="/marketing" element={<MarketingDashboard />} />
          </Route>

          <Route element={<RequirePermission permissionKey="marketing.ads_management" />}>
            <Route path="/marketing/ads-management" element={<AdsManagement />} />
          </Route>

          <Route element={<RequirePermission permissionKey="finance.view" />}>
            <Route path="/finance" element={<FinanceOverview />} />
          </Route>
        </Route>

        <Route element={<FieldLayout />}>
          <Route element={<RequirePermission permissionKey="field.log_hours" />}>
            <Route path="/log-hours" element={<LogHours />} />
          </Route>
          <Route element={<RequirePermission permissionKey="field.update_progress" />}>
            <Route path="/update-progress" element={<UpdateProgress />} />
          </Route>
          <Route element={<RequirePermission permissionKey="field.view_production" />}>
            <Route path="/my-production" element={<CrewProduction />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
