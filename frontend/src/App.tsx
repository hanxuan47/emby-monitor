import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Setup from './pages/Setup'
import AdminLogin from './pages/AdminLogin'
import UserAuth from './pages/UserAuth'
import AdminPanel from './pages/AdminPanel'
import UserPanel from './pages/UserPanel'
import { isLoggedIn, isAdmin, getUser } from './api/auth'

function RootRedirect() {
  const loggedIn = isLoggedIn()
  if (loggedIn) {
    if (isAdmin()) return <Navigate to="/admin" replace />
    return <Navigate to="/user" replace />
  }
  return <AdminLogin />
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/admin/*" element={
          isLoggedIn() && isAdmin() ? <AdminPanel /> : <Navigate to="/" replace />
        } />
        <Route path="/user/*" element={
          isLoggedIn() ? <UserPanel /> : <UserAuth />
        } />
      </Routes>
    </ToastProvider>
  )
}
