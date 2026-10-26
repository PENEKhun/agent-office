import test from 'node:test';
import assert from 'node:assert/strict';
import { createLetter, createMailbox, createParcel } from '../public/office-effects.js';

class Graphics {
  roundRect() { return this; }
  fill() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  stroke() { return this; }
  circle() { return this; }
  ellipse() { return this; }
  quadraticCurveTo() { return this; }
}

class Container {
  constructor() { this.children = []; }
  addChild(...children) { this.children.push(...children); }
}

class Text {
  constructor() { this.anchor = { set() {} }; this.position = { set() {} }; }
}

const PIXI = { Graphics, Container, Text };

test('레스토랑 배송 그림이 주문서·접시·주문 벨 종류를 만든다', () => {
  assert.ok(createLetter(PIXI, { kind: 'order' }) instanceof Graphics);
  assert.ok(createParcel(PIXI, { kind: 'dish' }) instanceof Container);
  const bell = createMailbox(PIXI, { kind: 'bell' });
  assert.ok(bell instanceof Container);
  assert.equal(typeof bell.setCount, 'function');
  bell.setCount(4);
  assert.equal(bell.children[1].visible, false);
  bell.setCount(6);
  assert.equal(bell.children[1].text, '6');
  assert.equal(bell.children[1].visible, true);
});
