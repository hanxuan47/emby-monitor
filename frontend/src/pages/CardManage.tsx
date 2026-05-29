import { useState, useEffect } from 'react'
import { apiPost, apiGet } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

export default function CardManage() {
  const { toast } = useToast()
  const [cards, setCards] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [loading, setLoading] = useState(true)

  // Create form
  const [createCount, setCreateCount] = useState('5')
  const [createPoints, setCreatePoints] = useState('0')
  const [createExpire, setCreateExpire] = useState('0')
  const [newCodes, setNewCodes] = useState<string[] | null>(null)

  const load = async (p: number) => {
    setLoading(true)
    const r = await apiGet('/api/admin/cards/list?page=' + p + '&page_size=' + pageSize)
    if (r.ok) { setCards(r.items); setTotal(r.total); setPage(p) }
    setLoading(false)
  }

  useEffect(() => { load(1) }, [])

  async function handleCreate() {
    setNewCodes(null)
    const r = await apiPost('/api/admin/cards/create', {
      count: createCount,
      points: createPoints,
      expire_days: createExpire,
    })
    if (r.ok) {
      toast(`成功创建 ${r.count} 个卡密`, 'success')
      setNewCodes(r.codes || [])
      load(1)
    } else {
      toast(r.error || '创建失败', 'error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除此卡密？')) return
    const r = await apiPost('/api/admin/cards/delete', { ids: String(id) })
    if (r.ok) { toast('已删除'); load(page) }
    else toast(r.error || '删除失败', 'error')
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">卡密管理</h1>

      {/* ── Create Form ── */}
      <div className="glass-card max-w-[600px] mb-6">
        <div className="section-title font-semibold mb-3">🎴 生成卡密</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-[rgba(255,255,255,0.4)] block mb-1">数量</label>
            <input className="glass-input" type="number" min={1} max={100} value={createCount} onChange={e => setCreateCount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[rgba(255,255,255,0.4)] block mb-1">积分</label>
            <input className="glass-input" type="number" min={0} value={createPoints} onChange={e => setCreatePoints(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[rgba(255,255,255,0.4)] block mb-1">有效期(天，0=永久)</label>
            <input className="glass-input" type="number" min={0} value={createExpire} onChange={e => setCreateExpire(e.target.value)} />
          </div>
        </div>
        <button className="glass-btn glass-btn-primary w-full" onClick={handleCreate}>✨ 生成卡密</button>

        {newCodes && newCodes.length > 0 && (
          <div className="mt-4 p-3 bg-[rgba(255,255,255,0.05)] rounded-xl">
            <div className="text-xs text-[rgba(255,255,255,0.4)] mb-2">新生成的卡密（请复制保存）：</div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto font-mono text-xs">
              {newCodes.map((code, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 bg-[rgba(255,255,255,0.03)] rounded-lg">
                  <span className="text-[#60a5fa]">{code}</span>
                  <button
                    className="text-[.65rem] text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
                    onClick={() => { navigator.clipboard.writeText(code); toast('已复制') }}
                  >复制</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Card List ── */}
      <div className="glass-card max-w-[800px]">
        <div className="flex items-center justify-between mb-3">
          <div className="section-title font-semibold">📋 卡密列表</div>
          <div className="text-xs text-[rgba(255,255,255,0.3)]">共 {total} 个</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : cards.length === 0 ? (
          <div className="text-center py-10 text-[rgba(255,255,255,0.3)] text-sm">暂无卡密</div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="text-[rgba(255,255,255,0.3)] border-b border-[rgba(255,255,255,0.05)]">
                    <th className="text-left py-2 pr-2">卡密</th>
                    <th className="text-center py-2 px-2">积分</th>
                    <th className="text-center py-2 px-2">状态</th>
                    <th className="text-center py-2 px-2">使用者</th>
                    <th className="text-center py-2 px-2">创建时间</th>
                    <th className="text-right py-2 pl-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((c: any) => (
                    <tr key={c.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="py-2.5 pr-2 font-mono text-[#60a5fa]">{c.code}</td>
                      <td className="py-2.5 px-2 text-center">{c.points}</td>
                      <td className="py-2.5 px-2 text-center">
                        {c.is_used ? (
                          <span className="text-[rgba(255,255,255,0.3)]">已使用</span>
                        ) : c.expires_at && new Date(c.expires_at) < new Date() ? (
                          <span className="text-red-400">已过期</span>
                        ) : (
                          <span className="text-green-400">有效</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center text-[rgba(255,255,255,0.5)]">{c.used_by_name || '-'}</td>
                      <td className="py-2.5 px-2 text-center text-[rgba(255,255,255,0.3)] text-[.6rem]">
                        {new Date(c.created_at).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        {!c.is_used && (
                          <button className="text-red-400 hover:text-red-300 transition-colors text-[.65rem]" onClick={() => handleDelete(c.id)}>删除</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white disabled:opacity-30"
                  disabled={page <= 1}
                  onClick={() => load(page - 1)}
                >上一页</button>
                <span className="text-xs text-[rgba(255,255,255,0.4)]">{page}/{totalPages}</span>
                <button
                  className="text-xs text-[rgba(255,255,255,0.4)] hover:text-white disabled:opacity-30"
                  disabled={page >= totalPages}
                  onClick={() => load(page + 1)}
                >下一页</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
