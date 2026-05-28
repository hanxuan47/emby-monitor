import { useState, useEffect } from 'react'
import { apiGet } from '../api/client'
import { Spinner } from './Setup'

interface WikiEntry {
  id: number
  slug: string
  title: string
  updated_at: string
}

interface WikiDetail {
  id: number
  slug: string
  title: string
  content: string
  updated_at: string
}

export function WikiViewer() {
  const [pages, setPages] = useState<WikiEntry[]>([])
  const [current, setCurrent] = useState<WikiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    apiGet('/api/wiki?token=' + localStorage.getItem('ebt'))
      .then(r => { if (r.pages) setPages(r.pages) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const openPage = async (slug: string) => {
    setDetailLoading(true)
    const r = await apiGet<WikiDetail | {error: string}>(`/api/wiki/${slug}?token=` + localStorage.getItem('ebt'))
    if (r && !(r as any).error && (r as any).title) setCurrent(r as WikiDetail)
    setDetailLoading(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">📖 Wiki</h1>

      <div className="flex gap-4 flex-wrap lg:flex-nowrap">
        {/* Sidebar */}
        {pages.length > 0 && (
          <div className="glass-ios p-3 w-full lg:w-48 shrink-0">
            <div className="text-[.65rem] font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-2">目录</div>
            <div className="space-y-0.5">
              {pages.map(p => (
                <button
                  key={p.id}
                  className={`w-full text-left text-xs py-1.5 px-2 rounded-lg transition-colors ${
                    current?.slug === p.slug
                      ? 'bg-[rgba(59,130,246,0.12)] text-blue-300/80'
                      : 'text-[rgba(255,255,255,0.4)] hover:text-white/60 hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                  onClick={() => openPage(p.slug)}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {current ? (
            detailLoading ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : (
              <div className="glass-ios p-5">
                <h2 className="text-lg font-bold tracking-tight mb-1">{current.title}</h2>
                <div className="text-[.6rem] text-[rgba(255,255,255,0.2)] mb-4">
                  最后更新：{new Date(current.updated_at).toLocaleDateString('zh-CN')}
                </div>
                <div className="text-sm text-[rgba(255,255,255,0.6)] leading-relaxed whitespace-pre-wrap">
                  {current.content || '（暂无内容）'}
                </div>
              </div>
            )
          ) : pages.length > 0 ? (
            <div className="glass-ios p-8 text-center">
              <div className="text-4xl mb-3 opacity-30">📖</div>
              <p className="text-sm text-[rgba(255,255,255,0.3)]">请从左侧目录选择一篇文章</p>
            </div>
          ) : (
            <div className="glass-ios text-center py-16">
              <div className="text-4xl mb-3 opacity-30">📚</div>
              <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无 Wiki 内容</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
