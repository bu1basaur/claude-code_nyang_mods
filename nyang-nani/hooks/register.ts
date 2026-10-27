import type { Register } from 'claude-code'

// How often a care reminder comes up, and how long without a prompt counts as away
// (no point nagging an empty chair).
const CARE_EVERY_MS = 40 * 60 * 1000
const AWAY_AFTER_MS = 30 * 60 * 1000

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T

const seconds = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`
}

const DONE = [
  (t: string) => `(=•ᴗ•=) 다 했다냥! ${t} 걸렸다냥 ✨`,
  (t: string) => `(ฅ'ω'ฅ) 완료했다냥~ (${t})`,
  (t: string) => `ฅ^•ﻌ•^ฅ 끝났다옹! 확인해 달라냥 (${t})`,
  (t: string) => `(=^･ω･^=) 짠! ${t} 만에 해냈다냥 🎉`,
  (t: string) => `🐟 일 끝! 생선 하나 주라냥 (${t})`,
]

// Turns past two minutes get a little extra praise.
const LONG_DONE = [
  (t: string) => `(=ↀωↀ=)✧ 긴 작업 끝났다냥! ${t}나 기다려줘서 고맙다옹`,
  (t: string) => `ฅ(=ˇωˇ=)ฅ 휴~ ${t} 걸린 대작업 완료다냥!`,
  (t: string) => `(ﾉ=^ω^=)ﾉ*:･ﾟ✧ 드디어 끝났다냥! (${t})`,
]

const CARE = [
  '💧 물 마실 시간이다냥 (=^･ｪ･^=)',
  '🥛 목마르지 않냥? 할짝할짝 마시고 오라냥~',
  '🙆 고양이처럼 쭈욱~ 기지개 켜라냥!',
  '🐈 어깨 으쓱, 목 빙글빙글~ 따라 해보라냥',
  '👀 창밖 새 구경하듯 먼 곳 20초 보라냥',
  '🪑 허리 펴라냥! 꼬리까지 쫙 (•̀ω•́)و',
  '🚶 잠깐 일어나서 한 바퀴 산책하자냥',
  '☕ 따뜻한 차 한 잔 하고 오라냥, 밖은 춥다옹 ❄️',
]

export const register: Register = on => {
  let lastActiveAt = 0
  let lastCare = ''

  on('session.start', async ($, e, next) => {
    lastActiveAt = await $.clock.now()
    $.clock.every(CARE_EVERY_MS, async () => {
      if ((await $.clock.now()) - lastActiveAt > AWAY_AFTER_MS) {
        return
      }
      const choices = CARE.filter(c => c !== lastCare)
      lastCare = pick(choices)
      $.ui.toast(lastCare, { timeoutMs: 8000 })
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    lastActiveAt = await $.clock.now()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // The main loop only: a subagent's run finishing is not the person's turn.
    if (e.agentId === undefined) {
      lastActiveAt = await $.clock.now()
      const t = seconds(e.durationMs)
      if (e.isAborted) {
        $.ui.toast('(=･ｪ･=)? 멈췄다냥. 다시 할 땐 불러달라냥!')
      } else if (e.reason === 'answer') {
        $.ui.toast(pick(e.durationMs > 120_000 ? LONG_DONE : DONE)(t))
      } else {
        $.ui.toast('(=ಥωಥ=) 앗, 문제가 생겨서 멈췄다냥…')
      }
    }
    return next(e)
  })
}
