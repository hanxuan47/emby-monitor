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
    const r = await apiGet('/api/ai/insights')
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
      {/* 顶部 */}
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

      {/* 分类筛选 */}
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

      {/* 洞察列表 */}
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

export function AiAdminPanel() {
  const { toast } = useToast()
  const [insights, setInsights] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [configOpen, setConfigOpen] = useState(false)

  // Config form
  const [enabled, setEnabled] = useState('1')
  const [inactiveDays, setInactiveDays] = useState('14')
  const [autoDisable, setAutoDisable] = useState('30')
  const [anomalyThresh, setAnomalyThresh] = useState('5')

  const load = async () => {
    setLoading(true)
    const [i, c] = await Promise.all([
      apiGet('/api/ai/insights'),
      apiGet('/api/ai/config'),
    ])
    if (i.ok) setInsights(i.items || [])
    if (c.ok && c.config) {
      setConfig(c.config)
      setEnabled(c.config.enabled ? '1' : '0')
      setInactiveDays(String(c.config.inactive_days || 14))
      setAutoDisable(String(c.config.auto_disable_days || 30))
      setAnomalyThresh(String(c.config.anomaly_threshold || 5))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    const r = await apiPost('/api/ai/scan')
    setScanResult(r)
    if (r.ok) toast(`✅ 分析完成: ${r.users_analyzed} 用户, ${r.insights_generated} 条洞察`)
    else toast(r.error || '分析失败', 'error')
    setScanning(false)
    load()
  }

  async function saveConfig() {
    const r = await apiPost('/api/ai/config', {
      enabled,
      inactive_days: inactiveDays,
      auto_disable_days: autoDisable,
      anomaly_threshold: anomalyThresh,
    })
    if (r.ok) { toast('配置已保存'); setConfigOpen(false) }
    else toast(r.error || '保存失败', 'error')
  }

  const sevClass = (s: string) =>
    s === 'danger' ? 'border-l-red-400/50' :
    s === 'warning' ? 'border-l-yellow-400/50' :
    'border-l-blue-400/30'

  const summary = {
    total: insights.length,
    danger: insights.filter(i => i.severity === 'danger').length,
    warning: insights.filter(i => i.severity === 'warning').length,
    info: insights.filter(i => i.severity === 'info').length,
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-4">
      {/* 顶部 */}
      <div className="glass-ios p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🤖 AI 智能管控</h1>
            <p className="text-sm text-[rgba(255,255,255,0.35)] mt-1">规则驱动的用户行为分析与自动管理</p>
          </div>
          <div className="flex gap-2">
            <button className="glass-btn bg-[rgba(255,255,255,0.05)] text-xs" onClick={() => setConfigOpen(!configOpen)}>
              ⚙️ 配置
            </button>
            <button
              className={`glass-btn glass-btn-primary text-xs ${scanning ? 'opacity-50' : ''}`}
              onClick={runScan}
              disabled={scanning}
            >
              {scanning ? '扫描中...' : '🔍 执行扫描'}
            </button>
          </div>
        </div>
      </div>

      {/* 配置面板 */}
      {configOpen && (
        <div className="glass-ios p-4">
          <div className="text-xs font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">分析规则配置</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">AI 分析</label>
              <select className="glass-input text-xs" value={enabled} onChange={e => setEnabled(e.target.value)}>
                <option value="1">开启</option>
                <option value="0">关闭</option>
              </select>
            </div>
            <div>
              <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">不活跃阈值(天)</label>
              <input className="glass-input text-xs" type="number" value={inactiveDays} onChange={e => setInactiveDays(e.target.value)} />
            </div>
            <div>
              <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">自动禁用(天)</label>
              <input className="glass-input text-xs" type="number" value={autoDisable} onChange={e => setAutoDisable(e.target.value)} />
            </div>
            <div>
              <label className="text-[.6rem] text-[rgba(255,255,255,0.3)] block mb-1">异常阈值(次/天)</label>
              <input className="glass-input text-xs" type="number" value={anomalyThresh} onChange={e => setAnomalyThresh(e.target.value)} />
            </div>
          </div>
          <button className="glass-btn glass-btn-primary w-full text-xs" onClick={saveConfig}>保存配置</button>
        </div>
      )}

      {/* 扫描结果 */}
      {scanResult && (
        <div className="glass-ios p-4">
          <div className="flex items-center gap-3">
            <span className="text-green-400 text-lg">✅</span>
            <div>
              <div className="text-sm font-semibold text-white/80">扫描完成</div>
              <div className="text-xs text-[rgba(255,255,255,0.3)]">
                分析 {scanResult.users_analyzed} 个用户 · 生成 {scanResult.insights_generated} 条洞察
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 概览统计 */}
      <div className="grid grid-cols-4 gap-2">
        <StatBadge label="总洞察" value={summary.total} color="text-blue-400" />
        <StatBadge label="异常" value={summary.danger} color="text-red-400" />
        <StatBadge label="警告" value={summary.warning} color="text-yellow-400" />
        <StatBadge label="信息" value={summary.info} color="text-green-400" />
      </div>

      {/* 洞察列表 */}
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
                        {ins.auto_action === 'suggest_disable' ? '建议禁用' : ins.auto_action === 'suggest_upgrade' ? '建议升级' : '建议审核'}
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

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-ios p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[.6rem] text-[rgba(255,255,255,0.3)] mt-0.5">{label}</div>
    </div>
  )
}
