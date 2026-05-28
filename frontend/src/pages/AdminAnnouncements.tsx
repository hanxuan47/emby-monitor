import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

interface Announcement {
  id: number
  title: string
  content: string
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export default function AdminAnnouncements() {
  const { toast } = useToast()
  const [anns, setAnns] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    setLoading(true)
    apiGet('/api/announcements/all?token=' + localStorage.getItem('ebt'))
      .then(r => { if (r.announcements) setAnns(r.announcements) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function resetForm() { setFormTitle(''); setFormContent(''); setEditId(null); setShowForm(false) }

  function startEdit(a: Announcement) {
    setEditId(a.id); setFormTitle(a.title); setFormContent(a.content); setShowForm(true)
  }

  async function handleSave() {
    if (!formTitle.trim()) { toast('请输入标题', 'error'); return }
    const payload = {
      title: formTitle.trim(),
      content: formContent,
      token: localStorage.getItem('ebt') || '',
    }
    const r = editId
      ? await apiPost(`/api/announcements/${editId}`, payload)
      : await apiPost('/api/announcements/create', payload)
    if (r.ok) { toast(editId ? '已更新' : '已创建'); resetForm(); load() }
    else toast(r.error || '操作失败', 'error')
  }

  async function handleToggle(id: number) {
    const r = await apiPost(`/api/announcements/${id}/toggle`, { token: localStorage.getItem('ebt') || '' })
    if (r.ok) { toast(r.is_published ? '已发布' : '已取消发布'); load() }
    else toast(r.error || '操作失败', 'error')
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除此公告？')) return
    const r = await fetch(`/api/announcements/${id}?token=${localStorage.getItem('ebt')}`, { method: 'DELETE' }).then(r => r.json())
    if (r.ok) { toast('已删除'); load() }
    else toast('删除失败', 'error')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">📢 公告管理</h1>
        <button className="glass-btn glass-btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>＋ 写公告</button>
      </div>

      {/* Edit Form */}
      {showForm && (
        <div className="glass-ios p-4 mb-4">
          <div className="text-xs font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">
            {editId ? '编辑公告' : '写公告'}
          </div>
          <input className="glass-input mb-3" placeholder="标题 *" value={formTitle} onChange={e => setFormTitle(e.target.value)} />
          <textarea
            className="glass-input h-40 resize-none"
            placeholder="内容 (支持 Markdown)"
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
          />
          <div className="flex gap-2 mt-3">
            <button className="glass-btn glass-btn-primary" onClick={handleSave}>
              {editId ? '保存' : '创建'}
            </button>
            <button className="glass-btn glass-btn-sm" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : anns.length === 0 ? (
        <div className="glass-ios text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📋</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无公告</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {anns.map(a => (
            <div key={a.id} className="glass-ios p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.is_published ? 'bg-green-400' : 'bg-gray-500/40'}`} />
                    <span className="font-semibold text-sm">{a.title}</span>
                    <span className={`text-[.55rem] px-1.5 py-0.5 rounded-md font-medium ${
                      a.is_published ? 'bg-green-500/10 text-green-300/70' : 'bg-gray-500/10 text-gray-400/60'
                    }`}>
                      {a.is_published ? '已发布' : '草稿'}
                    </span>
                  </div>
                  <div className="text-[.6rem] text-[rgba(255,255,255,0.2)] mt-1">
                    {a.created_at.slice(0, 10)}
                    {a.published_at && ` · 发布于 ${new Date(a.published_at).toLocaleDateString('zh-CN')}`}
                  </div>
                  {a.content && (
                    <div className="text-[.7rem] text-[rgba(255,255,255,0.4)] mt-1.5 line-clamp-2">{a.content}</div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <button className="glass-btn glass-btn-sm text-[.6rem]" onClick={() => startEdit(a)}>编辑</button>
                  <button className="glass-btn glass-btn-sm text-[.6rem]" onClick={() => handleToggle(a.id)}>
                    {a.is_published ? '下架' : '发布'}
                  </button>
                  <button className="glass-btn glass-btn-sm glass-btn-danger text-[.6rem]" onClick={() => handleDelete(a.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
