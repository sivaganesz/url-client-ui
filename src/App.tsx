import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { useDataSource } from './lib/useDataSource'

/**
 * One chunk per route.
 *
 * The shell, the navigation and the shared UI stay in the entry chunk because
 * every route needs them. The pages don't: someone landing on the Dashboard
 * has no use for the conversation view, which is the largest page here by a
 * wide margin. Six routes is the right granularity — splitting finer would
 * trade a smaller first load for a request per component.
 *
 * The Suspense boundary that covers these lives in AppShell, around the same
 * Outlet that renders them.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Conversations = lazy(() => import('./pages/Conversations'))
const CallLogs = lazy(() => import('./pages/CallLogs'))
const Agents = lazy(() => import('./pages/Agents'))
const PhoneNumbers = lazy(() => import('./pages/PhoneNumbers'))

export default function App() {
  // Reports whether pages are reading the live workspace or nothing at all.
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
