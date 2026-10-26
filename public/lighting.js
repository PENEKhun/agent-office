import { getTheme } from './themes/index.js';

const DEFAULT_KEYFRAMES = [
  { minute: 0, period: 'night', color: 0x263857, alpha: 0.56 },
  { minute: 390, period: 'night', color: 0x263857, alpha: 0.56 },
  { minute: 420, period: 'day', color: 0xffffff, alpha: 0 },
  { minute: 1050, period: 'day', color: 0xffffff, alpha: 0 },
  { minute: 1080, period: 'dusk', color: 0xF3A36D, alpha: 0.16 },
  { minute: 1230, period: 'dusk', color: 0xF3A36D, alpha: 0.16 },
  { minute: 1260, period: 'night', color: 0x263857, alpha: 0.56 },
  { minute: 1440, period: 'night', color: 0x263857, alpha: 0.56 }
];

function mixColor(left, right, amount) {
  const channel = (shift) => Math.round(((left >> shift) & 255) * (1 - amount) + ((right >> shift) & 255) * amount);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function frameAt(minute, keyframes) {
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index];
    if (minute > right.minute) continue;
    const left = keyframes[index - 1];
    const amount = (minute - left.minute) / (right.minute - left.minute);
    return {
      period: amount < 0.5 ? left.period : right.period,
      color: mixColor(left.color, right.color, amount),
      alpha: left.alpha * (1 - amount) + right.alpha * amount
    };
  }
  return keyframes[0];
}

/** 현재 지역 시각을 테마 조명 값으로 바꾼다. */
export function lightingAt(timestamp, mode = 'auto') {
  const date = new Date(timestamp);
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const workingHours = date.getHours() >= 22 || date.getHours() < 6;
  if (mode === 'day') return { period: 'day', color: 0xffffff, alpha: 0, overtime: workingHours };
  const palette = getTheme().palette;
  const frame = frameAt(minute, palette.lightingKeyframes ?? DEFAULT_KEYFRAMES);
  const night = frame.period === 'night' ? palette.nightLighting : null;
  return { ...frame, ...(night ?? {}), overtime: workingHours };
}
