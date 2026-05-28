import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

// ─── 用户端: AI 分析报告 ─────────────────────────────────────────

export function AiUserReport() {
  const { toast } = useToast()
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  const load = async () => {
    setLoading(true)
    const r = await apiGet('/api/ai/insights?token=' + (localStorage.getItem('ebt') || ''))
    if (r.ok) setInsights(r.items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function runScan() {
    setScanning(true)
    const r = await apiPost('/api/ai/scan', { token: localStorage.getItem('ebt') || '', user_id: '0' })
    if (r.ok) toast('AI 分析完成', 'success')
    else toast(r.error || '分析失败', 'error')
    setScanning(false)
    load()
  }

  const categories = [
    { key: '', label: '全部', icon: '📋' },
    { key: 'activity', label: '活跃度', icon: '📊' },
    { key: 'watch', label: '观看模式', icon: '📱' },
    { key: 'anomaly', label: '异常检测', icon: '🚨' },
    { key: 'recommendation', label: '推荐', icon: '💡' },
  ]
  const [catFilter, setCatFilter] = useState('')

  const filtered = catFilter ? insights.filter(i => i.category === catFilter) : insights
  const sevColor = (s: string) => s === 'danger' ? 'text-red-400 border-red-400/20 bg-red-400/8' : s === 'warning' ? 'text-yellow-400 border-yellow-400/20 bg-yellow-400/8' : 'text-blue-400 border-blue-400/20 bg-blue-400/8'

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-4">
      <div className="glass-ios p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">📊 AI 分析报告</h1>
            <p className="text-sm text-[rgba(255,255,255,0.35)] mt-1">你的观影行为分析与个性化建议</p>
          </div>
          <button
            className={`glass-btn glass-btn-primary text-xs ${scanning ? 'opacity-50' : ''}`}
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? '分析中...' : '🔄 刷新分析'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categories.map(c => (
          <button
            key={c.key}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              catFilter === c.key
                ? 'bg-blue-500/15 text-blue-400 border border-blue-400/20'
                : 'bg-[rgba(255,255,255,0.04)] text-[rgba(255,255,255,0.4)] border border-transparent hover:bg-[rgba(255,255,255,0.08)]'
            }`}
            onClick={() => setCatFilter(c.key)}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-ios p-8 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无分析数据，点击上方「刷新分析」生成报告</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(ins => (
            <div key={ins.id} className={`glass-ios p-3.5 border-l-2 ${ins.severity === 'danger' ? 'border-l-red-400' : ins.severity === 'warning' ? 'border-l-yellow-400' : 'border-l-blue-400/40'}`}>
              <div className="flex items-start gap-2.5">
                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs ${sevColor(ins.severity)} border`}>
                  {ins.severity === 'danger' ? '⚠️' : ins.severity === 'warning' ? '⚡' : '💡'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white/80">{ins.title}</div>
                  <div className="text-xs text-[rgba(255,255,255,0.35)] mt-0.5 leading-relaxed">{ins.content}</div>
                  {ins.auto_action && (
                    <div className="mt-1.5 text-[.6rem] text-[rgba(255,255,255,0.2)] uppercase tracking-wider">
                      建议操作: {ins.auto_action === 'suggest_disable' ? '禁用账号' : ins.auto_action === 'suggest_upgrade' ? '检查客户端' : '人工审核'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 管理端: AI 智能管控 ─────────────────────────────────────────

interface AiConfig {
  enabled: boolean
  inactive_days: number
  auto_disable_days: number
  anomaly_threshold: number
  auto_disable_enabled: string
  tg_push_enabled: string
  tg_admin_chat_id: string
  rate_limit_enabled: string
  rate_limit_max_requests: number
  client_restrictions: string
  multi_device_enabled: string
  multi_device_max_sessions: number
  whitelist_mode: string
  llm_enabled: string
  llm_provider: string
  llm_api_url: string
  llm_api_key: string
  llm_model: string
}

interface WhitelistEntry {
  id: number
  panel_user_id: number
  username: string
  reason: string
  created_by_name: string
  created_at: string
}

export function AiAdminPanel() {
  const { toast } = useToast()
  const [insights, setInsights] = useState<any[]>([])
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  // Config form
  const [cfg, setCfg] = useState<Record<string, string>>({
    enabled: '1',
    inactive_days: '14',
    auto_disable_days: '30',
    anomaly_threshold: '5',
    auto_disable_enabled: '0',
    tg_push_enabled: '0',
    tg_admin_chat_id: '',
    rate_limit_enabled: '0',
    rate_limit_max_requests: '3',
    client_restrictions: '',
    multi_device_enabled: '0',
    multi_device_max_sessions: '3',
    whitelist_mode: 'disabled',
    llm_enabled: '0',
    llm_provider: 'custom',
    llm_api_url: '',
    llm_api_key: '',
    llm_model: 'gpt-4o-mini',
  })

  // Collapsible sections
  const [sections, setSections] = useState<Record<string, boolean>>({
    general: true,
    auto_disable: false,
    tg_push: false,
    rate_limit: false,
    client_restrictions: false,
    multi_device: false,
    whitelist: false,
    llm: false,
  })

  // Whitelist
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([])
  const [wlNewUserId, setWlNewUserId] = useState('')
  const [wlNewReason, setWlNewReason] = useState('')

  const toggle = (key: string) => setSections(prev => ({ ...prev, [key]: !prev[key] }))

  const tk = () => localStorage.getItem('ebt') || ''

  const load = async () => {
    setLoading(true)
    const [i, c, w] = await Promise.all([
      apiGet('/api/ai/insights?token=' + tk()),
      apiGet('/api/ai/config?token=' + tk()),
      apiGet('/api/ai/whitelist?token=' + tk()),
    ])
    if (i.ok) setInsights(i.items || [])
    if (c.ok && c.config) {
      setConfig(c.config)
      setCfg({
        enabled: c.config.enabled ? '1' : '0',
        inactive_days: String(c.config.inactive_days || 14),
        auto_disable_days: String(c.config.auto_disable_days || 30),
        anomaly_threshold: String(c.config.anomaly_threshold || 5),
        auto_disable_enabled: c.config.auto_disable_enabled || '0',
        tg_push_enabled: c.config.tg_push_enabled || '0',
        tg_admin_chat_id: c.config.tg_admin_chat_id || '',
        rate_limit_enabled: c.config.rate_limit_enabled || '0',
        rate_limit_max_requests: String(c.config.rate_limit_max_requests || 3),
        client_restrictions: c.config.client_restrictions || '',
        multi_device_enabled: c.config.multi_device_enabled || '0',
        multi_device_max_sessions: String(c.config.multi_device_max_sessions || 3),
        whitelist_mode: c.config.whitelist_mode || 'disabled',
        llm_enabled: c.config.llm_enabled || '0',
        llm_provider: c.config.llm_provider || 'custom',
        llm_api_url: c.config.llm_api_url || '',
        llm_api_key: c.config.llm_api_key || '',
        llm_model: c.config.llm_model || 'gpt-4o-mini',
      })
    }
    if (w.ok) setWhitelist(w.items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    const r = await apiPost('/api/ai/scan', { token: tk() })
    setScanResult(r)
    if (r.ok) toast(`✅ 分析完成: ${r.users_analyzed} 用户, ${r.insights_generated} 条洞察, ${r.actions_taken || 0} 个操作`)
    else toast(r.error || '分析失败', 'error')
    setScanning(false)
    load()
  }

  async function saveConfig() {
    const r = await apiPost('/api/ai/config', { ...cfg, token: tk() })
    if (r.ok) { toast('✅ 配置已保存'); load() }
    else toast(r.error || '保存失败', 'error')
  }

  async function addWhitelist() {
    if (!wlNewUserId) { toast('请输入用户ID', 'error'); return }
    const r = await apiPost('/api/ai/whitelist/add', { token: tk(), panel_user_id: wlNewUserId, reason: wlNewReason })
    if (r.ok) { toast('✅ 已添加到白名单'); setWlNewUserId(''); setWlNewReason(''); load() }
    else toast(r.error || '添加失败', 'error')
  }

  async function removeWhitelist(id: number) {
    const r = await apiPost('/api/ai/whitelist/remove', { token: tk(), whitelist_id: String(id) })
    if (r.ok) { toast('已移出白名单'); load() }
    else toast(r.error || '移除失败', 'error')
  }

  const summary = {
    total: insights.length,
    danger: insights.filter(i => i.severity === 'danger').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    info: insights.filter(i => i.severity === 'info').length,
  }

  const sevClass = (s: string) =>
    s === 'danger' ? 'border-l-red-400/50' :
    s === 'warning' ? 'border-l-yellow-400/50' :
    'border-l-blue-400/30'

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-4">
      {/* ── 顶部 ── */}
      <div className="glass-ios p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🤖 AI 智能管控</h1>
            <p className="text-sm text-[rgba(255,255,255,0.35)] mt-1">全功能用户行为分析 · 自动管控 · 异常告警</p>
          </div>
          <div className="flex gap-2">
            <button className="glass-btn glass-btn-primary text-xs" onClick={saveConfig}>
              💾 保存全部设置
            </button>
            <button
              className={`glass-btn bg-blue-500/15 text-blue-400 border border-blue-400/20 text-xs ${scanning ? 'opacity-50' : ''}`}
              onClick={runScan}
              disabled={scanning}
            >
              {scanning ? '扫描中...' : '🔍 执行扫描'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 概览统计 ── */}
      <div className="grid grid-cols-4 gap-2">
        <StatBadge label="总洞察" value={summary.total} color="text-blue-400" />
        <StatBadge label="异常" value={summary.danger} color="text-red-400" />
        <StatBadge label="警告" value={summary.warning} color="text-yellow-400" />
        <StatBadge label="信息" value={summary.info} color="text-green-400" />
      </div>

      {/* ── 扫描结果 ── */}
      {scanResult && (
        <div className="glass-ios p-4">
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-lg">✅</span>
            <div>
              <div className="text-sm font-semibold text-white/80">扫描完成</div>
              <div className="text-xs text-[rgba(255,255,255,0.3)]">
                分析 {scanResult.users_analyzed} 个用户 · 生成 {scanResult.insights_generated} 条洞察
                {scanResult.actions_taken ? ` · 自动执行 ${scanResult.actions_taken} 个操作` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
         配置分组
         ══════════════════════════════════════════════════════════ */}

      {/* ── 1. 基础设置 ── */}
      <ConfigSection title="📐 基础设置" icon={sections.general ? '▾' : '▸'} open={sections.general} onToggle={() => toggle('general')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ConfigSelect label="AI 分析" value={cfg.enabled} onChange={v => setCfg(p => ({ ...p, enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <ConfigInput label="不活跃阈值(天)" value={cfg.inactive_days} onChange={v => setCfg(p => ({ ...p, inactive_days: v }))} hint="超过 → warning" />
          <ConfigInput label="自动禁用阈值(天)" value={cfg.auto_disable_days} onChange={v => setCfg(p => ({ ...p, auto_disable_days: v }))} hint="超过 → danger + 建议禁用" />
          <ConfigInput label="异常阈值(次/天)" value={cfg.anomaly_threshold} onChange={v => setCfg(p => ({ ...p, anomaly_threshold: v }))} hint="3倍触发 danger" />
        </div>
      </ConfigSection>

      {/* ── 2. 自动禁用 ⚡ ── */}
      <ConfigSection title="⚡ 自动禁用" icon={sections.auto_disable ? '▾' : '▸'} open={sections.auto_disable} onToggle={() => toggle('auto_disable')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">启用后，达到「自动禁用阈值」的用户会被自动禁用 Panel + Emby 账号</p>
        <div className="grid grid-cols-2 gap-3">
          <ConfigSelect label="自动禁用" value={cfg.auto_disable_enabled} onChange={v => setCfg(p => ({ ...p, auto_disable_enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <div className="text-xs text-[rgba(255,255,255,0.2)] flex items-end pb-2">阈值在「基础设置」中配置</div>
        </div>
      </ConfigSection>

      {/* ── 3. TG 推送 ── */}
      <ConfigSection title="📨 TG 推送" icon={sections.tg_push ? '▾' : '▸'} open={sections.tg_push} onToggle={() => toggle('tg_push')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">异常警告自动推送到管理员的 Telegram (同时也会推送给绑定的用户本人)</p>
        <div className="grid grid-cols-2 gap-3">
          <ConfigSelect label="TG 推送" value={cfg.tg_push_enabled} onChange={v => setCfg(p => ({ ...p, tg_push_enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <ConfigInput label="管理员 Chat ID" value={cfg.tg_admin_chat_id} onChange={v => setCfg(p => ({ ...p, tg_admin_chat_id: v }))} hint="获取: @userinfobot" />
        </div>
      </ConfigSection>

      {/* ── 4. 速率限制 ── */}
      <ConfigSection title="🛡️ 速率限制" icon={sections.rate_limit ? '▾' : '▸'} open={sections.rate_limit} onToggle={() => toggle('rate_limit')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">异常用户限制每日求片数量，防止滥用</p>
        <div className="grid grid-cols-2 gap-3">
          <ConfigSelect label="速率限制" value={cfg.rate_limit_enabled} onChange={v => setCfg(p => ({ ...p, rate_limit_enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <ConfigInput label="每日最大求片数" value={cfg.rate_limit_max_requests} onChange={v => setCfg(p => ({ ...p, rate_limit_max_requests: v }))} hint="默认 3 条" />
        </div>
      </ConfigSection>

      {/* ── 5. 客户端限制 ── */}
      <ConfigSection title="🚫 客户端限制" icon={sections.client_restrictions ? '▾' : '▸'} open={sections.client_restrictions} onToggle={() => toggle('client_restrictions')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">限制用户使用特定客户端播放，检测到违规自动告警。多个用逗号分隔</p>
        <ConfigInput label="受限客户端" value={cfg.client_restrictions} onChange={v => setCfg(p => ({ ...p, client_restrictions: v }))} placeholder="例如: Kodi, Plex, VLC" hint="半角逗号分隔客户端名称" />
        <div className="mt-2 text-[.6rem] text-[rgba(255,255,255,0.2)]">
          常见限制: Kodi, Infuse, Plex, VLC, MPC-HC, PotPlayer
        </div>
      </ConfigSection>

      {/* ── 6. 多设备检测 ── */}
      <ConfigSection title="🌐 多设备/IP 检测" icon={sections.multi_device ? '▾' : '▸'} open={sections.multi_device} onToggle={() => toggle('multi_device')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">检测用户是否同时从多个 IP 或设备播放，识别共享账号行为</p>
        <div className="grid grid-cols-2 gap-3">
          <ConfigSelect label="多设备检测" value={cfg.multi_device_enabled} onChange={v => setCfg(p => ({ ...p, multi_device_enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <ConfigInput label="最大 IP 数(24h)" value={cfg.multi_device_max_sessions} onChange={v => setCfg(p => ({ ...p, multi_device_max_sessions: v }))} hint="超过 → warning" />
        </div>
      </ConfigSection>

      {/* ── 7. 白名单 ── */}
      <ConfigSection title="📋 白名单" icon={sections.whitelist ? '▾' : '▸'} open={sections.whitelist} onToggle={() => toggle('whitelist')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">白名单用户可以跳过 AI 分析或跳过异常检测</p>
        <div className="grid grid-cols-1 gap-3 mb-4">
          <ConfigSelect label="白名单模式" value={cfg.whitelist_mode} onChange={v => setCfg(p => ({ ...p, whitelist_mode: v }))} options={[
            ['disabled', '关闭'],
            ['skip', '跳过全部分析'],
            ['skip_anomaly', '仅跳过异常检测'],
          ]} />
        </div>

        {/* 添加 */}
        <div className="flex items-end gap-2 mb-3">
          <div className="flex-1">
            <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">用户 ID</label>
            <input className="glass-input text-xs" type="number" placeholder="PanelUser ID" value={wlNewUserId} onChange={e => setWlNewUserId(e.target.value)} />
          </div>
          <div className="flex-[2]">
            <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">原因</label>
            <input className="glass-input text-xs" placeholder="例如: 管理员，VIP" value={wlNewReason} onChange={e => setWlNewReason(e.target.value)} />
          </div>
          <button className="glass-btn glass-btn-primary text-xs px-3 py-2" onClick={addWhitelist}>+ 添加</button>
        </div>

        {/* 列表 */}
        {whitelist.length === 0 ? (
          <p className="text-xs text-[rgba(255,255,255,0.2)]">暂无白名单用户</p>
        ) : (
          <div className="space-y-1.5">
            {whitelist.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-[rgba(255,255,255,0.03)] rounded-lg px-3 py-2">
                <div>
                  <span className="text-xs text-white/60 font-mono">#{w.username || w.panel_user_id}</span>
                  {w.reason && <span className="text-[.6rem] text-[rgba(255,255,255,0.3)] ml-2">({w.reason})</span>}
                  <span className="text-[.55rem] text-[rgba(255,255,255,0.15)] ml-2">by {w.created_by_name}</span>
                </div>
                <button className="text-[.6rem] text-red-400/60 hover:text-red-400" onClick={() => removeWhitelist(w.id)}>移除</button>
              </div>
            ))}
          </div>
        )}
      </ConfigSection>

      {/* ── 8. LLM 增强分析 🤖 ── */}
      <ConfigSection title="🤖 LLM 增强分析" icon={sections.llm ? '▾' : '▸'} open={sections.llm} onToggle={() => toggle('llm')}>
        <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">
          用大模型增强分析质量，生成更智能的用户洞察和个性化推荐。
          支持 OpenAI / DeepSeek / 月之暗面 等兼容接口。启用后扫描速度会变慢（需要等待 LLM 响应）。
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <ConfigSelect label="LLM 增强" value={cfg.llm_enabled} onChange={v => setCfg(p => ({ ...p, llm_enabled: v }))} options={[['1', '开启'], ['0', '关闭']]} />
          <ConfigSelect label="Provider" value={cfg.llm_provider} onChange={v => setCfg(p => ({ ...p, llm_provider: v }))} options={[
            ['custom', '自定义'],
            ['openai', 'OpenAI (GPT)'],
            ['deepseek', 'DeepSeek'],
            ['moonshot', 'Moonshot (月之暗面)'],
          ]} />
        </div>

        {/* Provider 预设提示 */}
        {cfg.llm_provider === 'openai' && (
          <div className="text-[.6rem] text-blue-400/60 mb-2">预设: api.openai.com/v1 · 模型: gpt-4o / gpt-4o-mini</div>
        )}
        {cfg.llm_provider === 'deepseek' && (
          <div className="text-[.6rem] text-blue-400/60 mb-2">预设: api.deepseek.com/v1 · 模型: deepseek-chat</div>
        )}
        {cfg.llm_provider === 'moonshot' && (
          <div className="text-[.6rem] text-blue-400/60 mb-2">预设: api.moonshot.cn/v1 · 模型: moonshot-v1-8k</div>
        )}

        <div className="space-y-3">
          <ConfigInput label="API URL" value={cfg.llm_api_url} onChange={v => setCfg(p => ({ ...p, llm_api_url: v }))} placeholder="https://api.openai.com/v1" hint="OpenAI 兼容接口地址" />
          <ConfigInput label="API Key" value={cfg.llm_api_key} onChange={v => setCfg(p => ({ ...p, llm_api_key: v }))} placeholder="sk-..." hint="API 密钥" />
          <ConfigInput label="模型" value={cfg.llm_model} onChange={v => setCfg(p => ({ ...p, llm_model: v }))} placeholder="gpt-4o-mini" hint="模型名称，如 gpt-4o-mini / deepseek-chat" />
        </div>
      </ConfigSection>

      {/* ══════════════════════════════════════════════════════════
         洞察列表
         ══════════════════════════════════════════════════════════ */}
      <div className="text-xs text-[rgba(255,255,255,0.2)] uppercase tracking-wider font-semibold mt-2 mb-1">分析结果</div>
      {insights.length === 0 ? (
        <div className="glass-ios p-10 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无分析数据，点击「执行扫描」开始分析</p>
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map(ins => (
            <div key={ins.id} className={`glass-ios p-3 border-l-2 ${sevClass(ins.severity)}`}>
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`text-[.6rem] px-1.5 py-0.5 rounded-md font-medium ${
                      ins.severity === 'danger' ? 'bg-red-400/10 text-red-400' :
                      ins.severity === 'warning' ? 'bg-yellow-400/10 text-yellow-400' :
                      'bg-blue-400/10 text-blue-400'
                    }`}>
                      {ins.severity === 'danger' ? '异常' : ins.severity === 'warning' ? '警告' : '信息'}
                    </div>
                    <span className="text-xs text-[rgba(255,255,255,0.3)] font-mono">#{ins.username || `u${ins.panel_user_id}`}</span>
                  </div>
                  <div className="text-sm font-semibold text-white/70 mt-1">{ins.title}</div>
                  <div className="text-xs text-[rgba(255,255,255,0.3)] mt-0.5">{ins.content}</div>
                  {ins.auto_action && (
                    <div className="mt-1.5 flex gap-2">
                      <span className="text-[.6rem] px-2 py-0.5 rounded-full bg-blue-400/8 text-blue-400/60 border border-blue-400/10">
                        {ins.auto_action === 'suggest_disable' ? '建议禁用' : ins.auto_action === 'suggest_upgrade' ? '建议升级' : ins.auto_action === 'suggest_review' ? '建议审核' : ins.auto_action}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-[.55rem] text-[rgba(255,255,255,0.15)] shrink-0">
                  {ins.category === 'activity' ? '活跃' : ins.category === 'watch' ? '观看' : ins.category === 'anomaly' ? '异常' : '推荐'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 子组件 ───────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-ios p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[.6rem] text-[rgba(255,255,255,0.3)] mt-0.5">{label}</div>
    </div>
  )
}

function ConfigSection({ title, icon, open, onToggle, children }: { title: string; icon: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="glass-ios">
      <button className="w-full flex items-center justify-between p-4 text-left" onClick={onToggle}>
        <span className="text-sm font-semibold text-white/70">{title}</span>
        <span className="text-[rgba(255,255,255,0.2)] text-sm">{icon}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function ConfigInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <div>
      <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">{label}</label>
      <input className="glass-input text-xs" type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <div className="text-[.55rem] text-[rgba(255,255,255,0.15)] mt-0.5">{hint}</div>}
    </div>
  )
}

function ConfigSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">{label}</label>
      <select className="glass-input text-xs" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    </div>
  )
}
