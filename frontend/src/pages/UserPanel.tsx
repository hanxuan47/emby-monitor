import { useState, useEffect } from 'react'
import { apiGet } from '../api/client'
import { Sidebar, TabBar } from '../components/Layout'
import { Dashboard, Checkin, Settings, Placeholder } from './AdminPanel'
import MediaDiscovery from './MediaDiscovery'
import { MyRequests } from './Requests'
import { TgBind } from './TgBind'
import { AiUserReport } from './AiPanel'
import { ServerRoutes } from './ServerRoutes'
import { Announcements } from './Announcements'
import { WikiViewer } from './WikiViewer'
import { Spinner } from './Setup'

export default function UserPanel() {
  const [page, setPage] = useState('discovery')
  const [user, setUser] = useState<any>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('ebu') || '{}')) } catch {}
  }, [])

  return (
    <div className="flex min-h-screen bg-[#0a0c14]">
      <Sidebar currentPage={page} onNavigate={setPage} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen p-5 max-md:p-3 max-md:pb-20">
        {/* ── Mobile hamburger ── */}
        <button
          className="md:hidden mb-3 p-2 -ml-1 rounded-lg hover:bg-[rgba(255,255,255,0.06)] active:scale-90 transition-transform text-white/50"
          onClick={() => setMobileOpen(true)}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <div className="page-enter">
          {page === 'discovery' && <MediaDiscovery />}
          {page === 'my-requests' && <MyRequests />}
          {page === 'tg' && <TgBind />}
          {page === 'ai' && <AiUserReport />}
          {page === 'sites' && <ServerRoutes />}
          {page === 'announcements' && <Announcements />}
          {page === 'wiki' && <WikiViewer />}
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
