import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Analytics from './pages/Analytics'
import Conversations from './pages/Conversations'
import CallLogs from './pages/CallLogs'
import Agents from './pages/Agents'
import PhoneNumbers from './pages/PhoneNumbers'
import { useDataSource } from './lib/useDataSource'

export default function App() {
  // Reports whether pages are reading the live workspace or bundled samples.
  const source = useDataSource()

  return (
    <Routes>
      <Route element={<AppShell source={source} />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="conversations/:id" element={<Conversations />} />
        <Route path="call-logs" element={<CallLogs />} />
        <Route path="agents" element={<Agents />} />
        <Route path="phone-numbers" element={<PhoneNumbers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
