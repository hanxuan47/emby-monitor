import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, apiGet } from '../api/client'
import { setAuth } from '../api/auth'
import { useToast } from '../components/Toast'

export default function Setup() {
  const nav = useNavigate()
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    apiGet('/api/auth/register-status').then(r => {
      if (r.has_admin) nav('/', { replace: true })
      else setNeedsSetup(true)
    }).catch(() => nav('/'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !email || !password) {
      toast('请填写完整', 'error')
      return
    }
    const r = await apiPost('/api/auth/register', { username, email, password })
    if (r.ok && r.is_admin) {
      setAuth(r.token, r.user)
      toast('🎉 管理员创建成功！')
      setTimeout(() => nav('/admin'), 800)
    } else {
      toast(r.error || '创建失败', 'error')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>
  if (!needsSetup) return null

  return (
    <AuthLayout title="首次使用 · 初始化管理员">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <input className="glass-input" placeholder="管理员用户名" value={username} onChange={e => setUsername(e.target.value)} />
        <input className="glass-input" type="email" placeholder="邮箱" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="glass-input" type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="glass-btn glass-btn-primary w-full py-3 text-base">🚀 初始化</button>
      </form>
    </AuthLayout>
  )
}

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="fixed inset-0 z-[-1]" style={{
        background: 'radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 50%), #0a0c12'
      }} />
      <div className="w-full max-w-sm px-6 py-8">
        <div className="text-center mb-8">
          <Logo />
          <h1 className="text-2xl font-bold tracking-tight">
            Emby <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Monitor</span>
          </h1>
          <p className="text-sm mt-1 text-[rgba(255,255,255,0.5)]">{title}</p>
        </div>
        <div className="bg-[rgba(18,21,31,0.7)] backdrop-blur-2xl border border-[rgba(255,255,255,0.07)] rounded-[18px] p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Logo() {
  return (
    <svg className="w-14 h-14 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#lg)" strokeWidth="1.8" />
      <defs>
        <linearGradient id="lg" x1="2" y1="2" x2="22" y2="22">
          <stop stopColor="#3b82f6" /><stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Spinner() {
  return <div className="w-7 h-7 border-2 border-[rgba(255,255,255,0.07)] border-t-[#3b82f6] rounded-full animate-[spin_.7s_linear_infinite] mx-auto" />
}
