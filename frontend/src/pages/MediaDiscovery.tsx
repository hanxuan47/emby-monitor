import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

interface TMDBResult {
  tmdb_id: number
  media_type: string
  title: string
  year: string
  poster: string
  overview: string
  vote_average: number
}

export default function MediaDiscovery() {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [trending, setTrending] = useState<TMDBResult[]>([])
  const [submittingId, setSubmittingId] = useState<number | null>(null)

  useEffect(() => {
    apiGet('/api/tmdb/trending').then(r => {
      if (r.results) setTrending(r.results)
    }).catch(() => {})
  }, [])

  async function doSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    const r = await apiGet('/api/tmdb/search?q=' + encodeURIComponent(query))
    setSearching(false)
    if (r.results) setResults(r.results)
    else toast(r.error || '搜索失败', 'error')
  }

  async function submitRequest(item: TMDBResult) {
    setSubmittingId(item.tmdb_id)
    const r = await apiPost('/api/requests/create', {
      token: localStorage.getItem('ebt') || '',
      tmdb_id: String(item.tmdb_id),
      media_type: item.media_type,
      title: item.title,
      year: item.year,
      poster_url: item.poster,
      overview: item.overview,
    })
    setSubmittingId(null)
    if (r.ok) toast('🎬 求片已提交！等待管理员审批')
    else toast(r.error || '提交失败', 'error')
  }

  function renderGrid(items: TMDBResult[], isTrending = false) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {items.map(item => (
          <div key={item.tmdb_id} className="stat-card p-0 overflow-hidden flex flex-col">
            <div className="aspect-[2/3] bg-[rgba(255,255,255,0.03)] relative overflow-hidden">
              {item.poster ? (
                <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-[rgba(255,255,255,0.15)] text-sm">
                  {item.media_type === 'tv' ? '📺' : '🎬'}
                </div>
              )}
              <div className="absolute top-1.5 right-1.5">
                <span className="glass-badge glass-badge-yellow text-[.6rem]">⭐ {item.vote_average.toFixed(1)}</span>
              </div>
              <div className="absolute top-1.5 left-1.5">
                <span className={`glass-badge text-[.6rem] ${item.media_type === 'movie' ? 'glass-badge-blue' : 'glass-badge-purple'}`}>
                  {item.media_type === 'movie' ? '电影' : '剧集'}
                </span>
              </div>
            </div>
            <div className="p-2.5 flex flex-col flex-1">
              <div className="text-sm font-medium truncate">{item.title}</div>
              <div className="text-[.65rem] text-[rgba(255,255,255,0.3)] mt-0.5">{item.year || '—'}</div>
              <button
                className={`glass-btn glass-btn-sm w-full mt-2 ${submittingId === item.tmdb_id ? 'glass-btn-secondary' : 'glass-btn-primary'}`}
                onClick={() => submitRequest(item)}
                disabled={submittingId === item.tmdb_id}
              >
                {submittingId === item.tmdb_id ? '提交中...' : '求片'}
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">🎞️ 影视发现</h1>

      <form onSubmit={doSearch} className="flex gap-2 mb-5">
        <input
          className="glass-input flex-1"
          placeholder="搜索电影或剧集..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="glass-btn glass-btn-primary" disabled={searching}>
          {searching ? <Spinner /> : '🔍 搜索'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-3">
            搜索结果 ({results.length})
          </h2>
          {renderGrid(results)}
        </div>
      )}

      {results.length === 0 && !searching && (
        <div>
          <h2 className="text-sm font-semibold text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-3">
            🔥 本周热门
          </h2>
          {trending.length > 0 ? renderGrid(trending) : (
            <div className="text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">
              先配置 TMDB API Key 才能搜索
            </div>
          )}
        </div>
      )}
    </div>
  )
}
