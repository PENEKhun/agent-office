import { ACTIVITIES, drawGlyph } from '/office-activity.js';

export function createAgentBadge(PIXI, { texture, color, activity = 'walk' }) {
  const badge = new PIXI.Container();
  badge.addChild(new PIXI.Graphics().circle(0, 0, 7).fill(0xFFFFFF).stroke({ color, width: 1.5 }));
  if (texture) {
    const icon = new PIXI.Sprite(texture);
    icon.anchor.set(0.5);
    icon.width = 9;
    icon.height = 9;
    badge.addChild(icon);
  } else {
    badge.addChild(new PIXI.Graphics().circle(0, 0, 3.2).fill(color));
  }
  badge.setActivity = (kind) => {
    badge.position.set(kind === 'think' ? -17 : -10, kind === 'think' ? 7 : 4);
  };
  badge.setActivity(activity);
  badge.zIndex = 10;
  badge.eventMode = 'static';
  badge.cursor = 'pointer';
  return badge;
}

export function createBundleChip(PIXI, { count, members = [], activityKinds = [], night = false }) {
  const chip = new PIXI.Container();
  const visibleMembers = members.slice(0, 3);
  const overflow = Math.max(0, count - visibleMembers.length);
  const peopleLabel = new PIXI.Text({ text: `${count}명`, style: {
    fontFamily: 'sans-serif', fontSize: 12, fontWeight: '700', fill: 0x3F515C
  } });
  const overflowLabel = overflow ? new PIXI.Text({ text: `+${overflow}`, style: {
    fontFamily: 'sans-serif', fontSize: 11, fontWeight: '700', fill: 0x71808B
  } }) : null;
  const iconWidth = visibleMembers.length ? visibleMembers.length * 12 : 0;
  const width = 20 + iconWidth + (overflowLabel ? overflowLabel.width + 7 : 0) + 8 + peopleLabel.width + 8 + 8 + 3 * 12 + 14;
  chip.addChild(new PIXI.Graphics().roundRect(-width / 2, -13, width, 26, 13)
    .fill({ color: 0xFFFFFF, alpha: 0.96 }).stroke({ color: 0x9DB9C6, width: 1.5 }));
  let cursor = -width / 2 + 10;
  visibleMembers.forEach((member, index) => {
    if (member.texture) {
      const icon = new PIXI.Sprite(member.texture);
      icon.anchor.set(0.5);
      icon.width = 11;
      icon.height = 11;
      icon.position.set(cursor + 5.5, 0);
      chip.addChild(icon);
    } else {
      chip.addChild(new PIXI.Graphics().circle(cursor + 5.5, 0, 5).fill(member.color ?? 0x8A9AA4));
    }
    cursor += 12;
  });
  if (overflowLabel) {
    overflowLabel.position.set(cursor + 1, 0);
    overflowLabel.anchor.set(0, 0.5);
    chip.addChild(overflowLabel);
    cursor += overflowLabel.width + 7;
  }
  peopleLabel.anchor.set(0, 0.5);
  peopleLabel.position.set(cursor + 2, 0);
  chip.addChild(peopleLabel);
  cursor += peopleLabel.width + 9;
  chip.addChild(new PIXI.Text({ text: '·', style: {
    fontFamily: 'sans-serif', fontSize: 12, fontWeight: '700', fill: 0x8A9AA4
  } })).position.set(cursor, 0);
  const activityStartX = width / 2 - (night ? 19 : 10) - 3 * 12;
  const activities = new PIXI.Container();
  chip.addChild(activities);
  chip.setActivities = (kinds) => {
    activities.removeChildren().forEach((child) => child.destroy({ children: true }));
    kinds.slice(0, 3).forEach((kind, index) => {
      const color = ACTIVITIES[kind]?.color ?? ACTIVITIES.walk.color;
      const icon = new PIXI.Graphics().circle(0, 0, 5).fill(color);
      drawGlyph(icon, kind, 7, 0xFFFFFF);
      icon.position.set(activityStartX + index * 12, 0);
      activities.addChild(icon);
    });
  };
  chip.setActivities(activityKinds);
  const moon = new PIXI.Container();
  moon.addChild(new PIXI.Graphics().circle(0, 0, 6).fill(0xF0B94C));
  moon.addChild(new PIXI.Graphics().circle(3, -2, 5).fill(0xFFFFFF));
  moon.position.set(width / 2 - 13, 0);
  moon.visible = night;
  chip.addChild(moon);
  chip.setNight = (visible) => { moon.visible = visible; };
  chip.eventMode = 'static';
  chip.cursor = 'pointer';
  chip.hitArea = new PIXI.Rectangle(-width / 2, -15, width, 30);
  return chip;
}

export function createBundleCard(PIXI, { members, onSelect, maxRows = 8, rowHeight = 25 }) {
  const pad = rowHeight < 25 ? 7 : 10;
  const visibleMembers = members.slice(0, maxRows);
  const moreCount = members.length - visibleMembers.length;
  const rowTexts = visibleMembers.map((member) => new PIXI.Text({ text: member.text, style: {
    fontFamily: 'sans-serif', fontSize: 11, fontWeight: '600', fill: 0x3F515C
  } }));
  const width = Math.min(300, Math.max(184, ...rowTexts.map((text) => text.width + 48)));
  const height = pad * 2 + (visibleMembers.length + (moreCount ? 1 : 0)) * rowHeight;
  const card = new PIXI.Container();
  card.addChild(new PIXI.Graphics().roundRect(2, 3, width, height, 12).fill({ color: 0x26343B, alpha: 0.14 }));
  card.addChild(new PIXI.Graphics().roundRect(0, 0, width, height, 12)
    .fill({ color: 0xFFFFFF, alpha: 0.98 }).stroke({ color: 0xDCE5E9, width: 1 }));
  visibleMembers.forEach((member, index) => {
    const y = pad + index * rowHeight;
    if (member.texture) {
      const icon = new PIXI.Sprite(member.texture);
      icon.anchor.set(0.5); icon.width = 14; icon.height = 14; icon.position.set(16, y + 7);
      card.addChild(icon);
    } else {
      card.addChild(new PIXI.Graphics().circle(16, y + 7, 5).fill(member.color));
    }
    const rowText = rowTexts[index];
    rowText.position.set(28, y);
    if (rowText.width > width - 38) rowText.scale.x = (width - 38) / rowText.width;
    card.addChild(rowText);
    const hit = new PIXI.Graphics().rect(0, y - 2, width, rowHeight - 1).fill({ color: 0xFFFFFF, alpha: 0.001 });
    hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.on('pointertap', () => onSelect?.(member.id));
    card.addChild(hit);
  });
  if (moreCount) {
    card.addChild(new PIXI.Text({ text: `+${moreCount}명 더`, style: {
      fontFamily: 'sans-serif', fontSize: 11, fontWeight: '700', fill: 0x71808B
    } })).position.set(28, pad + visibleMembers.length * rowHeight);
  }
  card.eventMode = 'passive';
  card.visible = false;
  card.cardWidth = width;
  card.cardHeight = height;
  return card;
}
