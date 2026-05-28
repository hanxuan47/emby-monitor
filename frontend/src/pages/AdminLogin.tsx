import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiPost, apiGet } from '../api/client'
import { setAuth } from '../api/auth'
import { useToast } from '../components/Toast'
import { AuthLayout, Spinner } from './Setup'

export default function AdminLogin() {
  const nav = useNavigate()
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)

  useState(() => {
    apiGet('/api/auth/register-status').then(r => {
      if (!r.has_admin) nav('/setup', { replace: true })
    }).finally(() => setLoading(false))
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { toast('请输入用户名和密码', 'error'); return }
    const r = await apiPost('/api/auth/login', { username, password })
    if (r.ok) {
      setAuth(r.token, r.user)
      nav('/admin', { replace: true })
    } else {
      toast(r.error || '登录失败', 'error')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>

  return (
    <AuthLayout title="管理员登录">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <input className="glass-input" placeholder="管理员用户名" value={username} onChange={e => setUsername(e.target.value)} />
        <input className="glass-input" type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="glass-btn glass-btn-primary w-full py-3">登录</button>
        <p className="text-xs text-center text-[rgba(255,255,255,0.5)]">
          用户登录请前往 <a href="/user" className="text-[#60a5fa] hover:text-white transition-colors">/user</a>
        </p>
      </form>
    </AuthLayout>
  )
}
