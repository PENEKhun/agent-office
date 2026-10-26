import { drawCommandFurniture } from './space-furniture-command.js';
import { drawSystemsFurniture } from './space-furniture-systems.js';
import { drawObservatoryFurniture } from './space-furniture-observatory.js';
import { drawSpaceWallDecor } from './space-walls.js';

function drawFurniture(layer, helpers) {
  const warning = drawCommandFurniture(layer, helpers);
  drawSystemsFurniture(layer, helpers);
  drawObservatoryFurniture(layer, helpers);
  return warning;
}

const space = {
  id: 'space',
  name: '우주 정거장',
  rooms: {
    library: { name: '데이터 아카이브', icon: '▦', legendColor: 0xF4C95D, floor: { kind: 'checker', colors: [0x213A52, 0x294761] } },
    meeting: { name: '브리핑룸', icon: '✦', legendColor: 0xB69BFF, floor: { kind: 'carpet', colors: [0x213D55, 0x294963] } },
    elevator: { name: '도킹 게이트', icon: '◉', legendColor: 0x78D9EA, floor: { kind: 'checker', colors: [0x182D41, 0x203A50] } },
    server: { name: '리액터실', icon: '⚡', legendColor: 0x6BE3B1, floor: { kind: 'checker', colors: [0x162F43, 0x203B50] } },
    dev: { name: '엔지니어링 베이', icon: '⌘', legendColor: 0x74B7FF, floor: { kind: 'carpet', colors: [0x1D374D, 0x29465C] } },
    search: { name: '관측 돔', icon: '⌕', legendColor: 0x6FD6C1, floor: { kind: 'carpet', colors: [0x1D384C, 0x29495C] } },
    desk: { name: '관제 콘솔', icon: '⌑', legendColor: 0xFF8E85, floor: { kind: 'checker', colors: [0x19354B, 0x23445A] } },
    lounge: { name: '휴게 모듈', icon: '☕', legendColor: 0xF1AE78, floor: { kind: 'planks', colors: [0x755352, 0x865D55] } }
  },
  activityLabels: {
    read: '데이터 조회 중', code: '부품 정비 중', run: '시스템 가동 중', search: '관측 중', plan: '작전 회의 중',
    reply: '교신 중', think: '항로 계산 중', rest: '휴식 중', walk: '이동 중', deliver: '화물 발송 중'
  },
  activityGlyphs: {
    read: 'data-cube', code: 'wrench', run: 'atom-core', search: 'telescope', plan: 'star-map', reply: 'antenna'
  },
  activityColors: {
    read: 0xE9B94F, code: 0x51C9DE, run: 0x61D59D, search: 0x61A8F0, plan: 0xAD91F0,
    reply: 0xF47F79, think: 0xF4C95D, rest: 0xEEA270, walk: 0x8EADC4, deliver: 0x56D8E6
  },
  statusLabels: { arriving: '이동 중', working: '운용 중', thinking: '항로 계산 중', idle: '휴식 중', leaving: '귀환 중', gone: '퇴근함' },
  elevatorHallName: '도킹 홀',
  delivery: {
    destination: { x: 13, y: 1.2 },
    mailbox: { kind: 'hatch', offsetX: 0, offsetY: -4, baseOffsetY: 0, depthOffset: 2 },
    pile: { offsetX: -12, columnGap: 15, offsetY: -42, rowGap: 11 },
    letter: { kind: 'transmission', depthOffset: 3 },
    parcel: { kind: 'pod' }
  },
  palette: {
    mapBackground: 'radial-gradient(circle at 12% 22%,#D8EFFA 0 1px,transparent 2px),radial-gradient(circle at 78% 17%,#9ECFE5 0 1px,transparent 2px),radial-gradient(circle at 48% 69%,#D8EFFA 0 1px,transparent 2px),radial-gradient(circle at 88% 77%,#9ECFE5 0 1px,transparent 2px),radial-gradient(ellipse at 50% 40%,#10263B,#07131F 74%)',
    widgetBackground: 'radial-gradient(circle at 12% 22%,#D8EFFA 0 1px,transparent 2px),radial-gradient(circle at 78% 17%,#9ECFE5 0 1px,transparent 2px),radial-gradient(circle at 48% 69%,#D8EFFA 0 1px,transparent 2px),radial-gradient(circle at 88% 77%,#9ECFE5 0 1px,transparent 2px),radial-gradient(ellipse at 50% 40%,#10263B,#07131F 74%)',
    corridor: [0x152B40, 0x1A3349], slab: [0x284359, 0x1D354A],
    wall: { left: 0x0E1E2D, right: 0x14283A, cap: 0x294459, base: 0x20384C },
    rug: [0x31536A, 0x3D4B6A, 0x6A5054],
    lightingKeyframes: [
      { minute: 0, period: 'day', color: 0x8DBDCE, alpha: 0.1 },
      { minute: 1440, period: 'day', color: 0x8DBDCE, alpha: 0.1 }
    ]
  },
  drawFurniture,
  drawWallDecor: drawSpaceWallDecor
};

export default space;
