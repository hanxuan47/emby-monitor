import { useState, useEffect } from 'react'
import { apiPost, apiGet } from '../api/client'
import { setAuth } from '../api/auth'
import { useToast } from '../components/Toast'
import { AuthLayout, Spinner } from './Setup'

export default function UserAuth() {
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [cardKey, setCardKey] = useState('')
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [regEnabled, setRegEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/api/auth/register-status').then(r => {
      setRegEnabled(r.enabled)
    }).finally(() => setLoading(false))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) { toast('请输入用户名和密码', 'error'); return }
    const r = await apiPost('/api/auth/login', { username, password })
    if (r.ok) {
      setAuth(r.token, r.user)
      window.location.href = '/user'
    } else {
      toast(r.error || '登录失败', 'error')
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!regUser || !regEmail || !regPass) { toast('请填写完整', 'error'); return }
    if (!cardKey) { toast('请填写卡密', 'error'); return }
    const r = await apiPost('/api/auth/register', {
      username: regUser,
      email: regEmail,
      password: regPass,
      card_key: cardKey,
    })
    if (r.ok) {
      toast('注册成功，请登录', 'success')
      setTab('login')
    } else {
      toast(r.error || '注册失败', 'error')
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Spinner /></div>

  return (
    <AuthLayout title="用户端">
      {tab === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-3.5">
          <input className="glass-input" placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} />
          <input className="glass-input" type="password" placeholder="密码" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="glass-btn glass-btn-primary w-full py-3">登录</button>
          {regEnabled && (
            <p className="text-xs text-center text-[rgba(255,255,255,0.5)]">
              <button type="button" onClick={() => setTab('register')} className="hover:text-white transition-colors">注册账号</button>
            </p>
          )}
        </form>
      ) : (
        <form onSubmit={handleRegister} className="space-y-3.5">
          <input className="glass-input" placeholder="用户名" value={regUser} onChange={e => setRegUser(e.target.value)} />
          <input className="glass-input" type="email" placeholder="邮箱" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
          <input className="glass-input" type="password" placeholder="密码" value={regPass} onChange={e => setRegPass(e.target.value)} />
          <input className="glass-input" placeholder="卡密（如 EMBY-XXXX-XXXX-XXXX）" value={cardKey} onChange={e => setCardKey(e.target.value.toUpperCase())} />
          <button type="submit" className="glass-btn glass-btn-primary w-full py-3">注册</button>
          <p className="text-xs text-center text-[rgba(255,255,255,0.3)]">
            注册需要有效的卡密
          </p>
          <p className="text-xs text-center text-[rgba(255,255,255,0.5)]">
            <button type="button" onClick={() => setTab('login')} className="hover:text-white transition-colors">已有账号？登录</button>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
