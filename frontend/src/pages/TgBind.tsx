import { useState, useEffect } from 'react'
import { apiPost, apiGet } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

export function TgBind() {
  const { toast } = useToast()
  const [bound, setBound] = useState(false)
  const [binding, setBinding] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const load = async () => {
    setLoading(true)
    const r = await apiGet('/api/tg/binding-status?token=' + (localStorage.getItem('ebt') || ''))
    if (r.ok) { setBound(r.bound); setBinding(r) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [countdown])

  async function genCode() {
    setCodeLoading(true)
    const r = await apiPost('/api/tg/bind-code', { token: localStorage.getItem('ebt') || '' })
    if (r.ok) {
      setCode(r.code)
      setCountdown(r.ttl_minutes * 60)
      toast('验证码已生成，请在 TG Bot 中输入 /bind ' + r.code)
    } else {
      toast(r.error || '生成失败', 'error')
    }
    setCodeLoading(false)
  }

  async function handleUnbind() {
    if (!confirm('确定解绑？')) return
    const r = await apiPost('/api/tg/unbind', { token: localStorage.getItem('ebt') || '' })
    if (r.ok) {
      toast('已解绑')
      setBound(false)
      setBinding(null)
    } else {
      toast(r.error || '解绑失败', 'error')
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">🔔 TG 绑定</h1>

      {bound ? (
        <div className="glass-card max-w-[480px]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#28a8e8]/20 flex items-center justify-center text-lg">🤖</div>
            <div>
              <div className="font-semibold text-sm">已绑定</div>
              <div className="text-[.65rem] text-[rgba(255,255,255,0.3)]">TG Chat ID: {binding?.chat_id || '?'}</div>
            </div>
          </div>
          {binding?.created_at && (
            <div className="text-xs text-[rgba(255,255,255,0.3)] mb-4">
              绑定时间: {new Date(binding.created_at).toLocaleString('zh-CN')}
            </div>
          )}
          <div className="bg-[rgba(255,255,255,0.05)] rounded-xl p-3 mb-4">
            <div className="text-xs text-[rgba(255,255,255,0.5)] mb-1">接收通知：</div>
            <ul className="text-xs text-[rgba(255,255,255,0.4)] space-y-1">
              <li>✅ 求片审批结果</li>
              <li>✅ 工单回复提醒</li>
              <li>✅ 系统公告（管理员广播）</li>
            </ul>
          </div>
          <button className="glass-btn glass-btn-danger w-full" onClick={handleUnbind}>解绑 TG</button>
        </div>
      ) : (
        <div className="glass-card max-w-[480px]">
          <div className="section-title font-semibold mb-3">📲 绑定 TG 账号</div>

          <div className="space-y-4">
            <div className="text-sm text-[rgba(255,255,255,0.6)] leading-relaxed">
              将你的 Telegram 与面板账号绑定，接收求片审批、工单回复等推送通知。
            </div>

            <div className="bg-[rgba(255,255,255,0.05)] rounded-xl p-4">
              <div className="text-xs font-semibold mb-2 text-[rgba(255,255,255,0.5)]">绑定步骤：</div>
              <ol className="text-xs text-[rgba(255,255,255,0.4)] space-y-2">
                <li>1️⃣ 点击下方按钮生成验证码</li>
                <li>2️⃣ 打开 Telegram，搜索 @EmbyMonitorBot</li>
                <li>3️⃣ 发送 <code className="text-[#60a5fa]">/bind 验证码</code></li>
              </ol>
            </div>

            {code && (
              <div className="text-center py-3 bg-[rgba(96,165,250,0.08)] rounded-xl border border-[rgba(96,165,250,0.15)]">
                <div className="text-xs text-[rgba(255,255,255,0.4)] mb-1">验证码（{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')} 后过期）</div>
                <div className="text-3xl font-mono font-bold tracking-[.3em] text-[#60a5fa]">{code}</div>
                <div className="text-xs text-[rgba(255,255,255,0.3)] mt-2">
                  在 TG 中发送: <code className="text-[#60a5fa]">/bind {code}</code>
                </div>
              </div>
            )}

            <button
              className={`glass-btn glass-btn-primary w-full py-3 ${codeLoading ? 'opacity-50' : ''}`}
              onClick={genCode}
              disabled={codeLoading}
            >
              {codeLoading ? '生成中...' : code ? '🔄 重新生成' : '🔑 生成验证码'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TgBroadcast() {
  const { toast } = useToast()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function handleSend() {
    if (!message.trim()) { toast('请输入消息内容', 'error'); return }
    if (!confirm(`确定发送广播给所有已绑定的用户？\n\n${message.trim()}`)) return
    setSending(true)
    setResult(null)
    const r = await apiPost('/api/tg/broadcast', { token: localStorage.getItem('ebt') || '', message: message.trim() })
    setResult(r)
    if (r.ok) {
      toast(`已发送给 ${r.sent}/${r.total} 个用户`, 'success')
      setMessage('')
    } else {
      toast(r.error || '发送失败', 'error')
    }
    setSending(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">📢 TG 广播</h1>
      <div className="glass-card max-w-[600px]">
        <div className="section-title font-semibold mb-3">发送通知到所有已绑定的 TG 用户</div>
        <textarea
          className="glass-input min-h-[150px] resize-y"
          placeholder="输入广播消息内容...&#10;&#10;支持 HTML 格式"
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="text-[.65rem] text-[rgba(255,255,255,0.3)] mt-1 mb-3">
          支持 HTML 标签: &lt;b&gt;加粗&lt;/b&gt;, &lt;i&gt;斜体&lt;/i&gt;, &lt;a href=""&gt;链接&lt;/a&gt;
        </div>
        <button
          className={`glass-btn glass-btn-primary w-full ${sending ? 'opacity-50' : ''}`}
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? '发送中...' : '📤 发送广播'}
        </button>
        {result && (
          <div className={`mt-3 text-xs p-3 rounded-xl ${result.ok ? 'bg-[rgba(34,197,94,0.08)]' : 'bg-[rgba(239,68,68,0.08)]'}`}>
            {result.ok
              ? `✅ 成功发送给 ${result.sent}/${result.total} 个用户`
              : `❌ ${result.error}`
            }
          </div>
        )}
      </div>
    </div>
  )
}
