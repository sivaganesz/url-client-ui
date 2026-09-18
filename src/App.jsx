import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import Overview from './pages/Overview'
import Conversations from './pages/Conversations'
import Customers from './pages/Customers'
import Channels from './pages/Channels'
import Assistants from './pages/Assistants'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="conversations/:id" element={<Conversations />} />
        <Route path="customers" element={<Customers />} />
        <Route path="channels" element={<Channels />} />
        <Route path="assistants" element={<Assistants />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
