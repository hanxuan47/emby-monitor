import { useState, useEffect, useRef } from 'react'
import { apiGet } from '../api/client'
import { Spinner } from './Setup'

declare global {
  interface Window {
    AMap: any
    _AMapSecurityConfig: any
  }
}

const AMAP_KEY_STORAGE = 'amap_key'

export function UserMap() {
  const [amapKey, setAmapKey] = useState(() => localStorage.getItem(AMAP_KEY_STORAGE) || '')
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [keyInput, setKeyInput] = useState(amapKey)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  // Load location data from backend
  useEffect(() => {
    if (!amapKey) { setLoading(false); return }
    setLoading(true)
    apiGet('/api/users/map').then((data: any) => {
      if (data?.locations) {
        setLocations(data.locations)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [amapKey])

  // Load 高德地图 JS API
  useEffect(() => {
    if (!amapKey || !mapRef.current) return
    if (document.querySelector('#amap-script')) {
      // Script already loaded
      initMap()
      return
    }

    window._AMapSecurityConfig = { securityJsCode: '' } // optional
    const script = document.createElement('script')
    script.id = 'amap-script'
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`
    script.onload = () => initMap()
    document.head.appendChild(script)

    function initMap() {
      if (!mapRef.current || !window.AMap) return
      mapInstance.current = new window.AMap.Map(mapRef.current, {
        zoom: 4,
        center: [104, 35], // China center
        mapStyle: 'amap://styles/dark',
        layers: [new window.AMap.TileLayer.Satellite()],
      })
      setMapReady(true)
    }

    return () => {
      // Cleanup not needed on unmount
    }
  }, [amapKey])

  // Update markers when locations change
  useEffect(() => {
    if (!mapReady || !window.AMap || !mapInstance.current) return

    // Clear old markers
    markersRef.current.forEach(m => mapInstance.current?.remove(m))
    markersRef.current = []

    if (locations.length === 0) {
      // No locations - center on China
      mapInstance.current.setZoomAndCenter(4, [104, 35])
      return
    }

    // Add markers for each location
    const bounds = new window.AMap.Bounds()
    locations.forEach((loc: any) => {
      if (!loc.lat || !loc.lng) return
      const pos = [loc.lng, loc.lat]
      bounds.extend(pos)

      const marker = new window.AMap.Marker({
        position: pos,
        title: loc.user_name,
        label: {
          content: `<div style="background:rgba(18,21,31,0.9);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:6px 12px;font-size:12px;color:#f0f2f5;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.4)">📍 ${loc.user_name}</div>`,
          direction: 'top',
          offset: new window.AMap.Pixel(0, -8),
        },
        animation: 'AMAP_ANIMATION_DROP',
      })
      marker.content = `
        <div style="background:rgba(18,21,31,0.95);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:16px 20px;min-width:200px;color:#f0f2f5;font-family:system-ui,sans-serif">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px">👤 ${loc.user_name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.8">
            <div>📱 ${loc.device || '未知设备'}</div>
            <div>🎬 ${loc.item_name || '未播放'}</div>
            <div>🌍 ${[loc.city, loc.country].filter(Boolean).join(', ') || loc.ip}</div>
            ${loc.isp ? `<div>🏢 ${loc.isp}</div>` : ''}
          </div>
        </div>
      `
      marker.on('click', () => {
        const info = new window.AMap.InfoWindow({ content: marker.content, offset: new window.AMap.Pixel(0, -30) })
        info.open(mapInstance.current, pos)
      })
      mapInstance.current.add(marker)
      markersRef.current.push(marker)
    })

    // Fit bounds to show all markers
    if (!bounds.isEmpty()) {
      mapInstance.current.setFitView(null, false, [60, 60, 60, 60])
    }
  }, [mapReady, locations])

  function saveKey() {
    const key = keyInput.trim()
    if (!key) return
    localStorage.setItem(AMAP_KEY_STORAGE, key)
    setAmapKey(key)
  }

  function clearKey() {
    localStorage.removeItem(AMAP_KEY_STORAGE)
    setAmapKey('')
    setKeyInput('')
    setMapReady(false)
    // Remove script
    const script = document.querySelector('#amap-script')
    if (script) script.remove()
  }

  // Setup prompt if no key
  if (!amapKey) {
    return (
      <div>
        <h1 className="text-xl font-bold tracking-tight mb-4">📍 用户地图</h1>
        <div className="glass-card max-w-[480px]">
          <div className="section-title font-semibold mb-3">🔑 高德地图 API 配置</div>
          <p className="text-xs text-[rgba(255,255,255,0.4)] mb-4 leading-relaxed">
            需要高德地图 JS API Key 才能显示用户地理位置。<br />
            前往 <a className="text-[#60a5fa]" href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener noreferrer">高德开放平台</a> 注册并创建 Web端(JS API) 应用获取 Key。
          </p>
          <div className="space-y-3">
            <input
              className="glass-input"
              placeholder="输入高德地图 JS API Key"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
            />
            <button className="glass-btn glass-btn-primary w-full" onClick={saveKey}>
              保存并加载地图
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">📍 用户地图</h1>
        <div className="flex items-center gap-2">
          <span className="text-[.65rem] text-[rgba(255,255,255,0.3)]">
            {locations.length > 0 ? `${locations.length} 个在线用户` : '暂无在线用户'}
          </span>
          <button
            className="text-[.65rem] text-[rgba(255,255,255,0.3)] hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-[rgba(255,255,255,0.05)]"
            onClick={clearKey}
          >
            换Key
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="glass-ios p-2 overflow-hidden" style={{ borderRadius: 18 }}>
          <div ref={mapRef} style={{ width: '100%', height: '65vh', borderRadius: 14 }} />
          {!mapReady && (
            <div className="flex justify-center py-10 text-sm text-[rgba(255,255,255,0.3)]">
              加载高德地图中...
            </div>
          )}
        </div>
      )}

      {/* User list below map */}
      {locations.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-[rgba(255,255,255,0.3)] font-semibold uppercase tracking-wider mb-2">
            在线用户
          </div>
          {locations.map((loc: any, i: number) => (
            <div key={i} className="glass-card flex items-center gap-3 py-2.5 px-3.5">
              <div className="w-7 h-7 rounded-full bg-[rgba(59,130,246,0.15)] flex items-center justify-center text-xs font-bold text-blue-400">
                {loc.user_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{loc.user_name}</div>
                <div className="text-[.65rem] text-[rgba(255,255,255,0.3)] truncate">
                  {loc.device} · {loc.item_name || '未播放'}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[.65rem] text-[rgba(255,255,255,0.4)]">
                  {[loc.city, loc.country].filter(Boolean).join(', ') || '未知位置'}
                </div>
                <div className="text-[.55rem] text-[rgba(255,255,255,0.2)]">{loc.isp || ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
