import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

export function MyRequests() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const load = () => {
    setLoading(true)
    apiGet('/api/requests/list?token=' + localStorage.getItem('ebt') + (filter ? '&status=' + filter : '')).then(r => {
      if (r.requests) setRequests(r.requests)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  async function vote(id: number) {
    const r = await apiPost('/api/requests/vote', { token: localStorage.getItem('ebt') || '', request_id: String(id) })
    if (r.ok) { toast('已投票'); load() }
    else toast(r.error || '投票失败', 'error')
  }

  const statusBadge: Record<string, string> = {
    pending: 'glass-badge-yellow',
    approved: 'glass-badge-green',
    rejected: 'glass-badge-red',
    downloaded: 'glass-badge-blue',
  }
  const statusLabel: Record<string, string> = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝',
    downloaded: '已入库',
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">📋 我的求片</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'pending', 'approved', 'rejected', 'downloaded'].map(s => (
          <button
            key={s}
            className={`glass-btn glass-btn-sm ${filter === s ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
            onClick={() => setFilter(s)}
          >
            {s ? statusLabel[s] : '全部'}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : requests.length === 0 ? (
        <div className="text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">
          还没有求片，去「影视发现」搜一搜吧
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="glass-card flex gap-3 p-3">
              {r.poster_url ? (
                <img src={r.poster_url} alt="" className="w-12 h-[72px] rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-[72px] rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center text-lg shrink-0">
                  {r.media_type === 'tv' ? '📺' : '🎬'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{r.title}</span>
                  <span className="text-[.65rem] text-[rgba(255,255,255,0.3)] shrink-0">{r.year}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`glass-badge text-[.6rem] ${statusBadge[r.status]}`}>{statusLabel[r.status]}</span>
                  <span className="text-[.65rem] text-[rgba(255,255,255,0.3)]">👍 {r.vote_count}</span>
                </div>
                {r.admin_note && (
                  <div className="text-[.7rem] text-[rgba(255,255,255,0.4)] mt-1">备注: {r.admin_note}</div>
                )}
              </div>
              {r.status === 'pending' && (
                <button className="glass-btn glass-btn-secondary glass-btn-sm self-center" onClick={() => vote(r.id)}>
                  👍 投票
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminRequests() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [note, setNote] = useState('')

  const load = () => {
    setLoading(true)
    apiGet('/api/requests/list?token=' + localStorage.getItem('ebt') + (filter ? '&status=' + filter : '')).then(r => {
      if (r.requests) setRequests(r.requests)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter])

  async function approve(id: number) {
    const r = await apiPost('/api/requests/approve/' + id, { token: localStorage.getItem('ebt') || '', note })
    if (r.ok) { toast('✅ 已批准'); setNote(''); load() }
    else toast(r.error || '操作失败', 'error')
  }

  async function reject(id: number) {
    const r = await apiPost('/api/requests/reject/' + id, { token: localStorage.getItem('ebt') || '', note })
    if (r.ok) { toast('❌ 已拒绝'); setNote(''); load() }
    else toast(r.error || '操作失败', 'error')
  }

  async function markDownloaded(id: number) {
    const r = await apiPost('/api/requests/downloaded/' + id, { token: localStorage.getItem('ebt') || '' })
    if (r.ok) { toast('📥 已标记入库'); load() }
    else toast(r.error || '操作失败', 'error')
  }

  const statusBadge: Record<string, string> = {
    pending: 'glass-badge-yellow', approved: 'glass-badge-green',
    rejected: 'glass-badge-red', downloaded: 'glass-badge-blue',
  }
  const statusLabel: Record<string, string> = {
    pending: '待审批', approved: '已通过',
    rejected: '已拒绝', downloaded: '已入库',
  }

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-4">📩 求片管理</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['pending', 'approved', 'rejected', 'downloaded', ''].map(s => (
          <button key={s} className={`glass-btn glass-btn-sm ${filter === s ? 'glass-btn-primary' : 'glass-btn-secondary'}`}
            onClick={() => setFilter(s)}>{s ? statusLabel[s] : '全部'}</button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <input className="glass-input max-w-xs" placeholder="审批备注（可选）" value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {loading ? <div className="py-10"><Spinner /></div> : requests.length === 0 ? (
        <div className="text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">暂无求片</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="glass-card flex gap-3 p-3">
              {r.poster_url ? (
                <img src={r.poster_url} alt="" className="w-14 h-20 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-14 h-20 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center justify-center text-lg shrink-0">
                  {r.media_type === 'tv' ? '📺' : '🎬'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-[.65rem] text-[rgba(255,255,255,0.3)]">{r.year}</span>
                  <span className={`glass-badge text-[.6rem] ${statusBadge[r.status]}`}>{statusLabel[r.status]}</span>
                </div>
                <div className="text-[.7rem] text-[rgba(255,255,255,0.4)] mt-0.5">用户 #{r.user_id} · 👍 {r.vote_count} · {r.media_type === 'movie' ? '电影' : '剧集'}</div>
                {r.voter_ids?.length > 0 && (
                  <div className="text-[.65rem] text-[rgba(255,255,255,0.3)] mt-0.5">投票用户: {r.voter_ids.join(', ')}</div>
                )}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {r.status === 'pending' && (
                    <>
                      <button className="glass-btn glass-btn-primary glass-btn-sm" onClick={() => approve(r.id)}>✅ 批准</button>
                      <button className="glass-btn glass-btn-danger glass-btn-sm" onClick={() => reject(r.id)}>❌ 拒绝</button>
                    </>
                  )}
                  {r.status === 'approved' && (
                    <button className="glass-btn glass-btn-primary glass-btn-sm" onClick={() => markDownloaded(r.id)}>📥 标记入库</button>
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
