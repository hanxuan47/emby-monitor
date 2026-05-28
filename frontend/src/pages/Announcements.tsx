import { useState, useEffect } from 'react'
import { apiGet } from '../api/client'
import { Spinner } from './Setup'

interface Ann {
  id: number
  title: string
  content: string
  published_at: string | null
  created_at: string
}

export function Announcements() {
  const [anns, setAnns] = useState<Ann[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    apiGet('/api/announcements?token=' + localStorage.getItem('ebt'))
      .then(r => { if (r.announcements) setAnns(r.announcements) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">📢 公告</h1>

      {anns.length === 0 ? (
        <div className="glass-ios text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无公告</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anns.map(a => {
            const isOpen = expanded === a.id
            const date = a.published_at
              ? new Date(a.published_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
              : ''

            return (
              <div key={a.id} className="glass-ios p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : a.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isOpen ? 'bg-blue-400' : 'bg-blue-400/50'}`} />
                      <span className="font-semibold text-sm">{a.title}</span>
                    </div>
                    {date && (
                      <div className="text-[.6rem] text-[rgba(255,255,255,0.2)] mt-1">{date}</div>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-[rgba(255,255,255,0.2)] transition-transform duration-300 shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="M19 9l-7 7-7-7" strokeLinecap="round" />
                  </svg>
                </div>

                {isOpen && a.content && (
                  <div className="mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                    <div className="text-sm text-[rgba(255,255,255,0.6)] leading-relaxed whitespace-pre-wrap">
                      {a.content}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
