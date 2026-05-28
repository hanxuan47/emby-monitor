import { useState, useEffect } from 'react'
import { apiGet } from '../api/client'
import { Sidebar, TabBar } from '../components/Layout'
import { Dashboard, Checkin, Settings, Placeholder } from './AdminPanel'
import MediaDiscovery from './MediaDiscovery'
import { MyRequests } from './Requests'
import { TgBind } from './TgBind'
import { AiUserReport } from './AiPanel'
import { Spinner } from './Setup'

export default function UserPanel() {
  const [page, setPage] = useState('discovery')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('ebu') || '{}')) } catch {}
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar currentPage={page} onNavigate={setPage} />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen p-5 max-md:p-3 max-md:pb-20">
        <div className="page-enter">
          {page === 'discovery' && <MediaDiscovery />}
          {page === 'my-requests' && <MyRequests />}
          {page === 'tg' && <TgBind />}
          {page === 'ai' && <AiUserReport />}
          {page === 'dashboard' && <Dashboard user={user} />}
          {page === 'checkin' && <Checkin user={user} />}
          {page === 'settings' && <Settings user={user} isAdmin={false} />}
          {!['discovery','my-requests','dashboard','checkin','settings'].includes(page) && <Placeholder name={page} />}
        </div>
      </main>
      <TabBar currentPage={page} onNavigate={setPage} />
    </div>
  )
}
