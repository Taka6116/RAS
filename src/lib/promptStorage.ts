export interface SavedPrompt {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export async function getAllPrompts(): Promise<SavedPrompt[]> {
  try {
    const res = await fetch('/api/prompts')
    if (!res.ok) return []
    const data = await res.json()
    return data.prompts ?? []
  } catch {
    return []
  }
}

export async function savePrompt(prompt: { id?: string; title: string; content: string }): Promise<SavedPrompt | null> {
  try {
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.prompt ?? null
  } catch {
    return null
  }
}

export async function deletePrompt(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/prompts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    return res.ok
  } catch {
    return false
  }
}
