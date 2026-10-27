// What the sky above the buddies is doing, from wttr.in (or forced with /buddy weather).
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow'
export type Weather = { kind: WeatherKind; isNight: boolean; temp: string }

declare module 'claude-code' {
  interface PluginState {
    'cute-buddy': {
      tick: number
      isHidden: boolean
      weather: Weather | null
      weatherOverride: Weather | null
    }
  }
}
