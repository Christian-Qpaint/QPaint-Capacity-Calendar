import { Navigate, Route, Routes } from 'react-router-dom'
import { OfficeLayout } from '@/components/layout/OfficeLayout'
import { FieldLayout } from '@/components/layout/FieldLayout'
import { RequireAuth, RequireMarketingAccess, RequireOfficeRole, RequireUpdateProgressAccess } from '@/components/RouteGuards'
import { useCurrentUser } from '@/context/AuthContext'
import { canAccessMarketing, isOfficeRole } from '@/lib/permissions'
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
  const currentUser = useCurrentUser()
  if (isOfficeRole(currentUser.role)) return <Navigate to="/capacity" replace />
  if (canAccessMarketing(currentUser.role)) return <Navigate to="/marketing" replace />
  return <Navigate to="/log-hours" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHome />} />

        <Route element={<OfficeLayout />}>
          <Route element={<RequireOfficeRole />}>
            <Route path="/capacity" element={<CapacityBoard />} />
            <Route path="/capacity/history" element={<TargetHistory />} />
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/:jobId" element={<JobPhaseScheduling />} />
            <Route path="/calendar" element={<ResourceCalendar />} />
            <Route path="/setup" element={<TeamsContractorsSetup />} />
          </Route>

          <Route element={<RequireMarketingAccess />}>
            <Route path="/marketing" element={<MarketingDashboard />} />
          </Route>
        </Route>

        <Route element={<FieldLayout />}>
          <Route path="/log-hours" element={<LogHours />} />
          <Route element={<RequireUpdateProgressAccess />}>
            <Route path="/update-progress" element={<UpdateProgress />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
