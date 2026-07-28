// Thin fetch wrapper for the Netlify Functions API — mirrors AuthContext.tsx's own fetch calls
// (httpOnly session cookie via `credentials: 'include'`, JSON body/response) so every data hook
// talks to the backend the same way auth already does.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? 'Request failed')
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
