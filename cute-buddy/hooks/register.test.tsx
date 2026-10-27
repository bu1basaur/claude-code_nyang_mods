import { expect, test } from 'claude-code/testing'

const band = (maxRows: number, bodyColumns: number) =>
  ({
    plugin: 'cute-buddy',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows,
      bodyColumns,
      scroll: { offset: 0, bodyRows: maxRows },
      view: {},
    },
  }) as const

// A wttr.in report: light snow, -2°, half past ten at night.
const SNOWY_NIGHT = '*|-2°C|22:30:00+0900|07:20:11|17:15:42\n'

type On = Parameters<Parameters<typeof test>[1]>[1]

// The engine beneath the mod: an in-memory store seeded with `seed`, and a wttr.in that
// answers `report` and counts how often it was asked.
const engine = (on: On, seed: Record<string, unknown>, report: string) => {
  on('command.register', () => ({ value: { command: 'buddy' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => ({ value: undefined }))
  const store = new Map<string, unknown>(Object.entries(seed))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  const fetches = { count: 0 }
  on('http.fetch', () => {
    fetches.count += 1
    return { value: { status: 200, ok: true, headers: {}, text: report } }
  })
  return { store, fetches }
}

const settle = async (done: () => boolean) => {
  for (let i = 0; i < 50 && !done(); i += 1) await new Promise(r => setTimeout(r, 10))
}

test('the sky comes from wttr.in once fetching is on, and /buddy weather can force it', async ($, on) => {
  const { store } = engine(on, { weatherFetch: true }, SNOWY_NIGHT)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // The weather loads in the background; let it land.
  await settle(() => store.has('weather'))
  expect((store.get('weather') as { weather: unknown }).weather).toEqual({ kind: 'snow', isNight: true, temp: '-2°' })

  // Snowflakes over the buddies and the badge in the corner.
  let ui = await $.ui.mount({ ...band(20, 120), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '⛄ -2°' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^[*·]$/ })).toBeTruthy()
  await ui.unmount()

  for (const [kind, icon] of [['clear', '🌞'], ['cloudy', '⛅'], ['rain', '☔'], ['night', '🌙']] as const) {
    await $.command.run({ command: 'buddy', args: `weather ${kind}` })
    ui = await $.ui.mount({ ...band(20, 120), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: `${icon} -2°` })).toBeTruthy()
    await ui.unmount()
  }
})

test('with fetching off nothing goes out, and a sky set by hand stays', async ($, on) => {
  const { store, fetches } = engine(on, {}, SNOWY_NIGHT)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await settle(() => false)
  expect(fetches.count).toBe(0)

  let ui = await $.ui.mount({ ...band(20, 120), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /⛄|🌞/ })).toBeFalsy()
  await ui.unmount()

  await $.command.run({ command: 'buddy', args: 'weather rain' })
  expect(store.get('weatherManual')).toEqual({ kind: 'rain', isNight: false, temp: '' })
  ui = await $.ui.mount({ ...band(20, 120), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '☔' })).toBeTruthy()
  await ui.unmount()

  // On, then off again: one fetch while on, none after.
  await $.command.run({ command: 'buddy', args: 'weather on' })
  await settle(() => fetches.count > 0)
  expect(fetches.count).toBe(1)
  await $.command.run({ command: 'buddy', args: 'weather off' })
  expect(store.get('weatherFetch')).toBe(false)
})

test('the buddies draw at every height and width', async ($, on) => {
  engine(on, {}, '')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const [rows, columns] of [[20, 120], [4, 60], [3, 40], [1, 20]] as const) {
      const ui = await $.ui.mount({ ...band(rows, columns), surface })
      expect(await ui.find({ type: 'Text', text: /ㅅ/ })).toBeTruthy()
      // The black cat strolls in front of them whenever the full four-row layout fits.
      expect(Boolean(await ui.find({ type: 'Text', text: /\(=$/ }))).toBe(rows >= 4)
      await ui.unmount()
    }
  }
})
