import { lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import Login from './pages/Login'
import AdminLogin from './pages/admin/AdminLogin'
import AdminShell from './pages/admin/AdminShell'
import Activity from './pages/admin/Activity'
import Admins from './pages/admin/Admins'
import Customers from './pages/admin/Customers'
import NewCustomer from './pages/admin/NewCustomer'
import { PageSkeleton } from './components/ui/States'
import { useSession } from './lib/session'
import { AdminProvider, useAdmin } from './lib/admin'

/**
 * One chunk per route.
 *
 * The shell, the navigation and the shared UI stay in the entry chunk because
 * every route needs them. The pages don't: someone landing on the Dashboard
 * has no use for the conversation view, which is the largest page here by a
 * wide margin. Six routes is the right granularity — splitting finer would
 * trade a smaller first load for a request per component.
 *
 * The sign-in pages are NOT split. They are the first thing most visits
 * render, so a separate chunk would add a round trip to the one page that has
 * to be quick.
 *
 * The Suspense boundary that covers the lazy pages lives in AppShell, around
 * the same Outlet that renders them.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Conversations = lazy(() => import('./pages/Conversations'))
const CallLogs = lazy(() => import('./pages/CallLogs'))
const Agents = lazy(() => import('./pages/Agents'))
const PhoneNumbers = lazy(() => import('./pages/PhoneNumbers'))

/**
 * Nothing behind this renders for a signed-out visitor.
 *
 * It is a convenience, not the security boundary — every `/api/*` route checks
 * the session itself, so a bypassed guard would show empty pages rather than
 * anyone else's data. Guards that are the only check are how data leaks.
 */
function RequireSession() {
  const { status } = useSession()
  const location = useLocation()

  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-out') {
    // Carry where they were headed, so signing in resumes it rather than
    // dropping them on the dashboard.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <AppShell />
}

/** The same idea for the admin surface, against its own session. */
function RequireAdmin() {
  const { status } = useAdmin()
  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-out') return <Navigate to="/admin/login" replace />
  return <AdminShell />
}

/**
 * The admin routes carry their own provider.
 *
 * Mounted here rather than around the whole app so that a customer's browser
 * never calls /api/admin/me at all — there is nothing for it there, and asking
 * would only add a request to every cold load of the console.
 */
function AdminRoutes() {
  return (
    <AdminProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<RequireAdmin />}>
          <Route index element={<Customers />} />
          <Route path="customers/new" element={<NewCustomer />} />
          <Route path="admins" element={<Admins />} />
          <Route path="activity" element={<Activity />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AdminProvider>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Customers cannot create accounts — there is no register route. An
          administrator provisions them at /admin. */}
      <Route path="/login" element={<Login />} />
      <Route path="/admin/*" element={<AdminRoutes />} />

      <Route element={<RequireSession />}>
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
