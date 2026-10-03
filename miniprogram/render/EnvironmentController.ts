import { lerpColor, makeRgb, type RGB } from '../utils/color';
import { clamp, smoothstep, TAU, wrap01 } from '../utils/math';
import type { SeasonState } from './SeasonController';

export const WEATHER_MODES = ['auto', 'clear', 'rain', 'snow'] as const;
export type WeatherMode = typeof WEATHER_MODES[number];
export const WEATHER_LABELS: readonly string[] = ['随季节', '晴天', '雨', '雪'];
export interface EnvironmentState {
  time: number;
  daylight: number;
  sunAngle: number;
  lightIntensity: number;
  ambientIntensity: number;
  rainRate: number;
  snowRate: number;
  snowCover: number;
  windStrength: number;
  skyTop: RGB;
  skyBottom: RGB;
  groundColor: RGB;
}
const NIGHT_TOP: RGB = [12, 21, 45];
const NIGHT_BOTTOM: RGB = [34, 45, 66];
const DUSK: RGB = [222, 141, 111];

export class EnvironmentController {
  weather: WeatherMode = 'auto';
  intensity = 0.65;
  light = 1;
  readonly state: EnvironmentState = {
    time: 0.5, daylight: 1, sunAngle: Math.PI / 2, lightIntensity: 0.65, ambientIntensity: 0.65,
    rainRate: 0, snowRate: 0, snowCover: 0, windStrength: 0.5,
    skyTop: makeRgb(), skyBottom: makeRgb(), groundColor: makeRgb(),
  };
  private initialized = false;

  resetSnow(): void { this.initialized = false; }

  setWeather(mode: string): boolean {
    const weather = WEATHER_MODES.find(value => value === mode);
    if (weather === undefined) return false;
    this.weather = weather;
    return true;
  }

  setIntensity(value: number): void { if (Number.isFinite(value)) this.intensity = clamp(value, 0, 1); }
  setLight(value: number): void { if (Number.isFinite(value)) this.light = clamp(value, 0, 1.5); }

  update(time: number, season: SeasonState, delta: number): EnvironmentState {
    const s = this.state;
    if (Number.isFinite(time)) s.time = wrap01(time);
    s.sunAngle = (s.time - 0.25) * TAU;
    const sunHeight = Math.sin(s.sunAngle);
    s.daylight = smoothstep((sunHeight + 0.15) / 0.5);
    s.rainRate = this.weather === 'rain' ? this.intensity * 100 : 0;
    s.snowRate = this.weather === 'snow' ? this.intensity * 45 : this.weather === 'auto' ? season.snowRate * this.intensity : 0;
    const targetCover = this.weather === 'snow' ? this.intensity * 0.95 : this.weather === 'auto' ? season.snowAmount : 0;
    s.snowCover = this.initialized ? s.snowCover + (targetCover - s.snowCover) * (1 - Math.exp(-Math.max(0, delta) * 1.6)) : targetCover;
    this.initialized = true;
    const cloud = this.weather === 'rain' ? this.intensity * 0.55 : this.weather === 'snow' ? this.intensity * 0.3 : 0;
    s.lightIntensity = this.light * (0.65 * s.daylight + 0.25 * (1 - s.daylight)) * (1 - cloud);
    s.ambientIntensity = this.light * (0.30 + 0.35 * s.daylight) * (1 - cloud * 0.35);
    s.windStrength = season.windStrength + (this.weather === 'rain' ? this.intensity * 0.35 : 0);
    lerpColor(s.skyTop, NIGHT_TOP, season.skyTop, s.daylight);
    lerpColor(s.skyBottom, NIGHT_BOTTOM, season.skyBottom, s.daylight);
    const twilight = Math.max(0, 1 - Math.abs(sunHeight) / 0.35) * 0.6 * (1 - cloud);
    lerpColor(s.skyBottom, s.skyBottom, DUSK, twilight);
    for (let channel = 0; channel < 3; channel++) {
      s.skyTop[channel] *= 1 - cloud * 0.35;
      s.skyBottom[channel] *= 1 - cloud * 0.3;
      s.groundColor[channel] = season.groundColor[channel] * (0.24 + 0.76 * s.daylight) * (1 - cloud * 0.25);
    }
    return s;
  }
}
