export interface SavedKeyword {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export async function getAllKeywords(): Promise<SavedKeyword[]> {
  try {
    const res = await fetch('/api/keywords')
    if (!res.ok) return []
    const data = await res.json()
    return data.keywords ?? []
  } catch {
    return []
  }
}

export async function saveKeyword(keyword: { id?: string; title: string; content: string }): Promise<SavedKeyword | null> {
  try {
    const res = await fetch('/api/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keyword),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.keyword ?? null
  } catch {
    return null
  }
}

export async function deleteKeyword(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/keywords', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    return res.ok
  } catch {
    return false
  }
}
