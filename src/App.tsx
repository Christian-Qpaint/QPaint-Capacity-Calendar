import { Navigate, Route, Routes } from 'react-router-dom'
import { OfficeLayout } from '@/components/layout/OfficeLayout'
import { FieldLayout } from '@/components/layout/FieldLayout'
import { RequireAuth, RequireOfficeRole, RequireUpdateProgressAccess } from '@/components/RouteGuards'
import { useCurrentUser } from '@/context/AuthContext'
import { isOfficeRole } from '@/lib/permissions'
import { Login } from '@/pages/Login'
import { CapacityBoard } from '@/pages/office/CapacityBoard'
import { JobsList } from '@/pages/office/JobsList'
import { JobPhaseScheduling } from '@/pages/office/JobPhaseScheduling'
import { ResourceCalendar } from '@/pages/office/ResourceCalendar'
import { TeamsContractorsSetup } from '@/pages/office/TeamsContractorsSetup'
import { LogHours } from '@/pages/field/LogHours'
import { UpdateProgress } from '@/pages/field/UpdateProgress'

function RoleHome() {
  const currentUser = useCurrentUser()
  return <Navigate to={isOfficeRole(currentUser.role) ? '/capacity' : '/log-hours'} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHome />} />

        <Route element={<RequireOfficeRole />}>
          <Route element={<OfficeLayout />}>
            <Route path="/capacity" element={<CapacityBoard />} />
            <Route path="/jobs" element={<JobsList />} />
            <Route path="/jobs/:jobId" element={<JobPhaseScheduling />} />
            <Route path="/calendar" element={<ResourceCalendar />} />
            <Route path="/setup" element={<TeamsContractorsSetup />} />
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
