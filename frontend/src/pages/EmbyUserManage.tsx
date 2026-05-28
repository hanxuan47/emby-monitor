import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

interface EmbyUser {
  id: string
  name: string
  isAdministrator: boolean
  isDisabled: boolean
  isHidden: boolean
  hasPassword: boolean
  lastLoginDate: string
  lastActivityDate: string
  maxActiveSessions: number
  binding: {
    platform: string
    platform_user_id: string
    platform_username: string
    is_active: boolean
  } | null
}

export function EmbyUserManage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<EmbyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  // Password reset state per user
  const [resetState, setResetState] = useState<Record<string, {
    step: 'idle' | 'sent' | 'done'
    newPassword: string
    error: string
  }>>({})

  const load = () => {
    setLoading(true)
    apiGet('/api/users/manage?token=' + localStorage.getItem('ebt'))
      .then(r => {
        if (r.users) setUsers(r.users)
        else toast(r.error || '加载失败', 'error')
      })
      .catch(() => toast('加载用户失败', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleCreate() {
    if (!createName.trim()) { toast('请输入用户名', 'error'); return }
    setCreating(true)
    const r = await apiPost('/api/users/manage/create', {
      name: createName.trim(),
      password: '',
      token: localStorage.getItem('ebt') || '',
    })
    if (r.ok) {
      toast(`用户 ${createName} 创建成功`)
      setShowCreate(false)
      setCreateName('')
      load()
    } else {
      toast(r.error || '创建失败', 'error')
    }
    setCreating(false)
  }

  async function handleToggle(user: EmbyUser) {
    const disable = !user.isDisabled
    const r = await apiPost('/api/users/manage/toggle', {
      user_id: user.id,
      disable: disable ? '1' : '0',
      token: localStorage.getItem('ebt') || '',
    })
    if (r.ok) {
      toast(disable ? `已禁用 ${user.name}` : `已启用 ${user.name}`)
      load()
    } else {
      toast(r.error || '操作失败', 'error')
    }
  }

  async function handleSendCode(user: EmbyUser) {
    setResetState(prev => ({ ...prev, [user.id]: { step: 'idle', newPassword: '', error: '' } }))
    const r = await apiPost('/api/users/manage/password/send-code', {
      user_id: user.id,
      token: localStorage.getItem('ebt') || '',
    })
    if (r.ok) {
      toast(`验证码已发送到 ${user.name} 的 Telegram`)
      setResetState(prev => ({
        ...prev,
        [user.id]: { step: 'sent', newPassword: '', error: '' },
      }))
    } else {
      const errMsg = r.error || '发送失败'
      toast(errMsg, 'error')
      setResetState(prev => ({
        ...prev,
        [user.id]: { step: 'idle', newPassword: '', error: errMsg },
      }))
    }
  }

  async function handleResetWithCode(user: EmbyUser, code: string) {
    if (!code || code.length < 4) { toast('请输入验证码', 'error'); return }
    const r = await apiPost('/api/users/manage/password/reset', {
      user_id: user.id,
      code: code,
      token: localStorage.getItem('ebt') || '',
    })
    if (r.ok) {
      toast(`密码已重置！新密码已下发`)
      setResetState(prev => ({
        ...prev,
        [user.id]: { step: 'done', newPassword: r.new_password, error: '' },
      }))
    } else {
      toast(r.error || '重置失败', 'error')
      setResetState(prev => ({
        ...prev,
        [user.id]: { step: 'sent', newPassword: '', error: r.error || '验证失败' },
      }))
    }
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">Emby 用户管理</h1>
        <div className="flex gap-2">
          {!showCreate && (
            <button className="glass-btn glass-btn-primary glass-btn-sm" onClick={() => setShowCreate(true)}>
              ＋ 新建用户
            </button>
          )}
        </div>
      </div>

      {/* ── Create User ── */}
      {showCreate && (
        <div className="glass-ios p-4 mb-4 max-w-md">
          <div className="text-xs font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">新建 Emby 用户</div>
          <div className="flex gap-2">
            <input
              className="glass-input flex-1"
              placeholder="用户名"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button className="glass-btn glass-btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '创建'}
            </button>
            <button className="glass-btn glass-btn-sm" onClick={() => { setShowCreate(false); setCreateName('') }}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="glass-ios p-3 mb-4">
        <input
          className="glass-input w-full"
          placeholder="🔍 搜索用户..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── User List ── */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="glass-ios text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">
          {users.length === 0 ? '暂无 Emby 用户，请检查连接' : '未找到匹配的用户'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(u => {
            const rs = resetState[u.id] || { step: 'idle', newPassword: '', error: '' }
            const hasTg = u.binding?.platform === 'telegram' && u.binding?.is_active
            const tgUsername = u.binding?.platform_username || ''
            const isActive = !u.isDisabled

            return (
              <div key={u.id} className="glass-ios p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* User Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.3)]' : 'bg-red-400/50'}`} />
                      <span className="font-semibold text-sm">{u.name}</span>
                      {u.isAdministrator && (
                        <span className="text-[.6rem] px-1.5 py-0.5 rounded-md bg-[rgba(251,191,36,0.12)] text-amber-300/80 font-medium">管理员</span>
                      )}
                      {u.isHidden && (
                        <span className="text-[.6rem] px-1.5 py-0.5 rounded-md bg-[rgba(148,163,184,0.1)] text-[rgba(255,255,255,0.3)] font-medium">隐藏</span>
                      )}
                      {!u.hasPassword && (
                        <span className="text-[.6rem] px-1.5 py-0.5 rounded-md bg-[rgba(239,68,68,0.1)] text-red-300/60 font-medium">无密码</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      <InfoMini label="最后活跃" value={u.lastActivityDate ? formatDate(u.lastActivityDate) : '-'} />
                      <InfoMini label="最大会话" value={String(u.maxActiveSessions || '无限制')} />
                      <InfoMini
                        label="TG 绑定"
                        value={hasTg ? `@${tgUsername}` : '未绑定'}
                        valueClass={hasTg ? 'text-emerald-300/70' : 'text-[rgba(255,255,255,0.25)]'}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      className={`glass-btn glass-btn-sm ${isActive ? 'glass-btn-danger' : 'glass-btn-primary'}`}
                      onClick={() => handleToggle(u)}
                    >
                      {isActive ? '禁用' : '启用'}
                    </button>
                  </div>
                </div>

                {/* ── Password Reset Section ── */}
                <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                  {rs.step === 'idle' && (
                    <div className="flex items-center gap-2">
                      <button
                        className="glass-btn glass-btn-sm text-[.7rem]"
                        onClick={() => handleSendCode(u)}
                        disabled={!hasTg}
                        style={!hasTg ? { opacity: 0.4 } : {}}
                      >
                        🔐 TG 验证改密
                      </button>
                      {!hasTg && (
                        <span className="text-[.6rem] text-[rgba(255,255,255,0.25)]">需绑定 TG 才能改密</span>
                      )}
                    </div>
                  )}

                  {rs.step === 'sent' && (
                    <div className="flex items-center gap-2">
                      <input
                        className="glass-input w-[150px] text-sm text-center tracking-[.3em] font-mono"
                        placeholder="输入6位验证码"
                        maxLength={6}
                        id={`code-${u.id}`}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleResetWithCode(u, (e.target as HTMLInputElement).value)
                          }
                        }}
                        autoFocus
                      />
                      <button
                        className="glass-btn glass-btn-primary glass-btn-sm"
                        onClick={() => {
                          const input = document.getElementById(`code-${u.id}`) as HTMLInputElement
                          handleResetWithCode(u, input?.value || '')
                        }}
                      >
                        确认重置
                      </button>
                      <button
                        className="glass-btn glass-btn-sm"
                        onClick={() => {
                          setResetState(prev => ({ ...prev, [u.id]: { step: 'idle', newPassword: '', error: '' } }))
                        }}
                      >
                        取消
                      </button>
                      <button
                        className="glass-btn glass-btn-sm text-[.65rem]"
                        onClick={() => handleSendCode(u)}
                      >
                        重新发送
                      </button>
                    </div>
                  )}

                  {rs.step === 'done' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[.7rem] text-emerald-300/80">✅ 密码已重置</span>
                      {rs.newPassword && (
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-[rgba(59,130,246,0.12)] px-3 py-1 rounded-lg text-blue-300/90">
                            {rs.newPassword}
                          </code>
                          <button
                            className="glass-btn glass-btn-sm text-[.65rem]"
                            onClick={() => {
                              navigator.clipboard.writeText(rs.newPassword)
                              toast('已复制到剪贴板')
                            }}
                          >
                            📋 复制
                          </button>
                        </div>
                      )}
                      <button
                        className="glass-btn glass-btn-sm text-[.65rem]"
                        onClick={() => {
                          setResetState(prev => ({ ...prev, [u.id]: { step: 'idle', newPassword: '', error: '' } }))
                        }}
                      >
                        关闭
                      </button>
                    </div>
                  )}

                  {rs.error && (
                    <div className="text-[.65rem] text-red-300/70 mt-1">{rs.error}</div>
                  )}
                </div>
              </div>
            )
          })}

          <div className="text-center text-[.65rem] text-[rgba(255,255,255,0.2)] py-2">
            共 {filtered.length} / {users.length} 用户
          </div>
        </div>
      )}
    </div>
  )
}

function InfoMini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="text-[.65rem] text-[rgba(255,255,255,0.25)]">
      {label}: <span className={valueClass || 'text-[rgba(255,255,255,0.5)]'}>{value}</span>
    </span>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr.slice(0, 10)
  }
}
