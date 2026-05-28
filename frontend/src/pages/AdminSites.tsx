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
  sort_order: number
  is_active: boolean
  last_check: string | null
}

export default function AdminSites() {
  const { toast } = useToast()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  // Form fields
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formType, setFormType] = useState('emby')
  const [formTags, setFormTags] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formSort, setFormSort] = useState(0)
  const [formActive, setFormActive] = useState(true)

  const load = () => {
    setLoading(true)
    apiGet('/api/sites?token=' + localStorage.getItem('ebt'))
      .then(r => { if (r.sites) setSites(r.sites) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setFormName(''); setFormUrl(''); setFormType('emby')
    setFormTags(''); setFormNote(''); setFormSort(0); setFormActive(true)
    setEditId(null); setShowCreate(false)
  }

  function startEdit(site: Site) {
    setEditId(site.id)
    setFormName(site.name)
    setFormUrl(site.url)
    setFormType(site.route_type)
    setFormTags(site.tags)
    setFormNote(site.note)
    setFormSort(site.sort_order)
    setFormActive(site.is_active)
    setShowCreate(true)
  }

  async function handleSubmit() {
    if (!formName.trim() || !formUrl.trim()) {
      toast('请填写名称和地址', 'error'); return
    }
    const payload = {
      name: formName.trim(),
      url: formUrl.trim(),
      route_type: formType,
      tags: formTags,
      note: formNote,
      sort_order: String(formSort),
      is_active: formActive ? '1' : '0',
      token: localStorage.getItem('ebt') || '',
    }

    let r
    if (editId) {
      r = await apiPost(`/api/sites/update/${editId}`, payload)
    } else {
      r = await apiPost('/api/sites/create', payload)
    }
    if (r.ok) {
      toast(editId ? '已更新' : '已创建')
      resetForm()
      load()
    } else {
      toast(r.error || '操作失败', 'error')
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('确认删除此线路？')) return
    const r = await fetch(`/api/sites/${id}?token=${localStorage.getItem('ebt')}`, { method: 'DELETE' }).then(r => r.json())
    if (r.ok) { toast('已删除'); load() }
    else toast(r.error || '删除失败', 'error')
  }

  async function handleTest(id: number) {
    const r = await apiPost(`/api/sites/test/${id}`, { token: localStorage.getItem('ebt') || '' })
    if (r.ok) {
      toast(`测速完成: ${r.status}, ${r.latency_ms}ms`)
      load()
    } else toast(r.error || '测速失败', 'error')
  }

  async function handleTestAll() {
    const r = await apiPost('/api/sites/test-all', { token: localStorage.getItem('ebt') || '' })
    if (r.ok) { toast('全部测速完成'); load() }
    else toast(r.error || '测速失败', 'error')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">📡 线路管理</h1>
        <div className="flex gap-2">
          <button className="glass-btn glass-btn-sm glass-btn-primary" onClick={handleTestAll}>⚡ 全部测速</button>
          <button className="glass-btn glass-btn-sm" onClick={() => { resetForm(); setShowCreate(true) }}>＋ 添加线路</button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {showCreate && (
        <div className="glass-ios p-4 mb-4">
          <div className="text-xs font-semibold text-[rgba(255,255,255,0.3)] uppercase tracking-wider mb-3">
            {editId ? '编辑线路' : '添加线路'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="glass-input" placeholder="名称 *" value={formName} onChange={e => setFormName(e.target.value)} />
            <input className="glass-input" placeholder="地址 * (https://...)" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
            <select className="glass-input" value={formType} onChange={e => setFormType(e.target.value)}>
              <option value="emby">Emby</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="proxy">Proxy</option>
            </select>
            <input className="glass-input" placeholder="标签 (逗号分隔: 优化,直连,国内)" value={formTags} onChange={e => setFormTags(e.target.value)} />
            <input className="glass-input" placeholder="排序 (数字越小越靠前)" value={formSort} onChange={e => setFormSort(Number(e.target.value))} />
            <label className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.5)]">
              <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} className="accent-blue-500" />
              启用
            </label>
          </div>
          <textarea className="glass-input mt-3 h-20 resize-none" placeholder="备注" value={formNote} onChange={e => setFormNote(e.target.value)} />
          <div className="flex gap-2 mt-3">
            <button className="glass-btn glass-btn-primary" onClick={handleSubmit}>{editId ? '保存' : '创建'}</button>
            <button className="glass-btn glass-btn-sm" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}

      {/* Sites List */}
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : sites.length === 0 ? (
        <div className="glass-ios text-center py-16">
          <div className="text-4xl mb-3 opacity-30">📡</div>
          <p className="text-sm text-[rgba(255,255,255,0.3)]">暂无线路，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sites.map(site => {
            const tagList = site.tags ? site.tags.split(',').map(t => t.trim()).filter(Boolean) : []
            const isOnline = site.status === 'online'
            const latency = site.latency_ms >= 0 ? `${site.latency_ms}ms` : '-'

            return (
              <div key={site.id} className="glass-ios p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${site.is_active ? (isOnline ? 'bg-green-400' : 'bg-red-400/50') : 'bg-gray-500/30'}`} />
                      <span className={`font-semibold text-sm ${!site.is_active ? 'line-through opacity-50' : ''}`}>{site.name}</span>
                      <span className={`text-[.6rem] px-1.5 py-0.5 rounded-md font-medium ${
                        isOnline ? 'bg-green-500/10 text-green-300/70' : 'bg-red-500/10 text-red-300/60'
                      }`}>
                        {isOnline ? (site.latency_ms > 0 ? `${site.latency_ms}ms` : '在线') : '离线'}
                      </span>
                      <span className="text-[.55rem] text-[rgba(255,255,255,0.2)]">{site.route_type}</span>
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

                    <div className="text-[.6rem] text-[rgba(255,255,255,0.2)] mt-1.5 truncate">{site.url}</div>
                    {site.note && <div className="text-[.6rem] text-[rgba(255,255,255,0.15)] mt-1">{site.note}</div>}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button className="glass-btn glass-btn-sm text-[.6rem]" onClick={() => startEdit(site)}>编辑</button>
                    <button className="glass-btn glass-btn-sm text-[.6rem]" onClick={() => handleTest(site.id)}>测速</button>
                    <button className="glass-btn glass-btn-sm glass-btn-danger text-[.6rem]" onClick={() => handleDelete(site.id)}>删除</button>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="text-center text-[.65rem] text-[rgba(255,255,255,0.2)] py-2">
            共 {sites.length} 条线路
          </div>
        </div>
      )}
    </div>
  )
}
