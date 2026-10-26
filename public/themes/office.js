// 사무실 테마. 화면을 바꾸지 않고 기존 사무실 그림과 문구를 보관한다.
function drawFurniture(layer, helpers) {
  const { piece, plant, chair, bookshelfAlongBackWall, bookshelfAlongLeftWall, meetingTable, serverRack, desk, screenContent, globe, sofa, coffeeCorner, waterCooler, box, shadowEllipse, rug, iso, quad, seg } = helpers;
  // 자료실
  bookshelfAlongBackWall(layer, 0.6, 0, 4.8);
  bookshelfAlongLeftWall(layer, 0, 0.8, 4.4);
  piece(layer, 2, 2.4, 2, 1.1, (g) => {
    shadowEllipse(g, 3, 2.95, 60, 18, 0.1);
    box(g, 2, 2.4, 2, 1.1, 24, 0xE2B78A, { top: 0xF0CDA3 });
    box(g, 2.3, 2.6, 0.5, 0.35, 5, 0x7FB3D5, { z: 24, outline: false });
    box(g, 3.2, 2.7, 0.45, 0.3, 4, 0xE58E7A, { z: 24, outline: false });
  });
  chair(layer, 1.4, 3.1, 0xC9A27A, 'side');
  chair(layer, 4.6, 3.1, 0xC9A27A, 'side');
  plant(layer, 5.4, 5.4);

  // 회의실
  meetingTable(layer, 7.5, 1.5, 3.2, 1.3);
  [8, 9, 10].forEach((x) => { chair(layer, x, 3.2, 0xB59BD8); chair(layer, x, 1.15, 0xB59BD8); });
  chair(layer, 7.05, 2.15, 0xB59BD8, 'side');
  chair(layer, 11.1, 2.15, 0xB59BD8, 'side');
  plant(layer, 11.5, 0.5, 0.9);

  // 서버실
  [14.6, 15.9, 17.2, 18.5].forEach((x) => serverRack(layer, x, 0.25, { againstWall: 'y0' }));
  serverRack(layer, 18.9, 3.4);
  // 관제 콘솔: 검은 화면에 >_ 프롬프트
  piece(layer, 14.3, 4.6, 1.2, 0.7, (g) => {
    shadowEllipse(g, 14.9, 4.95, 34, 10, 0.1);
    box(g, 14.3, 4.6, 1.2, 0.7, 24, 0x64748B, { top: 0x94A3B8 });
    const m = box(g, 14.4, 4.7, 1.0, 0.06, 34, 0x0F172A, { z: 24, outline: false });
    quad(g, m.front(0.05, 0.08), m.front(0.95, 0.08), m.front(0.95, 0.92), m.front(0.05, 0.92), 0x0B1220);
    if (m.frontVisible) {
      const a = m.front(0.12, 0.72), b = m.front(0.2, 0.6), c = m.front(0.12, 0.48);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).stroke({ color: 0x6FE3A5, width: 2, cap: 'round' });
      seg(g, m.front(0.26, 0.44), m.front(0.4, 0.44), { color: 0x6FE3A5, width: 2, cap: 'round' });
      [[0.12, 0.25, 0.55], [0.12, 0.15, 0.4]].forEach(([u, v, len]) => {
        seg(g, m.front(u, v), m.front(u + len, v), { color: 0x6FE3A5, width: 1.2, alpha: 0.6 });
      });
    }
  });

  // 개발실: 책상 두 줄
  const screens = [0x8CCBF5, 0xA7E3C4, 0xF6D27A, 0xB9A9EE];
  [6.85, 8.65, 10.45, 12.25].forEach((x, i) => {
    desk(layer, x, 5.7, { screen: screens[i % 4], content: 'code', seed: i });
    chair(layer, x + 0.75, 7.0, 0x7FA6C9);
    desk(layer, x, 8.3, { screen: screens[(i + 2) % 4], content: 'code', seed: i + 2 });
    chair(layer, x + 0.75, 9.6, 0x7FA6C9);
  });
  plant(layer, 13.6, 10.5, 0.85);

  // 정보검색실
  piece(layer, 0.15, 8, 0.8, 5, (g) => {
    box(g, 0.15, 8, 0.8, 5, 26, 0xF7F7F5, { right: 0xD3D4CF });
    [8.4, 10.2, 12.0].forEach((y, i) => {
      const m = box(g, 0.3, y, 0.06, 0.9, 30, 0x46505B, { z: 34, outline: false });
      quad(g, m.side(0.08, 0.1), m.side(0.92, 0.1), m.side(0.92, 0.9), m.side(0.08, 0.9), 0x7EC8E3);
      screenContent(g, m.side, 'map', i);
    });
  }, { wall: 'left' });
  [8.85, 10.65, 12.45].forEach((y) => chair(layer, 1.55, y, 0x6FC3A0, 'side'));
  globe(layer, 4.6, 8.2);
  piece(layer, 3.3, 9.8, 0.8, 0.8, (g) => {
    shadowEllipse(g, 3.7, 10.2, 22, 9);
    const c = iso(3.7, 10.2, 8);
    g.ellipse(c.x, c.y, 24, 12).fill(0xF6D27A);
    g.ellipse(c.x - 3, c.y - 5, 15, 7).fill(0xF9DE94);
  });
  plant(layer, 5.5, 13.4);

  // 내 자리
  [[14.8, 7.9], [17.2, 7.9], [14.8, 10.0], [17.2, 10.0], [14.8, 12.1], [17.2, 12.1]].forEach(([x, y], i) => {
    desk(layer, x, y, { laptop: true, screen: 0xFFFFFF, content: 'paper', papers: true });
    chair(layer, x + 0.8, y + 1.15, 0x9DBF8A);
  });
  plant(layer, 19.5, 7.5);
  plant(layer, 19.5, 13.4, 0.9);

  // 라운지
  // 개발실과 라운지 사이 화단: 일하는 공간과 쉬는 공간을 눈으로 나눈다
  piece(layer, 7.05, 10.78, 5.9, 0.26, (g) => {
    box(g, 7.05, 10.78, 5.9, 0.26, 20, 0xD9C7A6, { top: 0x8CCBA6 });
    for (let i = 0; i < 12; i += 1) {
      const c = iso(7.3 + i * 0.48, 10.9, 20);
      g.circle(c.x, c.y - 8, 8).fill(i % 2 ? 0x7FC79A : 0x93D3A8);
      g.circle(c.x + 3, c.y - 14, 5).fill(i % 2 ? 0x93D3A8 : 0x7FC79A);
      if (i % 3 === 0) g.circle(c.x + 2, c.y - 17, 2.2).fill(0xF6D27A);
    }
  }, { wall: 'back' });
  sofa(layer, 7.6, 11.15, 3.3);
  piece(layer, 8.4, 13.0, 1.5, 0.6, (g) => box(g, 8.4, 13.0, 1.5, 0.6, 12, 0xE2B78A, { top: 0xF0CDA3 }));
  coffeeCorner(layer, 11.3, 11.1);
  waterCooler(layer, 12.5, 12.8);
  plant(layer, 7.4, 13.5, 0.8);

  // 복도 화분
  plant(layer, 13.5, 3.6, 0.9);
  plant(layer, 0.5, 6.5, 0.8);
  plant(layer, 6.5, 6.4 - 1.2, 0.7);
}

const office = {
  id: 'office',
  name: '사무실',
  rooms: {
    library: { name: '자료실', icon: '📚', floor: { kind: 'planks', colors: [0xF4E3C4, 0xEFDAB5] } },
    meeting: { name: '회의실', icon: '🗂️', floor: { kind: 'carpet', colors: [0xEAE3F6, 0xE4DCF2] } },
    elevator: { name: '엘리베이터', icon: '🛗', floor: { kind: 'checker', colors: [0xF1F3F6, 0xE6EAEF] } },
    server: { name: '서버실', icon: '🖥️', floor: { kind: 'checker', colors: [0xDDE5EC, 0xD3DCE5] } },
    dev: { name: '개발실', icon: '💻', floor: { kind: 'carpet', colors: [0xDDEEFB, 0xD6E9F8] } },
    search: { name: '정보검색실', icon: '🔎', floor: { kind: 'carpet', colors: [0xDCF3E7, 0xD4EEE1] } },
    desk: { name: '응답 데스크', icon: '💬', floor: { kind: 'planks', colors: [0xEEF3E6, 0xE7EEDD] } },
    lounge: { name: '라운지', icon: '☕', floor: { kind: 'planks', colors: [0xFBE6D1, 0xF6DCC2] } }
  },
  activityLabels: { read: '자료 찾는 중', code: '코드 수정 중', run: '명령 실행 중', search: '검색 중', plan: '계획 세우는 중', reply: '답변 쓰는 중', think: '고민 중', rest: '쉬는 중', walk: '이동 중', deliver: 'git 배송 중' },
  activityColors: { read: 0xE9A23B, code: 0x3B82F6, run: 0x334155, search: 0x14A38B, plan: 0x8B5CF6, reply: 0xF0766A, think: 0xF5C542, rest: 0xA47551, walk: 0x94A3B8, deliver: 0xE4572E },
  statusLabels: { arriving: '이동 중', working: '작업 중', thinking: '고민 중', idle: '쉬는 중', leaving: '퇴근 중', gone: '퇴근함' },
  elevatorHallName: '엘리베이터 홀',
  delivery: {
    destination: { x: 12.4, y: 3.6 },
    mailbox: { offsetX: 24, offsetY: 18, baseOffsetY: -2, depthOffset: 2 },
    pile: { offsetX: -12, columnGap: 15, offsetY: -42, rowGap: 11 },
    letter: { kind: 'letter', depthOffset: 3 },
    parcel: { kind: 'parcel' }
  },
  palette: {
    mapBackground: 'radial-gradient(ellipse at 50% 40%,#fbfdfd,#eff5f6 72%)',
    widgetBackground: 'radial-gradient(ellipse at 50% 40%,#fbfdfd,#eff5f6 72%)',
    corridor: [0xF6F3EE, 0xF1EDE7], slab: [0xD9D2C8, 0xC8C0B5],
    wall: { left: 0xEDE8E2, right: 0xF8F6F3, cap: 0xDCD5CC, base: 0xE0D8CE },
    rug: [0xF7D9B4, 0xF9D3D3, 0xBFE6D2],
    lightingKeyframes: [
      { minute: 0, period: 'night', color: 0x263857, alpha: 0.56 },
      { minute: 390, period: 'night', color: 0x263857, alpha: 0.56 },
      { minute: 420, period: 'day', color: 0xffffff, alpha: 0 },
      { minute: 1050, period: 'day', color: 0xffffff, alpha: 0 },
      { minute: 1080, period: 'dusk', color: 0xF3A36D, alpha: 0.16 },
      { minute: 1230, period: 'dusk', color: 0xF3A36D, alpha: 0.16 },
      { minute: 1260, period: 'night', color: 0x263857, alpha: 0.56 },
      { minute: 1440, period: 'night', color: 0x263857, alpha: 0.56 }
    ]
  },
  drawFurniture
};
export default office;
