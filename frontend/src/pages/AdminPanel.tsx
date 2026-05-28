import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'
import { Sidebar, TabBar } from '../components/Layout'
import MediaDiscovery from './MediaDiscovery'
import CardManage from './CardManage'
import { AiAdminPanel } from './AiPanel'
import { TgBroadcast } from './TgBind'
import { MyRequests, AdminRequests } from './Requests'
import { UserMap } from './UserMap'
import { EmbyUserManage } from './EmbyUserManage'
import AdminSites from './AdminSites'
import AdminAnnouncements from './AdminAnnouncements'
import AdminWiki from './AdminWiki'

// ─── Page Components ─────────────────────────────────────────

export function Dashboard({ user }: { user: any }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    apiGet('/api/dashboard/summary').then(setData).catch(() => {})
  }, [])
  if (!data) return <div className="flex justify-center py-20"><Spinner /></div>
  if (data.error) return <div className="text-center py-20 text-[rgba(255,255,255,0.5)]"><p>请先在设置中配置 Emby 连接</p><button className="glass-btn glass-btn-primary mt-4" onClick={() => window.location.href='/admin'}>去设置</button></div>

  return (
    <div className="space-y-5">
      {/* ── 欢迎横幅 ── */}
      <div className="glass-ios p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.07] to-purple-500/[0.04]" />
        <div className="relative">
          <div className="text-xs text-[rgba(255,255,255,0.3)] font-medium tracking-wider uppercase mb-1">Overview</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {user?.username ? `${user.username}，晚上好` : '仪表盘'}
          </h1>
          <p className="text-sm text-[rgba(255,255,255,0.35)] mt-1">
            当前有 <span className="text-white/60 font-semibold">{data.active_streams}</span> 个活跃流，<span className="text-white/60 font-semibold">{data.online_users}</span> 人在线
          </p>
        </div>
      </div>

      {/* ── 核心指标卡片 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          label="活跃流"
          value={data.active_streams}
          sub={`直连 ${data.direct_play} / 转码 ${data.transcoding_now}`}
        />
        <StatCard
          icon="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
          label="在线用户"
          value={data.online_users}
          sub={`共 ${data.total_users} 用户`}
        />
        <StatCard
          icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          label="媒体总数"
          value={(data.total_items || 0).toLocaleString()}
          sub={data.total_size_gb ? `${data.total_size_gb} GB` : ''}
        />
        <StatCard
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          label="今日播放"
          value={data.today_plays}
          sub="今日累计"
        />
      </div>

      {/* ── 播放详情 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GlassCard title="播放方式">
          <div className="space-y-3">
            <BarRow label="直连" value={data.direct_play} total={data.active_streams || 1} color="rgba(59,130,246,0.6)" />
            <BarRow label="转码" value={data.transcoding_now} total={data.active_streams || 1} color="rgba(168,85,247,0.6)" />
          </div>
        </GlassCard>

        <GlassCard title="今日概览">
          <div className="grid grid-cols-2 gap-3">
            <IconStat icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" label="总带宽" value={data.total_bitrate_kbps ? `${data.total_bitrate_kbps} Kbps` : '0'} />
            <IconStat icon="M3 5h18v14H3V5zm4 2v10M15 7v10" label="总媒体" value={String(data.total_items || 0)} />
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

// ─── iOS 风格子组件 ────────────────────────────────────────────

function GlassCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-ios p-4">
      <div className="text-[.65rem] font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">{title}</div>
      {children}
    </div>
  )
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: any; sub?: string }) {
  return (
    <div className="glass-ios p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[rgba(59,130,246,0.1)] flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={icon} strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-[.65rem] text-[rgba(255,255,255,0.3)] font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[.6rem] text-[rgba(255,255,255,0.2)]">{sub}</div>}
    </div>
  )
}

function IconStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[rgba(255,255,255,0.03)]">
      <svg className="w-4 h-4 shrink-0 text-[rgba(255,255,255,0.25)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d={icon} strokeLinecap="round" />
      </svg>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-white/70">{value}</div>
        <div className="text-[.6rem] text-[rgba(255,255,255,0.2)]">{label}</div>
      </div>
    </div>
  )
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-[rgba(255,255,255,0.4)]">{label}</span>
        <span className="text-white/60 font-semibold">{value} <span className="text-[rgba(255,255,255,0.2)] font-normal">({pct}%)</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function Checkin({ user }: { user: any }) {
  const [status, setStatus] = useState<any>(null)
  const load = () => apiGet('/api/checkin/status?token=' + localStorage.getItem('ebt')).then(setStatus)
  useEffect(() => { load() }, [])

  async function doCheckin() {
    const r = await apiPost('/api/checkin', { token: localStorage.getItem('ebt') || '' })
    if (r.ok) { load() }
  }

  if (!status) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">每日签到</h1>
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          [status.total_points || 0, '总积分'],
          [status.streak || 0, '连续签到'],
          [status.checked_in_today ? '已签到 ✅' : '待签到 ⏳', '状态'],
        ].map(([v, label]) => (
          <div key={label} className="stat-card text-center"><div className="stat-value text-2xl">{v}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>
      {!status.checked_in_today && (
        <button className="glass-btn glass-btn-primary w-full py-4 text-base mb-5" onClick={doCheckin}>🎯 签到领积分</button>
      )}
    </div>
  )
}

export function Settings({ user, isAdmin }: { user: any; isAdmin: boolean }) {
  const { toast } = useToast()
  const [mc, setMc] = useState<any>(null)
  const [regStatus, setRegStatus] = useState<any>(null)
  const [tmdbKey, setTmdbKey] = useState('')
  const load = () => {
    apiGet('/api/config/masked').then(setMc)
    if (isAdmin) apiGet('/api/auth/register-status').then(setRegStatus)
    // Check TMDB config
    apiGet('/api/auth/register-status').then(() => {
      const stored = localStorage.getItem('tmdb_key') || ''
      setTmdbKey(stored)
    })
  }
  useEffect(() => { load() }, [])

  async function saveTmdb() {
    const key = tmdbKey.trim()
    if (!key) { toast('请输入TMDB API Key', 'error'); return }
    const r = await apiPost('/api/config/tmdb', { token: localStorage.getItem('ebt') || '', api_key: key })
    if (r.ok) { localStorage.setItem('tmdb_key', key); toast('TMDB 配置已保存') }
    else toast(r.error || '保存失败', 'error')
  }

  async function saveConfig() {
    const host = (document.getElementById('cfgH') as HTMLInputElement)?.value
    const key = (document.getElementById('cfgK') as HTMLInputElement)?.value
    const name = (document.getElementById('cfgN') as HTMLInputElement)?.value || 'My Emby'
    if (!host || !key) { toast('请填写地址和Key', 'error'); return }
    const r = await apiPost('/api/config', { host, api_key: key, name })
    if (r.ok) toast('已连接 ' + (r.server_name || ''))
    else toast(r.error || '连接失败', 'error')
  }

  async function toggleReg() {
    if (!regStatus) return
    const en = !regStatus.enabled
    const r = await apiPost('/api/admin/registration', { token: localStorage.getItem('ebt') || '', enabled: en ? '1' : '0' })
    if (r.ok) { toast(en ? '注册已开放' : '注册已关闭'); load() }
    else toast('操作失败', 'error')
  }

  async function saveProfile() {
    const eu = (document.getElementById('pEU') as HTMLInputElement)?.value
    const ei = (document.getElementById('pEI') as HTMLInputElement)?.value
    const r = await apiPost('/api/auth/update-profile', { token: localStorage.getItem('ebt') || '', emby_username: eu, emby_user_id: ei })
    if (r.ok) toast('已保存')
    else toast(r.error || '保存失败', 'error')
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">设置</h1>
      {mc && (
        <div className="glass-card max-w-[480px]">
          <div className="section-title font-semibold mb-3">🔗 Emby 连接</div>
          <div className="space-y-3">
            <input id="cfgN" className="glass-input" placeholder="名称" defaultValue={mc.name || ''} />
            <input id="cfgH" className="glass-input" placeholder="http://192.168.1.100:8096" defaultValue={mc.host || ''} />
            <input id="cfgK" type="password" className="glass-input" placeholder="API Key" defaultValue={mc.api_key || ''} />
            <div className="text-[.7rem] text-right text-[rgba(255,255,255,0.3)]">{mc.connected ? '✅ 已连接' : '⏻ 待连接'}</div>
          </div>
          <button className="glass-btn glass-btn-primary w-full mt-4" onClick={saveConfig}>保存连接</button>
        </div>
      )}
      {isAdmin && (
        <div className="glass-card max-w-[480px]">
          <div className="section-title font-semibold mb-3">🎬 TMDB 配置（影视搜索用）</div>
          <div className="space-y-3">
            <input className="glass-input" placeholder="TMDB API Key (v3 auth)" value={tmdbKey} onChange={e => setTmdbKey(e.target.value)} />
            <div className="text-[.65rem] text-[rgba(255,255,255,0.3)]">
              在 <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa]">TMDB API 设置</a> 获取
            </div>
          </div>
          <button className="glass-btn glass-btn-primary w-full mt-4" onClick={saveTmdb}>保存 TMDB Key</button>
        </div>
      )}
      {isAdmin && regStatus && (
        <div className="glass-card max-w-[480px]">
          <div className="section-title font-semibold mb-3">👥 用户注册</div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[rgba(255,255,255,0.5)]">{regStatus.enabled ? '🟢 注册开放' : '🔴 注册已关闭'}</span>
            <button className={`glass-btn glass-btn-sm ${regStatus.enabled ? 'glass-btn-danger' : 'glass-btn-primary'}`} onClick={toggleReg}>
              {regStatus.enabled ? '关闭注册' : '开放注册'}
            </button>
          </div>
        </div>
      )}
      <div className="glass-card max-w-[480px]">
        <div className="section-title font-semibold mb-3">👤 资料</div>
        <div className="space-y-3">
          <input id="pEU" className="glass-input" placeholder="Emby 用户名" defaultValue={user.emby_username || ''} />
          <input id="pEI" className="glass-input" placeholder="Emby User ID" defaultValue={user.emby_user_id || ''} />
        </div>
        <button className="glass-btn glass-btn-primary w-full mt-4" onClick={saveProfile}>保存</button>
      </div>
    </div>
  )
}

export function Placeholder({ name }: { name: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">{name}</h1>
      <div className="glass-card text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">功能开发中...</div>
    </div>
  )
}

// ─── Admin Panel ─────────────────────────────────────────────

export default function AdminPanel() {
  const [page, setPage] = useState('dashboard')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('ebu') || '{}')) } catch {}
  }, [])

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard user={user} />,
    cards: <CardManage />,
    'discovery': <MediaDiscovery />,
    'my-requests': <MyRequests />,
    checkin: <Checkin user={user} />,
    streams: <Placeholder name="实时流" />,
    sessions: <Placeholder name="活跃会话" />,
    'media-recent': <Placeholder name="最近更新" />,
    'media-reviews': <Placeholder name="评价" />,
    users: <Placeholder name="用户活动" />,
    'users-mgmt': <EmbyUserManage />,
    sites: <AdminSites />,
    'announcements-admin': <AdminAnnouncements />,
    'wiki-admin': <AdminWiki />,
    library: <Placeholder name="媒体库" />,
    codec: <Placeholder name="编码分析" />,
    tickets: <Placeholder name="工单" />,
    'admin-requests': <AdminRequests />,
    'ai-admin': <AiAdminPanel />,
    'user-map': <UserMap />,
    broadcast: <TgBroadcast />,
    notifications: <Placeholder name="通知" />,
    settings: <Settings user={user} isAdmin={true} />,
  }

  return <PanelShell page={page} onNavigate={setPage}>{pages[page] || <Dashboard user={user} />}</PanelShell>
}

// ─── User Panel ──────────────────────────────────────────────

export function UserPanel() {
  const [page, setPage] = useState('dashboard')
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem('ebu') || '{}')) } catch {}
  }, [])

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard user={user} />,
    checkin: <Checkin user={user} />,
    streams: <Placeholder name="实时流" />,
    'media-recent': <Placeholder name="最近更新" />,
    'media-reviews': <Placeholder name="评价" />,
    library: <Placeholder name="媒体库" />,
    codec: <Placeholder name="编码分析" />,
    tickets: <Placeholder name="工单" />,
    settings: <Settings user={user} isAdmin={false} />,
  }

  return <PanelShell page={page} onNavigate={setPage}>{pages[page] || <Dashboard user={user} />}</PanelShell>
}

// ─── Panel Shell ────────────────────────────────────────────

function PanelShell({ page, onNavigate, children }: { page: string; onNavigate: (id: string) => void; children: React.ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    apiGet('/api/config/status').then(r => {
      if (r.connected) { setConnected(true); setName(r.name || '') }
    })
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar currentPage={page} onNavigate={onNavigate} />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen p-5 max-md:p-3 max-md:pb-20">
        <div className="page-enter">{children}</div>
      </main>
      <TabBar currentPage={page} onNavigate={onNavigate} />
    </div>
  )
}
