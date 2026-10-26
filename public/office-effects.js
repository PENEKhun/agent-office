export function createLightingOverlay(PIXI) {
  const layer = new PIXI.Container();
  layer.eventMode = 'none';
  const shade = new PIXI.Graphics();
  shade.blendMode = 'multiply';
  layer.addChild(shade);
  let width = 0;
  let height = 0;
  return {
    layer,
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
    },
    update({ color, alpha }) {
      shade.clear();
      if (alpha > 0) shade.rect(0, 0, width, height).fill({ color, alpha });
    }
  };
}

export function createMonitorGlow(PIXI, color) {
  const glow = new PIXI.Graphics().ellipse(0, 0, 24, 9).fill({ color, alpha: 0.55 });
  glow.blendMode = 'add';
  return glow;
}

export function createOvertimeBadge(PIXI) {
  const badge = new PIXI.Container();
  badge.addChild(new PIXI.Graphics().roundRect(-20, -9, 40, 18, 8).fill({ color: 0xF3A64A }));
  badge.addChild(new PIXI.Text({ text: '야근', style: { fontFamily: 'sans-serif', fontSize: 11, fontWeight: '700', fill: 0xffffff } }));
  badge.children[1].anchor.set(0.5);
  badge.visible = false;
  return badge;
}

export function createSnackBox(PIXI) {
  return new PIXI.Graphics().roundRect(-7, -5, 14, 10, 2).fill({ color: 0xE6B44E })
    .roundRect(-7, -5, 14, 3, 2).fill({ color: 0xFFF0B3 })
    .rect(-1, -3, 2, 8).fill({ color: 0xBD7545 });
}

export function createLetter(PIXI, style = { kind: 'letter' }) {
  if (style.kind === 'order') {
    return new PIXI.Graphics().roundRect(-13, -10, 26, 20, 3).fill(0xFFF8E7)
      .roundRect(-13, -10, 26, 4, 2).fill(0xC96C4B)
      .moveTo(-8, -1).lineTo(8, -1).stroke({ color: 0xB89C7E, width: 1.5 })
      .moveTo(-8, 4).lineTo(3, 4).stroke({ color: 0xB89C7E, width: 1.5 })
      .circle(8, 6, 2).fill(0xE8A04B);
  }
  if (style.kind === 'transmission') {
    return new PIXI.Graphics().circle(0, 0, 10).fill({ color: 0x78D9EA })
      .circle(0, 0, 6).stroke({ color: 0xE7FBFF, width: 2 }).moveTo(-3, 0).lineTo(3, 0)
      .stroke({ color: 0xE7FBFF, width: 2 });
  }
  return new PIXI.Graphics().roundRect(-12, -9, 24, 18, 3).fill({ color: 0xFFFDF4 })
    .moveTo(-9, -6).lineTo(0, 2).lineTo(9, -6).stroke({ color: 0xD98E74, width: 2 });
}

export function createParcel(PIXI, style = { kind: 'parcel' }) {
  if (style.kind === 'dish') {
    const plate = new PIXI.Container();
    plate.addChild(new PIXI.Graphics().ellipse(0, 1, 17, 10).fill(0xC58B55)
      .ellipse(0, 0, 15, 8).fill(0xFFFCF2).stroke({ color: 0xD8C8AE, width: 1.5 })
      .ellipse(-2, -1, 7, 4).fill(0xC96343)
      .ellipse(5, 2, 5, 3).fill(0xE6B44E)
      .ellipse(-7, 2, 3, 2).fill(0x72A96A)
      .circle(1, -4, 1.5).fill(0xF6D27A));
    return plate;
  }
  if (style.kind === 'pod') {
    const pod = new PIXI.Container();
    pod.addChild(new PIXI.Graphics().roundRect(-15, -10, 30, 20, 9).fill({ color: 0x4D7899 })
      .roundRect(-10, -7, 20, 14, 6).fill({ color: 0x7BD7E7 })
      .circle(0, 0, 3).fill({ color: 0xE7FBFF }));
    return pod;
  }
  const parcel = new PIXI.Container();
  parcel.addChild(new PIXI.Graphics().poly([-14, -8, 0, -15, 14, -8, 0, -1]).fill({ color: 0xE6C38D })
    .poly([-14, -8, 0, -1, 0, 14, -14, 7]).fill({ color: 0xC89055 })
    .poly([0, -1, 14, -8, 14, 7, 0, 14]).fill({ color: 0xD6A366 })
    .moveTo(0, -14).lineTo(0, 12).stroke({ color: 0xFFF0C8, width: 3 }));
  return parcel;
}

export function createMailbox(PIXI, style = { kind: 'mailbox' }) {
  if (style.kind === 'bell') {
    const bell = new PIXI.Container();
    const body = new PIXI.Graphics().roundRect(-24, -12, 48, 22, 5).fill(0x9C6848)
      .roundRect(-19, -17, 38, 7, 3).fill(0xE6C58E)
      .moveTo(-5, -17).quadraticCurveTo(0, -29, 5, -17).fill(0xE8B949)
      .circle(0, -29, 2.5).fill(0xA86E43)
      .moveTo(-19, -5).lineTo(19, -5).stroke({ color: 0xF8E8C9, width: 1.5 });
    const count = new PIXI.Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fontWeight: '700', fill: 0xffffff } });
    count.anchor.set(0.5);
    count.position.set(17, -17);
    bell.addChild(body, count);
    bell.setCount = (value) => { count.text = value > 5 ? String(value) : ''; count.visible = value > 5; };
    return bell;
  }
  if (style.kind === 'hatch') {
    const hatch = new PIXI.Container();
    const body = new PIXI.Graphics().circle(0, -8, 23).fill({ color: 0x18334B })
      .circle(0, -8, 17).stroke({ color: 0x72D5E8, width: 4 })
      .circle(0, -8, 10).stroke({ color: 0x3E7189, width: 2 });
    const count = new PIXI.Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fontWeight: '700', fill: 0xffffff } });
    count.anchor.set(0.5);
    count.position.set(0, -8);
    hatch.addChild(body, count);
    hatch.setCount = (value) => { count.text = value > 5 ? String(value) : ''; count.visible = value > 5; };
    return hatch;
  }
  const box = new PIXI.Container();
  const body = new PIXI.Graphics().roundRect(-21, -27, 42, 31, 6).fill({ color: 0xD9634D })
    .roundRect(-15, -20, 30, 4, 2).fill({ color: 0xFFF1DF })
    .rect(12, -33, 3, 10).fill({ color: 0x547BA7 })
    .circle(16, -32, 3).fill({ color: 0x547BA7 })
    .rect(-3, 4, 6, 18).fill({ color: 0x798892 });
  const count = new PIXI.Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 10, fontWeight: '700', fill: 0xffffff } });
  count.anchor.set(0.5);
  count.position.set(11, -18);
  box.addChild(body, count);
  box.setCount = (value) => {
    count.text = value > 5 ? String(value) : '';
    count.visible = value > 5;
  };
  return box;
}
