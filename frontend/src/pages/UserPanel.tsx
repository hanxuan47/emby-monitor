import { useState, useEffect } from 'react'
import { apiGet } from '../api/client'
import { Sidebar, TabBar } from '../components/Layout'
import Dashboard from './AdminPanel'
import { Spinner } from './Setup'

// Re-export from AdminPanel's section components
import AdminPanelModule from './AdminPanel'

export default function UserPanel() {
  const [page, setPage] = useState('dashboard')
  const [user, setUser] = useState<any>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('ebu') || '{}')) } catch {}
    apiGet('/api/config/status').then(r => { if (r.connected) setConnected(true) })
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen p-5 max-md:p-3 max-md:pb-20">
        <div className="page-enter">
          <h1 className="text-2xl font-bold">用户面板</h1>
          <p className="text-sm text-[rgba(255,255,255,0.5)] mt-2">Emby Monitor · 用户端</p>
        </div>
      </main>
      <TabBar currentPage={page} onNavigate={setPage} />
    </div>
  )
}
