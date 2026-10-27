import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Weather, WeatherKind } from '../types'

const tick = atom({ plugin: 'cute-buddy', key: 'tick' } as const, 0)
const isHidden = atom({ plugin: 'cute-buddy', key: 'isHidden' } as const, false)
// The sky outside, and what /buddy weather forces in its place for this session.
const weather = atom({ plugin: 'cute-buddy', key: 'weather' } as const, null as Weather | null)
const weatherOverride = atom({ plugin: 'cute-buddy', key: 'weatherOverride' } as const, null as Weather | null)

const PINK = '#f4a7b9'
const GREEN = '#6fbf5a'
const DARK_GREEN = '#4a9a3e'
const FLOWERS = [PINK, '#f2d16b', '#ffffff']
const SNOW = '#f0f4f8'

// The meadow's colors under each sky: bright in the sun, dull under clouds, wet in the
// rain, pale in the snow and dark at night.
type Palette = { green: string; dark: string; flowers: string[] }

const DULL_FLOWERS = ['#b08a93', '#b3a165', '#bdbdbd']

const palette = (sky: Weather | null): Palette => {
  if (!sky) return { green: GREEN, dark: DARK_GREEN, flowers: FLOWERS }
  if (sky.isNight) return { green: '#3f7a3a', dark: '#2f5f2c', flowers: DULL_FLOWERS }
  if (sky.kind === 'clear') return { green: '#86d66b', dark: '#5fb34f', flowers: FLOWERS }
  if (sky.kind === 'cloudy') return { green: '#5f8f55', dark: '#4a7444', flowers: DULL_FLOWERS }
  if (sky.kind === 'rain') return { green: '#4f9a6a', dark: '#3d7f57', flowers: DULL_FLOWERS }
  return { green: '#7fa77a', dark: '#5e8a5a', flowers: DULL_FLOWERS }
}

// One meadow cell: a blade (which sways with the tick) or now and then a flower.
type Cell = { char: string; color: string }

const meadow = (columns: number, n: number, sky: Weather | null): Cell[] => {
  const p = palette(sky)
  return Array.from({ length: columns }, (_, x) => {
    const seed = (x * 7919 + 104729) % 97
    if (seed < 4) {
      return { char: '*', color: p.flowers[seed % p.flowers.length] ?? p.green }
    }
    if (seed < 40) {
      return { char: (x + n) % 6 < 3 ? '/' : '\\', color: p.green }
    }
    // Snow settles in the low tufts between the blades.
    if (sky?.kind === 'snow' && seed % 2 === 0) {
      return { char: '.', color: SNOW }
    }
    return { char: seed % 3 === 0 ? 'w' : seed % 3 === 1 ? 'v' : ',', color: seed % 2 ? p.green : p.dark }
  })
}

// The weather, from wttr.in (no key: it finds the place by the request's IP), kept in the
// store so a new session draws the sky at once and asks again only once it is this old.
// One line: the sky as a plain symbol, temperature, the place's local time, sunrise, sunset,
// as in `o|+17°C|14:03:39+0900|06:38:58|17:33:51`.
const WEATHER_URL = 'https://wttr.in/?format=%25x|%25t|%25T|%25S|%25s'
const REFRESH = 20 * 60 * 1000

// wttr.in's plain symbols: `o` sun, `m` a few clouds, `mm`/`mmm` overcast, `=` fog,
// `/` `.` `!` `x` in rain, showers, thunder and sleet, `*` in snow, `?` unknown.
const kindOf = (symbol: string): WeatherKind | null => {
  if (symbol.includes('*')) return 'snow'
  if (/[/.!x]/.test(symbol)) return 'rain'
  if (symbol === 'mm' || symbol === 'mmm' || symbol === '=') return 'cloudy'
  if (symbol === 'o' || symbol === 'm') return 'clear'
  return null
}

// "14:03:39" as minutes after midnight.
const minutes = (clock: string | undefined): number | null => {
  const m = /^(\d+):(\d+)/.exec(clock ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const fetchWeather = async ($: EngineInterface): Promise<Weather | null> => {
  try {
    const res = await $.http.fetch(WEATHER_URL, { headers: { 'User-Agent': 'cute-buddy (Claude Code mod)' } })
    if (!res.ok) return null
    const [symbol = '', temp = '', time, sunrise, sunset] = res.text.trim().split('|')
    const kind = kindOf(symbol)
    if (!kind) return null
    const at = minutes(time)
    const rise = minutes(sunrise)
    const set = minutes(sunset)
    const isNight = at !== null && rise !== null && set !== null && (at < rise || at >= set)
    // "+17°C" reads "17°", "-2°C" keeps its minus.
    const degrees = /-?\d+/.exec(temp)?.[0]
    return { kind, isNight, temp: degrees ? `${degrees}°` : '' }
  } catch {
    return null
  }
}

// The load under way, so two asking at once (a start and a reload) share one request.
let loading: Promise<void> | null = null

const loadWeather = ($: EngineInterface): Promise<void> => {
  loading ??= askWeather($).finally(() => {
    loading = null
  })
  return loading
}

const askWeather = async ($: EngineInterface) => {
  try {
    const now = await $.clock.now()
    const cached = (await $.store.get('weather')) as { at: number; weather: Weather } | undefined
    if (cached?.weather && now - cached.at < REFRESH) {
      await update($, weather, () => cached.weather)
      return
    }
    const fresh = await fetchWeather($)
    if (fresh) {
      await $.store.set('weather', { at: now, weather: fresh })
    }
    // Offline, the last sky we saw beats none.
    const shown = fresh ?? cached?.weather
    if (shown) await update($, weather, () => shown)
  } catch {
    // No sky this time: the buddies carry on as they were.
  }
}

// Stops the weather refresh while fetching is on, for /buddy weather off.
let stopRefresh: (() => void) | null = null

const stopFetching = () => {
  // A function in the engine; a test's stand-in for clock.every may answer something else.
  if (typeof stopRefresh === 'function') stopRefresh()
  stopRefresh = null
}

// Asking wttr.in is off until /buddy weather on: the store is this computer's own, so
// a work machine can keep it off and a home one on.
const startFetching = ($: EngineInterface) => {
  stopFetching()
  // Not awaited: the buddies come out at once and the sky fills in when it answers.
  void loadWeather($)
  stopRefresh = $.clock.every(REFRESH, () => {
    void loadWeather($)
  })
}

// What falls, drifts or twinkles behind the buddies at beat n, over the three rows
// above the grass: one cell each, at fixed lanes so it reads as weather, not noise.
type Speck = { x: number; y: number; char: string; color: string }

// A well-mixed hash, so neighbouring lanes get unrelated phases (a plain `x * k % p`
// keeps them in step and the drops fall in rows).
const hash = (x: number) => {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

// Each lane falls on its own loop: a phase and a pause above the band of its own, so the
// lanes never line up.
const lane = (x: number, n: number, minPeriod: number, spread: number) =>
  (n + (hash(x + 1000) % 97)) % (minPeriod + (hash(x + 2000) % spread))

const sky = (w: Weather, n: number, columns: number): Speck[] => {
  const specks: Speck[] = []
  if (w.kind === 'rain') {
    for (let x = 0; x < columns; x += 1) {
      if (hash(x) % 4 !== 0) continue
      const y = lane(x, n, 5, 6)
      if (y < 3) specks.push({ x, y, char: y === 2 ? ',' : '|', color: '#8ab4f8' })
    }
  } else if (w.kind === 'snow') {
    for (let x = 0; x < columns; x += 1) {
      if (hash(x) % 5 > 1) continue
      // Half the speed of rain, and swaying a column either way as it falls.
      const y = lane(x, Math.floor(n / 2), 4, 3)
      const dx = [0, 1, 0, -1][(Math.floor(n / 2) + x) % 4] ?? 0
      if (y < 3 && x + dx >= 0 && x + dx < columns) {
        specks.push({ x: x + dx, y, char: hash(x) % 4 === 0 ? '*' : '·', color: hash(x) % 3 ? '#ffffff' : '#dfe9f5' })
      }
    }
  } else if (w.kind === 'cloudy') {
    // Three puffs drifting right, one column every four beats, wrapping round.
    const CLOUD = '.-~~~-.'
    const span = columns + CLOUD.length
    for (const at of [0.1, 0.45, 0.75]) {
      const x = ((Math.round(at * span) + Math.floor(n / 4)) % span) - CLOUD.length
      if (x >= 0 && x + CLOUD.length <= columns) {
        specks.push({ x, y: 0, char: CLOUD, color: w.isNight ? '#6b7078' : '#9aa0a6' })
      }
    }
  } else if (w.isNight) {
    // Stars that twinkle on their own beat.
    for (let k = 0; k < Math.floor(columns / 12); k += 1) {
      const x = hash(k + 3) % columns
      specks.push({ x, y: 0, char: (n + k) % 6 === 0 ? '✦' : '·', color: '#d8d8a0' })
    }
  } else {
    // Sun glints that flash now and then.
    for (let k = 0; k < Math.floor(columns / 20); k += 1) {
      if ((n + k * 3) % 8 >= 2) continue
      specks.push({ x: hash(k + 7) % columns, y: k % 2, char: '✧', color: '#f2d16b' })
    }
  }
  return specks
}

// The corner badge: the sky as an emoji (all two columns wide) and the temperature.
const badge = (w: Weather): string => {
  const icon = w.kind === 'rain' ? '☔' : w.kind === 'snow' ? '⛄' : w.kind === 'cloudy' ? '⛅' : w.isNight ? '🌙' : '🌞'
  return w.temp ? `${icon} ${w.temp}` : icon
}
// Its width in columns: the emoji is two, the rest one each.
const badgeWidth = (w: Weather) => [...badge(w)].length + 1

// Runs of one color become one Text, so the row stays a handful of elements.
const runs = (cells: Cell[]) =>
  cells.reduce<Cell[]>((out, c) => {
    const last = out[out.length - 1]
    if (last && last.color === c.color) {
      last.char += c.char
    } else {
      out.push({ ...c })
    }
    return out
  }, [])

// The black cat strolling in front of the buddies, on the grass: dark grey body (pure black
// vanishes on a dark terminal) with yellow eyes.
const CAT = '#4a4a5c'
const CAT_EYE = '#f2d16b'
// Columns the cat takes at its widest (a nap with its zZz), so it never runs into Usagi.
const CAT_WIDTH = 12

type Seg = { text: string; color: string }

const catBody = (eyes: string, before = '', after = ''): Seg[] => [
  { text: `${before}(=`, color: CAT },
  { text: eyes, color: CAT_EYE },
  { text: `=)${after}`, color: CAT },
]

// The cat's day, played on a loop: walks to a spot (a share of its range, so it fits any
// width), then does something there for a while.
type Step =
  | { kind: 'walk'; to: number }
  | { kind: 'sit' | 'roll' | 'sleep'; ticks: number }
  | { kind: 'think'; ticks: number; food: string }

const DAY: Step[] = [
  { kind: 'walk', to: 0.5 },
  { kind: 'sit', ticks: 6 },
  { kind: 'roll', ticks: 8 },
  { kind: 'walk', to: 0.15 },
  { kind: 'think', ticks: 10, food: '🐟' },
  { kind: 'walk', to: 1 },
  { kind: 'sleep', ticks: 20 },
  { kind: 'walk', to: 0.7 },
  { kind: 'think', ticks: 8, food: '🍗' },
  { kind: 'roll', ticks: 6 },
  { kind: 'walk', to: 0 },
  { kind: 'sit', ticks: 5 },
  { kind: 'think', ticks: 8, food: '🥛' },
  { kind: 'sleep', ticks: 14 },
]

// The cat at beat n, as its column and three rows (a thought bubble, ears, face), moving
// one column a beat between 0 and `range`.
const catFrame = (n: number, range: number): { x: number; lines: Seg[][] } => {
  const spot = (to: number) => Math.round(to * range)
  const lengths = DAY.map((s, i) => {
    if (s.kind !== 'walk') return s.ticks
    const from = i === 0 ? spot(0) : spot(lastWalk(i))
    return Math.max(1, Math.abs(spot(s.to) - from))
  })
  let t = n % lengths.reduce((a, b) => a + b, 0)
  let i = 0
  while (t >= lengths[i]) {
    t -= lengths[i]
    i += 1
  }

  const step = DAY[i]
  const here = spot(lastWalk(i + 1))
  const blink = n % 7 === 0 ? '-.-' : '•.•'
  const none: Seg[] = []

  if (step.kind === 'walk') {
    const from = spot(lastWalk(i))
    const isRight = spot(step.to) >= from
    const x = from + (isRight ? t : -t)
    const tail = n % 2 === 0 ? '~' : '-'
    return {
      x,
      lines: isRight
        ? [none, [{ text: '  /\\_/\\', color: CAT }], catBody(blink, tail)]
        : [none, [{ text: ' /\\_/\\', color: CAT }], catBody(blink, '', tail)],
    }
  }
  if (step.kind === 'roll') {
    // Upright and belly-up by turns.
    return {
      x: here,
      lines: t % 2 === 0
        ? [none, catBody('ᵕ.ᵕ', ' '), [{ text: '  \\/ \\/', color: CAT }]]
        : [none, [{ text: '  /\\_/\\', color: CAT }], catBody('>.<', ' ')],
    }
  }
  if (step.kind === 'sleep') {
    const zs = ['z', 'zZ', 'zZz'][Math.floor(t / 2) % 3]
    return { x: here, lines: [none, none, catBody('-.-', ' ', ` ${zs}`)] }
  }
  if (step.kind === 'think') {
    // A bubble rises over its head, and the cat dreams of the food in it.
    const bubble = t < 2 ? '    o' : t < 4 ? '    o O' : `    o O ${step.food}`
    return {
      x: here,
      lines: [[{ text: bubble, color: CAT_EYE }], [{ text: '  /\\_/\\', color: CAT }], catBody(t % 4 < 2 ? 'ᵔ.ᵔ' : '˘.˘', ' ')],
    }
  }
  return { x: here, lines: [none, [{ text: '  /\\_/\\', color: CAT }], catBody(blink, ' ')] }
}

// Where the cat stands before step i: the target of the last walk before it, 0 at the start.
// The loop starts and ends at 0, so it carries on without a jump.
function lastWalk(i: number): number {
  for (let j = i - 1; j >= 0; j -= 1) {
    const s = DAY.at(j)
    if (s && s.kind === 'walk') return s.to
  }
  return 0
}

// What a buddy shows on one beat: its face, its hands row (in colored pieces, so
// Hachiware's ukulele can be wood-brown) and what floats beside its ears.
// `table`, when set, is what stands on a little table beside the buddy.
type Pose = { face: string; hands: Seg[]; above: string; table?: string }

type Buddy = {
  // Each buddy runs its loop a few beats apart so they don't move in lockstep.
  phase: number
  color?: string
  ears: string
  earColor?: string
  // Drawn right after the face, in the ear color.
  tail?: string
  // Columns its box takes; the pair stands closer than the others.
  width: number
  // Whether it sways side to side (Chiikawa keeps still while it listens).
  sways: (t: number) => boolean
  pose: (t: number, isWorking: boolean) => Pose
  // The column of its box where its table stands, for a buddy that has one.
  tableAt?: number
}

const UKULELE_BODY = '#d9a066';
const UKULELE_NECK = '#8b5a2b';
// Kurimanju's evening, in beats: sits content, picks the beer up off the table,
// drinks, says ahh, puts it down, then nibbles the squid.
const KURI = 22
const TABLE = '#a0703c'

// Usagi's loop in beats (it rolls its arms for the last 8), and the arm roll itself:
// two fists circling each other, one frame a beat.
const USAGI = 18
const ARM_ROLL = ['  ⊃⊂', '  ∪∩', '  ⊂⊃', '  ∩∪']

// One song is this many beats: Chiikawa listens, gets happy, then claps at the end.
const SONG = 24

// The poses of a buddy that only fidgets: hands busy while Claude works, idle otherwise.
const fidget = (faces: string[], hands: string[], above: string[]) =>
  (t: number, isWorking: boolean): Pose => ({
    face: faces[t % faces.length] ?? '',
    hands: [{ text: (isWorking ? hands[t % hands.length] : hands[0]) ?? '', color: '' }],
    above: (above[t % above.length] ?? '').trim(),
  })

const BUDDIES: Buddy[] = [
  {
    // Chiikawa: watches Hachiware's song, smiles toward the end, then claps.
    phase: 0,
    ears: ' ∩___∩',
    width: 11,
    sways: t => t % SONG >= 14,
    pose: t => {
      const s = t % SONG
      if (s < 14) {
        return { face: s === 5 || s === 11 ? '-ㅅ-' : '•ㅅ•', hands: [{ text: ' っ っ', color: '' }], above: '' }
      }
      if (s < 18) {
        return { face: '^ㅅ^', hands: [{ text: ' っ っ', color: '' }], above: s % 2 ? '♡' : '' }
      }
      const isClapping = s % 2 === 0
      return {
        face: isClapping ? '>ㅅ<' : '^ㅅ^',
        hands: [{ text: isClapping ? '  っっ' : ' っ っ', color: '' }],
        above: isClapping ? '👏' : '',
      }
    },
  },
  {
    // Hachiware: strums the ukulele and sings, a little faster while Claude works.
    phase: 0,
    ears: String.raw` /\_/\ `,
    earColor: '#5b7fa8',
    width: 15,
    sways: () => true,
    pose: (t, isWorking) => {
      const beat = isWorking ? t : Math.floor(t / 2)
      const s = t % SONG
      const notes = ['♪', ' ♫', '♪ ♫', ' ♪', '♫', '♪ ♪']
      return {
        face: s >= 18 ? '^ω^' : ['•o•', '•ω•', '^o^', '•ω•', '-o-', '•ω•'][beat % 6] ?? '',
        hands: [
          { text: beat % 2 === 0 ? ' っ' : ' ﾉ', color: '' },
          { text: beat % 2 === 0 ? '(◉)' : '(◎)', color: UKULELE_BODY },
          { text: '━━╼', color: UKULELE_NECK },
        ],
        above: s >= 18 ? '✨' : notes[beat % notes.length] ?? '',
      }
    },
  },
  {
    // Usagi: snacks now and then, and rolls its arms (forearms folded in, circling
    // round each other) in bursts, nonstop while Claude works.
    phase: 6,
    color: '#e8c45a',
    ears: '  ‖ ‖',
    width: 13,
    sways: t => t % USAGI < 10,
    pose: (t, isWorking) => {
      const s = t % USAGI
      if (isWorking || s >= 10) {
        return {
          face: t % 4 < 2 ? '>ㅂ<' : '•ㅂ•',
          hands: [{ text: ARM_ROLL[t % ARM_ROLL.length] ?? '', color: '' }],
          above: t % 2 ? '💨' : '',
        }
      }
      return {
        face: ['•ㅂ•', '•ㅂ•', '•ㅂ•', '-ㅂ-', '•ㅂ•', '°ㅁ°', '°ㅁ°', '•ㅂ•', '•ㅂ•', '•ㅂ•'][s] ?? '•ㅂ•',
        hands: [{ text: ' っ っ', color: '' }],
        above: ['', '', '', '', '', '🍙', ' 🍙', '', '', ''][s] ?? '',
      }
    },
  },
  {
    // Momonga: big round ears, glossy eyes and a curled fluffy tail; glides while Claude works.
    phase: 9,
    ears: ' ◖◗  ◖◗',
    earColor: '#c9a47e',
    tail: '∂',
    width: 13,
    sways: () => true,
    pose: fidget(
      ['◕ᴗ◕', '◕ᴗ◕', '-ᴗ-', '◕ᴗ◕', '◕ᴗ◕', '✧ᴗ✧', '✧ε✧', '✧ε✧', '◕ᴗ◕', '◕ᴗ◕', 'ᵔᴗᵔ', '◕ᴗ◕'],
      [' っ っ', '⊂    ⊃', ' っ っ', '⊂    ⊃'],
      ['', '', '', '', '', '  🍓', '   🍓', '    🍓', '', '', '  🍩', '   🍩'],
    ),
  },
  {
    // Kurimanju: a chestnut bun who loves a drink, sitting at a little table.
    phase: 0,
    color: '#e6c79c',
    ears: '⊂ ￣￣⊃',
    earColor: '#8b5a2b',
    width: 18,
    tableAt: 10,
    sways: () => false,
    pose: t => {
      const s = t % KURI
      const sitting = { hands: [{ text: ' っ っ', color: '' }], table: '🍺🍜' }
      const holding = { hands: [{ text: ' っ🍺', color: '' }], table: '  🍜' }
      if (s < 8) return { ...sitting, face: s === 4 ? '-ᴗ-' : '˘ᴗ˘', above: '' }
      if (s < 10) return { ...holding, face: '•ᴗ•', above: '' }
      if (s < 13) return { ...holding, face: '´ε`', above: '' }
      if (s < 16) return { ...holding, face: '>ᴗ<', above: s === 13 ? '' : ' 캬' }
      if (s < 18) return { ...sitting, face: '˘ᴗ˘', above: '' }
      return { hands: [{ text: ' っ🍜', color: '' }], table: '🍺', face: 'ˆڡˆ', above: s % 2 ? ' 냠' : '' }
    },
  },
]

// The empty columns before each group (the pair, Usagi, Momonga, Kurimanju), as
// shares of what is left over: uneven on purpose, with the widest stretch between
// the pair and Usagi, where the cat walks. TRAIL is the share after the last.
const GAPS = [1, 5, 1, 1.5]
const TRAIL = 1

// Where each shown buddy's box starts, given the columns to fill.
const layout = (shown: Buddy[], columns: number): number[] => {
  const used = shown.reduce((sum, b) => sum + b.width, 0)
  const free = Math.max(0, columns - used)
  // One gap before each group (Chiikawa and Hachiware are one group) and one after.
  const groups = Math.max(1, shown.length - 1)
  const weights = GAPS.slice(0, groups).concat(TRAIL)
  const total = weights.reduce((a, b) => a + b, 0)
  const xs: number[] = []
  let x = 0
  shown.forEach((b, i) => {
    if (i !== 1) {
      x += Math.floor((free * (weights[Math.max(0, i - 1)] ?? 0)) / total)
    }
    xs.push(x)
    x += b.width
  })
  return xs
}

export const register: Register = on => {
  // The last time the band asked us to draw, for /buddy to report while we chase a hiding buddy.
  let drawn: { at: number; rows: number; columns: number } | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'buddy',
      description: 'Hide or show the buddies; /buddy weather clear|cloudy|rain|snow|night|auto|on|off for the sky',
    })
    $.clock.every(450, () => {
      update($, tick, n => n + 1)
    })
    // A sky set by hand stays across sessions, until /buddy weather auto.
    const manual = (await $.store.get('weatherManual')) as Weather | undefined
    if (manual) await update($, weatherOverride, () => manual)
    if ((await $.store.get('weatherFetch')) === true) {
      startFetching($)
    } else {
      await update($, weather, () => null)
    }

    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const [word, want] = e.args.trim().split(/\s+/)
    if (word === 'weather') {
      if (want === 'on') {
        await $.store.set('weatherFetch', true)
        startFetching($)
        return { text: '날씨 요청을 켰어요. wttr.in에서 20분마다 이 곳의 날씨를 받아와요.' }
      }
      if (want === 'off') {
        await $.store.set('weatherFetch', false)
        stopFetching()
        await update($, weather, () => null)
        return { text: '날씨 요청을 껐어요. 이제 밖으로 아무 요청도 보내지 않아요. (/buddy weather rain처럼 손으로 바꿀 수 있어요)' }
      }
      const real = await read($, weather)
      if (!want || want === 'auto') {
        await update($, weatherOverride, () => null)
        await $.store.set('weatherManual', null)
        if ((await $.store.get('weatherFetch')) !== true) {
          return { text: '기본 하늘로 돌아왔어요. 날씨 요청은 꺼져 있어요. (/buddy weather on으로 켜요)' }
        }
        return { text: real ? `실제 날씨로 돌아왔어요 ${badge(real)}` : '실제 날씨로 돌아왔어요. (아직 날씨를 못 받아왔어요)' }
      }
      const kinds: WeatherKind[] = ['clear', 'cloudy', 'rain', 'snow']
      const forced: Weather | null = want === 'night'
        ? { kind: 'clear', isNight: true, temp: real?.temp ?? '' }
        : kinds.includes(want as WeatherKind)
          ? { kind: want as WeatherKind, isNight: false, temp: real?.temp ?? '' }
          : null
      if (!forced) {
        return { text: '/buddy weather 다음에 clear, cloudy, rain, snow, night, auto, on, off 중 하나를 써 주세요.' }
      }
      await update($, weatherOverride, () => forced)
      await $.store.set('weatherManual', forced)
      return { text: `하늘을 바꿨어요 ${badge(forced)}  (/buddy weather auto로 되돌려요)` }
    }

    const wasHidden = await read($, isHidden)
    await update($, isHidden, () => !wasHidden)

    const now = await $.clock.now()
    const seen = drawn
      ? `마지막으로 그린 건 ${Math.round((now - drawn.at) / 1000)}초 전, ${drawn.rows}줄 × ${drawn.columns}칸 자리였어요.`
      : '아직 한 번도 화면에서 그려 달라는 요청을 못 받았어요.'

    return { text: wasHidden ? `친구들이 돌아왔어요 ✿ (${seen})` : '친구들이 잠깐 쉬러 갔어요. /buddy로 다시 불러요.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const n = await read($, tick)
    drawn = { at: await $.clock.now(), rows: e.props.maxRows, columns: e.props.bodyColumns }
    const { Box, Text } = $.ui.resolve(e)
    const isWorking = e.props.isWorking
    const columns = e.props.bodyColumns
    const rows = e.props.maxRows
    const w = (await read($, weatherOverride)) ?? (await read($, weather))
    // A small window fits fewer friends: one per 13 columns, Chiikawa first.
    const shown = BUDDIES.slice(0, Math.max(1, Math.min(BUDDIES.length, Math.floor(columns / 13))))
    const xs = layout(shown, columns)

    const face = (b: Buddy, f: string, pad: string) => (
      <Box>
        <Text color={b.color}>{pad}(</Text>
        <Text color={PINK}>｡</Text>
        <Text color={b.color}>{f}</Text>
        <Text color={PINK}>｡</Text>
        <Text color={b.color}>)</Text>
        {b.tail ? <Text color={b.earColor}>{b.tail}</Text> : null}
      </Box>
    )

    const grass = (
      <Box flexDirection="row">
        {runs(meadow(columns, Math.floor(n / 2), w)).map((r, i) => (
          <Text key={`grass-${i}`} color={r.color} wrap="truncate">{r.char}</Text>
        ))}
      </Box>
    )

    // Under four rows (a pane shares the space above the prompt): faces only,
    // with the grass underneath when there is a second row.
    if (rows < 4) {
      return (
        <Box flexDirection="column" width={columns}>
          <Box flexDirection="row" height={1} position="relative">
            {shown.map((b, i) => (
              <Box key={`mini-${i}`} position="absolute" left={xs[i] ?? 0}>
                {face(b, b.pose(n + b.phase, isWorking).face, '')}
              </Box>
            ))}
          </Box>
          {rows >= 2 && grass}
        </Box>
      )
    }

    // Four rows: ears (with what floats beside them), face, hands, grass. The black cat
    // strolls over the face and hands rows, its feet on the grass, between Hachiware's
    // right side and Usagi, so it never walks in front of the concert.
    const pairEnd = (xs[1] ?? 0) + (shown[1]?.width ?? 0)
    const usagiLeft = xs[2] ?? columns
    const cat = catFrame(n, Math.max(0, usagiLeft - pairEnd - CAT_WIDTH))

    // The badge sits in the top-right corner when it clears the last buddy's ears.
    const lastEars = (xs[shown.length - 1] ?? 0) + 12
    const hasBadge = w !== null && columns - badgeWidth(w) >= lastEars

    return (
      <Box flexDirection="column" width={columns} position="relative">
        <Box flexDirection="row" height={3} position="relative">
          {/* First, so the buddies stand in front of the weather. */}
          {w && sky(w, n, columns).map((s, i) => (
            <Box key={`sky-${i}`} position="absolute" left={s.x} top={s.y}>
              <Text color={s.color}>{s.char}</Text>
            </Box>
          ))}
          {shown.map((b, i) => {
            const t = n + b.phase
            // Sway left and right, a little faster while Claude is working.
            const step = isWorking ? t : Math.floor(t / 2)
            const pad = b.sways(t) ? ' '.repeat([0, 1, 2, 1][step % 4] ?? 0) : ' '
            const pose = b.pose(t, isWorking)

            const table = pose.table !== undefined && b.tableAt !== undefined ? (
              // Out of the buddy's box, so it stays put while the buddy moves.
              <Box key={`table-${i}`} position="absolute" left={(xs[i] ?? 0) + b.tableAt} top={1} flexDirection="column">
                <Text>{` ${pose.table}`}</Text>
                <Text color={TABLE}>┯━━━━┯</Text>
              </Box>
            ) : null

            return [
              <Box key={`buddy-${i}`} position="absolute" left={xs[i] ?? 0} flexDirection="column" width={b.width}>
                <Box>
                  <Text color={b.earColor ?? b.color}>{pad}{b.ears}</Text>
                  <Text color={PINK}>{pose.above ? ` ${pose.above}` : ''}</Text>
                </Box>
                {face(b, pose.face, pad)}
                <Box>
                  <Text color={b.color}>{pad}</Text>
                  {pose.hands.map((piece, j) => (
                    <Text key={`hand-${i}-${j}`} color={piece.color || b.color}>{piece.text}</Text>
                  ))}
                </Box>
              </Box>,
              table,
            ]
          })}
          {w && hasBadge && (
            <Box key="badge" position="absolute" left={columns - badgeWidth(w)} top={0}>
              <Text color={w.isNight ? '#d8d8a0' : '#f2d16b'}>{badge(w)}</Text>
            </Box>
          )}
        </Box>
        {grass}
        {/* Drawn last and out of the flow, so it paints over anything it walks past. */}
        {shown.length >= 3 && (
          <Box key="cat" position="absolute" top={0} left={pairEnd + cat.x} flexDirection="column">
            {cat.lines.map((line, i) => (
              <Box key={`cat-${i}`} flexDirection="row" height={1}>
                {line.map((s, j) => (
                  <Text key={`cat-${i}-${j}`} color={s.color}>{s.text}</Text>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
