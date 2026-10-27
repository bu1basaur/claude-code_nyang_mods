export type ChangedFile = {
  path: string
  edits: number
  added: number
  removed: number
  // The request (prompt number) that last touched the file.
  turn: number
  isNew: boolean
  // The last change's diff lines, each starting with '+', '-' or ' '.
  patch: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'changed-files': { files: ChangedFile[]; turn: number; selected: string | null }
  }
}
