import { Navigate, Route, Routes } from 'react-router-dom'
import { OfficeLayout } from '@/components/layout/OfficeLayout'
import { FieldLayout } from '@/components/layout/FieldLayout'
import { RequireAuth, RequirePermission } from '@/components/RouteGuards'
import { usePermissions } from '@/context/PermissionsContext'
import { Login } from '@/pages/Login'
import { CapacityBoard } from '@/pages/office/CapacityBoard'
import { TargetHistory } from '@/pages/office/TargetHistory'
import { JobsList } from '@/pages/office/JobsList'
import { JobPhaseScheduling } from '@/pages/office/JobPhaseScheduling'
import { ResourceCalendar } from '@/pages/office/ResourceCalendar'
import { TeamsContractorsSetup } from '@/pages/office/TeamsContractorsSetup'
import { MarketingDashboard } from '@/pages/office/marketing/MarketingDashboard'
import { LogHours } from '@/pages/field/LogHours'
import { UpdateProgress } from '@/pages/field/UpdateProgress'

function RoleHome() {
  const { hasPermission } = usePermissions()
  if (hasPermission('production.view')) return <Navigate to="/capacity" replace />
  if (hasPermission('deals.view')) return <Navigate to="/jobs" replace />
  if (hasPermission('scheduler.view')) return <Navigate to="/calendar" replace />
  if (hasPermission('marketing.view')) return <Navigate to="/marketing" replace />
  return <Navigate to="/log-hours" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHome />} />

        <Route element={<OfficeLayout />}>
          <Route element={<RequirePermission permissionKey="production.view" />}>
            <Route path="/capacity" element={<CapacityBoard />} />
            <Route path="/capacity/history" element={<TargetHistory />} />
          </Route>

          <Route element={<RequirePermission permissionKey="deals.view" />}>
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/:jobId" element={<JobPhaseScheduling />} />
          </Route>

          <Route element={<RequirePermission permissionKey="scheduler.view" />}>
            <Route path="/calendar" element={<ResourceCalendar />} />
          </Route>

          <Route element={<RequirePermission permissionKey="settings.view" />}>
            <Route path="/setup" element={<TeamsContractorsSetup />} />
          </Route>

          <Route element={<RequirePermission permissionKey="marketing.view" />}>
            <Route path="/marketing" element={<MarketingDashboard />} />
          </Route>
        </Route>

        <Route element={<FieldLayout />}>
          <Route path="/log-hours" element={<LogHours />} />
          <Route element={<RequirePermission permissionKey="field.update_progress" />}>
            <Route path="/update-progress" element={<UpdateProgress />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
