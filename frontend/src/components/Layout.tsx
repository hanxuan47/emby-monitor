import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuth, getUser, isAdmin } from '../api/auth'
import { Logo } from '../pages/Setup'
import type { User } from '../api/auth'

interface NavItem {
  id: string
  label: string
  icon: string
  adminOnly?: boolean
}

const userNav: NavItem[] = [
  { id: 'discovery', label: '影视发现', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { id: 'my-requests', label: '我的求片', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'dashboard', label: '仪表盘', icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z' },
  { id: 'checkin', label: '签到', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'streams', label: '实时流', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664zM21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'media-recent', label: '最近更新', icon: 'M3 5h18v14H3V5zm4 2v10M15 7v10' },
  { id: 'media-reviews', label: '评价', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { id: 'library', label: '媒体库', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'codec', label: '编码分析', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'tickets', label: '工单', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z' },
  { id: 'settings', label: '设置', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
]

const adminExtra: NavItem[] = [
  { id: 'admin-requests', label: '求片管理', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'sessions', label: '活跃会话', icon: 'M12 5a3 3 0 100 6 3 3 0 000-6zM2 19a6 6 0 0112 0H2zm16-6a3 3 0 100 6 3 3 0 000-6z' },
  { id: 'users', label: '用户活动', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm10 6a4 4 0 100-8 4 4 0 000 8z' },
  { id: 'users-mgmt', label: 'Emby用户', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z' },
  { id: 'sites', label: '站点', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { id: 'notifications', label: '通知', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
]

export function Sidebar({ currentPage, onNavigate }: { currentPage: string; onNavigate: (id: string) => void }) {
  const nav = useNavigate()
  const user = getUser()
  const admin = isAdmin()
  const items = admin ? [...userNav, ...adminExtra] : userNav

  function handleLogout() {
    clearAuth()
    nav('/')
  }

  return (
    <aside className="w-[230px] bg-[rgba(13,15,22,0.92)] backdrop-blur-[40px] border-r border-[rgba(255,255,255,0.07)] flex flex-col h-screen sticky top-0 z-50 overflow-y-auto">
      <div className="flex items-center gap-2.5 px-4 py-4 mb-1">
        <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#lg)" strokeWidth="1.8" />
        </svg>
        <span className="font-bold text-sm tracking-tight">Emby <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Monitor</span></span>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-1">
        {items.map((item, i) => {
          const isSection = i === 0 || (admin && i === userNav.length)
          return (
            <div key={item.id}>
              {isSection && i > 0 && <div className="sidebar-label px-3 pt-4 pb-1 text-[.65rem] text-[rgba(255,255,255,0.3)] font-semibold uppercase tracking-wider">{admin && i >= userNav.length ? '管理' : '概览'}</div>}
              <div
                className={`sidebar-link ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0 opacity-70">
                  <path d={item.icon} strokeLinecap="round" />
                </svg>
                <span>{item.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-[rgba(255,255,255,0.07)] mx-3 my-2" />
      <div className="px-3 space-y-0.5 pb-2">
        <div className="sidebar-link" onClick={() => onNavigate('settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
          <span>设置</span>
        </div>
        <div className="sidebar-link" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          <span>退出</span>
        </div>
      </div>

      <div id="connStatus" className="flex items-center gap-2 px-4 py-2 text-xs text-[rgba(255,255,255,0.3)]">
        <span className="pulse-dot red" />
        <span>未连接</span>
      </div>
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <linearGradient id="lg" x1="2" y1="2" x2="22" y2="22">
            <stop stopColor="#3b82f6" /><stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
    </aside>
  )
}

export function TabBar({ currentPage, onNavigate }: { currentPage: string; onNavigate: (id: string) => void }) {
  const user = getUser()
  const admin = isAdmin()

  const tabs = admin
    ? [
        { id: 'dashboard', label: '首页', icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z' },
        { id: 'streams', label: '流', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
        { id: 'checkin', label: '签到', icon: 'M9 12l2 2 4-4' },
        { id: 'users-mgmt', label: '用户', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3' },
        { id: 'tickets', label: '工单', icon: 'M15 5v2m0 4v2m0 4v2' },
      ]
    : [
        { id: 'dashboard', label: '首页', icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z' },
        { id: 'streams', label: '流', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
        { id: 'checkin', label: '签到', icon: 'M9 12l2 2 4-4' },
        { id: 'tickets', label: '工单', icon: 'M15 5v2m0 4v2m0 4v2' },
        { id: 'settings', label: '设置', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0' },
      ]

  return (
    <div className="hidden max-md:flex fixed bottom-0 left-0 right-0 z-100 bg-[rgba(13,15,22,0.92)] backdrop-blur-[40px] border-t border-[rgba(255,255,255,0.07)] px-0 pt-1 pb-[calc(.3rem+var(--safe-bottom))] justify-around">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`flex flex-col items-center gap-[1px] px-1 py-1 cursor-pointer transition-colors border-none bg-transparent min-w-0 flex-1 ${currentPage === t.id ? 'text-[#3b82f6]' : 'text-[rgba(255,255,255,0.3)]'}`}
          onClick={() => onNavigate(t.id)}
        >
          <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d={t.icon} strokeLinecap="round" />
          </svg>
          <span className="text-[.6rem] font-medium">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
