import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

interface Site {
  id: number
  name: string
  url: string
  route_type: string
  tags: string
  status: string
  latency_ms: number
  note: string
  is_active: boolean
  last_check: string | null
}

export function ServerRoutes() {
  const { toast } = useToast()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    apiGet('/api/sites?token=' + localStorage.getItem('ebt'))
      .then(r => {
        if (r.sites) setSites(r.sites.filter((s: Site) => s.is_active))
        else setSites([])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const testAll = async () => {
    const r = await apiPost('/api/sites/test-all', { token: localStorage.getItem('ebt') || '' })
    if (r.ok) { toast('测速完成'); load() }
    else toast(r.error || '测速失败', 'error')
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">🌐 服务器线路</h1>
        <button className="glass-btn glass-btn-sm glass-btn-primary" onClick={testAll}>
          ⚡ 测速
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="glass-ios text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📡</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无服务器线路信息</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sites.map(site => {
            const tagList = site.tags ? site.tags.split(',').map(t => t.trim()).filter(Boolean) : []
            const isOnline = site.status === 'online'
            const latency = site.latency_ms >= 0 ? `${site.latency_ms}ms` : '-'

            return (
              <div key={site.id} className="glass-ios p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-400' : 'bg-red-400/50'}`} />
                      <span className="font-semibold text-sm">{site.name}</span>
                      <span className={`text-[.6rem] px-1.5 py-0.5 rounded-md font-medium ${
                        isOnline ? 'bg-green-500/10 text-green-300/70' : 'bg-red-500/10 text-red-300/60'
                      }`}>
                        {isOnline ? '在线' : '离线'}
                      </span>
                    </div>

                    {tagList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {tagList.map((tag, i) => (
                          <span key={i} className="text-[.55rem] px-2 py-0.5 rounded-full bg-[rgba(59,130,246,0.1)] text-blue-300/70 border border-blue-400/10">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-[.65rem] text-[rgba(255,255,255,0.3)]">
                      <span>延迟：<span className={isOnline ? 'text-white/60' : 'text-red-300/50'}>{latency}</span></span>
                      <span>类型：{site.route_type}</span>
                    </div>

                    {site.note && (
                      <div className="text-[.6rem] text-[rgba(255,255,255,0.2)] mt-1.5">{site.note}</div>
                    )}
                  </div>

                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-btn glass-btn-sm shrink-0 text-[.65rem]"
                    onClick={e => { if (!isOnline) e.preventDefault() }}
                    style={!isOnline ? { opacity: 0.4, pointerEvents: 'none' } : {}}
                  >
                    访问 →
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
