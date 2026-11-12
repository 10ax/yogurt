export type FolderMemberships = Readonly<Record<string, readonly string[]>>
export type FolderCheck = boolean | 'mixed'
export type PendingFolderChecks = Record<string, { checked: boolean; saving: boolean; source: FolderMemberships }>

export function folderCheck(ids: readonly string[], memberships: FolderMemberships, folder: string): FolderCheck {
  const count = ids.filter(id => memberships[id]?.includes(folder)).length
  return count === 0 ? false : count === ids.length ? true : 'mixed'
}

export const nextFolderCheck = (checked: FolderCheck) => checked !== true

/** Keep the optimistic check through stale or unrelated refreshes, until the saved membership arrives. */
export function reconcileFolderChecks(pending: PendingFolderChecks, ids: readonly string[], memberships: FolderMemberships): PendingFolderChecks {
  const waiting = Object.entries(pending).filter(([folder, change]) =>
    change.saving || change.source === memberships || folderCheck(ids, memberships, folder) !== change.checked)
  return waiting.length === Object.keys(pending).length ? pending : Object.fromEntries(waiting)
}
