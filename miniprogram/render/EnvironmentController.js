"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvironmentController = exports.WEATHER_LABELS = exports.WEATHER_MODES = void 0;
const color_1 = require("../utils/color");
const math_1 = require("../utils/math");
exports.WEATHER_MODES = ['auto', 'clear', 'rain', 'snow'];
exports.WEATHER_LABELS = ['随季节', '晴天', '雨', '雪'];
const NIGHT_TOP = [12, 21, 45];
const NIGHT_BOTTOM = [34, 45, 66];
const DUSK = [222, 141, 111];
class EnvironmentController {
    constructor() {
        this.weather = 'auto';
        this.intensity = 0.65;
        this.light = 1;
        this.state = {
            time: 0.5, daylight: 1, sunAngle: Math.PI / 2, lightIntensity: 0.65, ambientIntensity: 0.65,
            rainRate: 0, snowRate: 0, snowCover: 0, windStrength: 0.5,
            skyTop: (0, color_1.makeRgb)(), skyBottom: (0, color_1.makeRgb)(), groundColor: (0, color_1.makeRgb)(),
        };
        this.initialized = false;
    }
    resetSnow() { this.initialized = false; }
    setWeather(mode) {
        const weather = exports.WEATHER_MODES.find(value => value === mode);
        if (weather === undefined)
            return false;
        this.weather = weather;
        return true;
    }
    setIntensity(value) { if (Number.isFinite(value))
        this.intensity = (0, math_1.clamp)(value, 0, 1); }
    setLight(value) { if (Number.isFinite(value))
        this.light = (0, math_1.clamp)(value, 0, 1.5); }
    update(time, season, delta) {
        const s = this.state;
        if (Number.isFinite(time))
            s.time = (0, math_1.wrap01)(time);
        s.sunAngle = (s.time - 0.25) * math_1.TAU;
        const sunHeight = Math.sin(s.sunAngle);
        s.daylight = (0, math_1.smoothstep)((sunHeight + 0.15) / 0.5);
        s.rainRate = this.weather === 'rain' ? this.intensity * 100 : 0;
        s.snowRate = this.weather === 'snow' ? this.intensity * 45 : this.weather === 'auto' ? season.snowRate * this.intensity : 0;
        const targetCover = this.weather === 'snow' ? this.intensity * 0.95 : this.weather === 'auto' ? season.snowAmount : 0;
        s.snowCover = this.initialized ? s.snowCover + (targetCover - s.snowCover) * (1 - Math.exp(-Math.max(0, delta) * 1.6)) : targetCover;
        this.initialized = true;
        const cloud = this.weather === 'rain' ? this.intensity * 0.55 : this.weather === 'snow' ? this.intensity * 0.3 : 0;
        s.lightIntensity = this.light * (0.65 * s.daylight + 0.25 * (1 - s.daylight)) * (1 - cloud);
        s.ambientIntensity = this.light * (0.30 + 0.35 * s.daylight) * (1 - cloud * 0.35);
        s.windStrength = season.windStrength + (this.weather === 'rain' ? this.intensity * 0.35 : 0);
        (0, color_1.lerpColor)(s.skyTop, NIGHT_TOP, season.skyTop, s.daylight);
        (0, color_1.lerpColor)(s.skyBottom, NIGHT_BOTTOM, season.skyBottom, s.daylight);
        const twilight = Math.max(0, 1 - Math.abs(sunHeight) / 0.35) * 0.6 * (1 - cloud);
        (0, color_1.lerpColor)(s.skyBottom, s.skyBottom, DUSK, twilight);
        for (let channel = 0; channel < 3; channel++) {
            s.skyTop[channel] *= 1 - cloud * 0.35;
            s.skyBottom[channel] *= 1 - cloud * 0.3;
            s.groundColor[channel] = season.groundColor[channel] * (0.24 + 0.76 * s.daylight) * (1 - cloud * 0.25);
        }
        return s;
    }
}
exports.EnvironmentController = EnvironmentController;
//# sourceMappingURL=EnvironmentController.js.map