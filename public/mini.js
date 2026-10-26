import { renderMini } from '/mini-render.js';
const list = document.querySelector('#agents');
fetch('/api/state').then((response) => response.json()).then((snapshot) => renderMini(list, snapshot)).catch(() => {});
const stream = new EventSource('/events');
for (const name of ['snapshot', 'delta']) stream.addEventListener(name, (event) => renderMini(list, JSON.parse(event.data)));
