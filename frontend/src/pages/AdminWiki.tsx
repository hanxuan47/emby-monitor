import { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../api/client'
import { useToast } from '../components/Toast'
import { Spinner } from './Setup'

interface WikiEntry {
  id: number
  slug: string
  title: string
  content: string
  is_published: boolean
  updated_at: string
}

export default function AdminWiki() {
  const { toast } = useToast()
  const [pages, setPages] = useState<WikiEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number | null>(null)
  const [formSlug, setFormSlug] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formPublished, setFormPublished] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    setLoading(true)
    apiGet('/api/wiki/all?token=' + localStorage.getItem('ebt'))
      .then(r => { if (r.pages) setPages(r.pages) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setFormSlug(''); setFormTitle(''); setFormContent('')
    setFormPublished(true); setEditId(null); setShowForm(false)
  }

  function startEdit(p: WikiEntry) {
    setEditId(p.id); setFormSlug(p.slug); setFormTitle(p.title)
    setFormContent(p.content); setFormPublished(p.is_published); setShowForm(true)
  }

  async function handleSave() {
    if (!formTitle.trim() || !formSlug.trim()) {
      toast('请填写标题和 slug', 'error'); return
    }
    let payload: Record<string, string> = {
      title: formTitle.trim(),
      content: formContent,
      is_published: formPublished ? '1' : '0',
      token: localStorage.getItem('ebt') || '',
    }
    let r
    if (editId) {
      r = await apiPost(`/api/wiki/${editId}`, payload)
    } else {
      payload['slug'] = formSlug.trim().toLowerCase().replace(/\s+/g, '-')
      r = await apiPost('/api/wiki/create', payload)
    }
    if (r.ok) { toast(editId ? '已更新' : '已创建'); resetForm(); load() }
    else toast(r.error || '操作失败', 'error')
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除此页面？')) return
    const r = await fetch(`/api/wiki/${id}?token=${localStorage.getItem('ebt')}`, { method: 'DELETE' }).then(r => r.json())
    if (r.ok) { toast('已删除'); load() }
    else toast('删除失败', 'error')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">📖 Wiki 管理</h1>
        <button className="glass-btn glass-btn-sm" onClick={() => { resetForm(); setShowForm(true) }}>＋ 新建页面</button>
      </div>

      {/* Edit Form */}
      {showForm && (
        <div className="glass-ios p-4 mb-4">
          <div className="text-xs font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">
            {editId ? '编辑页面' : '新建 Wiki 页面'}
          </div>
          {!editId && (
            <input className="glass-input mb-3" placeholder="Slug (英文, 如 getting-started) *" value={formSlug} onChange={e => setFormSlug(e.target.value)} />
          )}
          <input className="glass-input mb-3" placeholder="标题 *" value={formTitle} onChange={e => setFormTitle(e.target.value)} />
          <textarea
            className="glass-input h-52 resize-none font-mono text-sm"
            placeholder="内容 (Markdown 格式)"
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.5)] mt-3">
            <input type="checkbox" checked={formPublished} onChange={e => setFormPublished(e.target.checked)} className="accent-blue-500" />
            已发布
          </label>
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
      ) : pages.length === 0 ? (
        <div className="glass-ios text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📚</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无 Wiki 页面</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map(p => (
            <div key={p.id} className="glass-ios p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.is_published ? 'bg-green-400' : 'bg-gray-500/40'}`} />
                    <span className="font-semibold text-sm">{p.title}</span>
                    <code className="text-[.55rem] text-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 rounded">
                      /{p.slug}
                    </code>
                    <span className={`text-[.55rem] px-1.5 py-0.5 rounded-md font-medium ${
                      p.is_published ? 'bg-green-500/10 text-green-300/70' : 'bg-gray-500/10 text-gray-400/60'
                    }`}>
                      {p.is_published ? '已发布' : '草稿'}
                    </span>
                  </div>
                  {p.content && (
                    <div className="text-[.65rem] text-[rgba(255,255,255,0.3)] mt-1.5 line-clamp-1">
                      {p.content.slice(0, 120)}{p.content.length > 120 ? '...' : ''}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <button className="glass-btn glass-btn-sm text-[.6rem]" onClick={() => startEdit(p)}>编辑</button>
                  <button className="glass-btn glass-btn-sm glass-btn-danger text-[.6rem]" onClick={() => handleDelete(p.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
