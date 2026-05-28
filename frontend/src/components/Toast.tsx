import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ToastContextType {
  toast: (msg: string, type?: 'success' | 'error') => void
}

const ToastCtx = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const [type, setType] = useState<'success' | 'error'>('success')
  const [visible, setVisible] = useState(false)
  let timer: ReturnType<typeof setTimeout>

  const toast = useCallback((m: string, t: 'success' | 'error' = 'success') => {
    clearTimeout(timer)
    setMsg(m)
    setType(t)
    setVisible(true)
    timer = setTimeout(() => setVisible(false), 2800)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl text-sm font-medium backdrop-blur-xl border transition-all duration-400 pointer-events-none ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[120px]'
        } ${
          type === 'success'
            ? 'bg-[rgba(6,78,59,0.85)] border-[rgba(5,150,105,0.3)] text-[#6ee7b7]'
            : 'bg-[rgba(127,29,29,0.85)] border-[rgba(220,38,38,0.3)] text-[#fca5a5]'
        }`}
      >
        {msg}
      </div>
    </ToastCtx.Provider>
  )
}
