const API = ''

export interface ApiResult<T = any> {
  ok?: boolean
  error?: string
  [key: string]: any
}

export async function apiGet<T = ApiResult>(path: string): Promise<T> {
  const res = await fetch(API + path)
  return res.json()
}

export async function apiPost<T = ApiResult>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(API + path + '?' + qs, { method: 'POST' })
  return res.json()
}

export async function apiDelete<T = ApiResult>(path: string): Promise<T> {
  const res = await fetch(API + path, { method: 'DELETE' })
  return res.json()
}
