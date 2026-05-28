const TK = 'ebt'
const UK = 'ebu'

export interface User {
  id: number
  username: string
  email: string
  role: string
  points: number
  emby_username?: string
  emby_user_id?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TK)
}

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(UK)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuth(token: string, user: User) {
  localStorage.setItem(TK, token)
  localStorage.setItem(UK, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TK)
  localStorage.removeItem(UK)
}

export function isAdmin(): boolean {
  const u = getUser()
  return u?.role === 'admin'
}

export function isLoggedIn(): boolean {
  return !!getToken()
}
