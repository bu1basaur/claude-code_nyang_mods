import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangedFile } from '../types'

const PANE = 'changed-files'
const TITLE = '수정한 파일'

const files = atom({ plugin: 'changed-files', key: 'files' } as const, [])
const turn = atom({ plugin: 'changed-files', key: 'turn' } as const, 0)
const selected = atom({ plugin: 'changed-files', key: 'selected' } as const, null)

type Hunk = { lines: string[] }

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
const dirName = (path: string) => path.slice(0, path.length - baseName(path).length - 1)

// Notes one finished Edit/Write/NotebookEdit call in the list, newest first.
async function record($: EngineInterface, e: { tool: string }, ran: unknown) {
  if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit') {
    return
  }
  const done = ran as { result?: unknown; isError?: boolean }
  if (!('result' in done) || done.isError) {
    return
  }

  const input = e as unknown as { file_path?: string; notebook_path?: string }
  const path = input.file_path ?? input.notebook_path
  if (!path) {
    return
  }
  const result = done.result as { type?: string; structuredPatch?: Hunk[] } | undefined
  const patch = (result?.structuredPatch ?? []).flatMap(h => h.lines)
  const added = patch.filter(l => l.startsWith('+')).length
  const removed = patch.filter(l => l.startsWith('-')).length
  const now = await read($, turn)

  await update($, files, list => {
    const old = list.find(f => f.path === path)
    const file: ChangedFile = {
      path,
      edits: (old?.edits ?? 0) + 1,
      added: (old?.added ?? 0) + added,
      removed: (old?.removed ?? 0) + removed,
      turn: now,
      isNew: old?.isNew ?? result?.type === 'create',
      patch: patch.slice(0, 300),
    }
    return [file, ...list.filter(f => f.path !== path)].slice(0, 100)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes',
      description: 'Open or close the pane of files Claude changed',
    })
    void $.ui.open({ id: PANE, title: TITLE, rows: 7 })

    return next(e)
  })

  on('command.run', { command: 'changes' }, async $ => {
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      return { text: '수정한 파일 창을 닫았어요. /changes로 다시 열어요.' }
    }
    // Leave the band above the prompt some room when the pane sits inline.
    await $.ui.open({ id: PANE, title: TITLE, rows: 7 })

    return { text: '수정한 파일 창을 열었어요.' }
  })

  // Bookkeeping only: a failure here must never block the prompt.
  on('prompt.submit', async ($, e, next) => {
    await update($, turn, n => n + 1).catch(() => undefined)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    try {
      await record($, e, ran)
    } catch {
      // Bookkeeping only: the tool already ran, so its result goes back untouched.
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, files)
    const now = await read($, turn)
    const picked = await read($, selected)
    const open = list.find(f => f.path === picked)

    if (open) {
      return (
        <Box flexDirection="column">
          <Button key="back" onPress={() => update($, selected, () => null)}>
            ← 목록
          </Button>
          <Text bold>{baseName(open.path)}</Text>
          <Text dimColor wrap="truncate-start">{dirName(open.path)}</Text>
          <Text dimColor>마지막 변경</Text>
          {open.patch.length === 0 && <Text dimColor>표시할 변경 내용이 없어요.</Text>}
          {open.patch.map((line, i) => (
            <Text
              key={`line-${i}`}
              color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : undefined}
              dimColor={!line.startsWith('+') && !line.startsWith('-')}
              wrap="truncate-end"
            >
              {line}
            </Text>
          ))}
        </Box>
      )
    }

    const fresh = list.filter(f => f.turn === now)
    const older = list.filter(f => f.turn !== now)

    const row = (f: ChangedFile, isFresh: boolean) => (
      <Button key={f.path} plain onPress={() => update($, selected, () => f.path)}>
        <Text color={isFresh ? 'green' : undefined} dimColor={!isFresh}>
          {f.isNew ? '+ ' : '● '}
        </Text>
        <Text bold={isFresh} dimColor={!isFresh}>{baseName(f.path)} </Text>
        <Text color="green" dimColor={!isFresh}>+{f.added} </Text>
        <Text color="red" dimColor={!isFresh}>-{f.removed}</Text>
      </Button>
    )

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>아직 수정한 파일이 없어요.</Text>}
        {fresh.length > 0 && <Text bold>이번 요청</Text>}
        {fresh.map(f => row(f, true))}
        {older.length > 0 && <Text dimColor>이전 요청</Text>}
        {older.map(f => row(f, false))}
        {list.length > 0 && <Text dimColor>파일을 누르면 변경 내용이 보여요.</Text>}
      </Box>
    )
  })
}
