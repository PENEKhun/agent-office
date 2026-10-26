// 레스토랑 테마의 색·방 이름·활동 문구와 배송 표현
import { drawRecipeRooms } from './restaurant-furniture-library.js';
import { drawKitchenRooms } from './restaurant-furniture-kitchen.js';
import { drawServiceRooms } from './restaurant-furniture-front.js';

function drawFurniture(layer, helpers) {
  drawRecipeRooms(layer, helpers);
  drawKitchenRooms(layer, helpers);
  drawServiceRooms(layer, helpers);
}

const restaurant = {
  id: 'restaurant',
  name: '레스토랑',
  rooms: {
    library: { name: '레시피 서가', icon: '📚', legendColor: 0xB47A43, floor: { kind: 'planks', colors: [0xE8D0AA, 0xDDBE91] } },
    meeting: { name: '메뉴 회의 테이블', icon: '📝', legendColor: 0xC47D63, floor: { kind: 'planks', colors: [0xEAD8BE, 0xE0C9A8] } },
    elevator: { name: '뒷문 납품구', icon: '🔔', legendColor: 0xC88D55, floor: { kind: 'checker', colors: [0xE6D4B8, 0xDCC6A4] } },
    server: { name: '오븐·화덕', icon: '🔥', legendColor: 0xD56B48, floor: { kind: 'checker', colors: [0xE7C7A5, 0xDDBA94] } },
    dev: { name: '조리 라인', icon: '🍳', legendColor: 0x7C9A8B, floor: { kind: 'carpet', colors: [0xD9E1D7, 0xCDD8CE] } },
    search: { name: '식자재 시장', icon: '🍎', legendColor: 0x78A66A, floor: { kind: 'planks', colors: [0xE9D3AD, 0xE0C49A] } },
    desk: { name: '홀 카운터', icon: '🛎️', legendColor: 0xC68155, floor: { kind: 'planks', colors: [0xE8D2B2, 0xDFC5A0] } },
    lounge: { name: '직원 휴게실', icon: '🛋️', legendColor: 0xD58B77, floor: { kind: 'carpet', colors: [0xF4D8C8, 0xF0CBBB] } }
  },
  activityLabels: {
    read: '레시피 찾는 중', code: '요리 중', run: '굽는 중', search: '장 보는 중', plan: '메뉴 짜는 중',
    reply: '주문 받는 중', think: '맛 고민 중', rest: '쉬는 중', walk: '이동 중', deliver: '서빙 중'
  },
  activityGlyphs: {
    read: 'cookbook', code: 'knife-board', run: 'flame', search: 'basket', plan: 'menu-board', reply: 'service-bell'
  },
  activityColors: {
    read: 0xB47A43, code: 0x3E8A72, run: 0xD95F38, search: 0x4E9B62, plan: 0x8267A8,
    reply: 0xC64F4B, think: 0xD99B32, rest: 0xBE806E, walk: 0x7D8A88, deliver: 0xC75D3D
  },
  statusLabels: { arriving: '이동 중', working: '조리 중', thinking: '맛 고민 중', idle: '쉬는 중', leaving: '퇴근 중', gone: '퇴근함' },
  elevatorHallName: '뒷문 납품구',
  delivery: {
    destination: { x: 13, y: 2.45 },
    mailbox: { kind: 'bell', offsetX: 0, offsetY: -6, baseOffsetY: -2, depthOffset: 2 },
    pile: { offsetX: -12, columnGap: 15, offsetY: -42, rowGap: 11 },
    letter: { kind: 'order', depthOffset: 3 },
    parcel: { kind: 'dish' }
  },
  palette: {
    mapBackground: 'radial-gradient(ellipse at 48% 38%,#FFF9EF,#F3E3CC 76%)',
    widgetBackground: 'radial-gradient(ellipse at 48% 38%,#FFF9EF,#F3E3CC 76%)',
    corridor: [0xE8D6BB, 0xE2CEB0], slab: [0xBFA17D, 0xAE8D69],
    wall: { left: 0xD9C2A1, right: 0xF3E6D1, cap: 0xB99168, base: 0xCBAA83 },
    rug: [0xC2D2BD, 0xD8AE82, 0xDEA99A],
    nightLighting: { color: 0xF6D49B, alpha: 0.3 }
  },
  drawFurniture
};

export default restaurant;
