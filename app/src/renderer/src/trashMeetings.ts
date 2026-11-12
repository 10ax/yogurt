type Result = 'trashed' | 'missing' | 'recording' | 'save-pending' | 'failed'

/** Keep failures out of Undo, and leave them selected so they can be retried. */
export async function trashMeetings(ids: string[], trash: (id: string) => Promise<Result>) {
  const trashed: string[] = [], done: string[] = []
  let error: Exclude<Result, 'trashed' | 'missing'> | undefined
  for (const id of new Set(ids)) {
    const result = await trash(id).catch(() => 'failed' as const)
    if (result === 'trashed') trashed.push(id)
    if (result === 'trashed' || result === 'missing') done.push(id)
    else error ??= result
  }
  return { trashed, done, error }
}

export async function restoreMeetings(ids: string[], restore: (id: string) => Promise<void>) {
  const failed: string[] = []
  for (const id of ids) {
    try { await restore(id) } catch { failed.push(id) }
  }
  return failed
}
