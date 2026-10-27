import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'changed-files',
  component: 'Pane',
  requestId: 'changed-files',
  props: {
    title: '수정한 파일',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('an edit shows under this request with its line counts', async ($, on) => {
  on('command.register', () => ({ value: { command: 'changes' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', () => ({
    result: { filePath: 'C:/work/app.ts', structuredPatch: [{ lines: [' a', '-b', '+c', '+d'] }] },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: '고쳐줘' })
  await $.tool.call({ tool: 'Edit', file_path: 'C:/work/app.ts', old_string: 'b', new_string: 'c\nd' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /이번 요청/ }))?.text).toBe('이번 요청')
    expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /^\+2/ }))?.text).toBe('+2 ')
    expect((await ui.find({ type: 'Text', text: /^-1/ }))?.text).toBe('-1')
    await ui.unmount()
  }
})
