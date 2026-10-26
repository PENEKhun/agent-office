import { installWidgetChrome } from '/widget-view.js';

const STYLE = `
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden}
  body{position:relative;background:#f4f8f7;color:#263746;font:12px/1.3 system-ui,sans-serif}
  #pip-content{position:absolute;inset:0}#pip-office,#pip-mini{position:absolute;inset:0;width:100%;height:100%}
  #pip-office{overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#fbfdfd,#eff5f6 72%)}#pip-office canvas{display:block;width:100%;height:100%;touch-action:none}
  #pip-mini{display:flex;align-items:center;overflow:hidden;padding:8px}
  body.mini-mode #pip-content{display:flex;align-items:center}body.mini-mode #pip-mini{position:relative;inset:auto;flex:1;width:100%;height:100%;min-height:0;padding:0 8px;align-items:center}
  body.mini-mode #agents{align-items:center;height:100%}body.mini-mode .agent{height:24px}body.mini-mode .agent+.agent::before{height:18px}body.mini-mode .more{height:24px}
  #agents{width:100%;display:flex;align-items:center;gap:8px;overflow:hidden;white-space:nowrap}
  .agent{position:relative;flex:0 0 40px;height:40px;display:grid;grid-template-columns:16px 8px 16px;align-items:center;justify-items:center}
  .agent+.agent::before{content:'';position:absolute;left:-4px;width:1px;height:24px;background:#E6ECEF}.agent img{width:15px;height:15px}.agent img.activity-symbol{width:16px;height:16px}
  .status{width:7px;height:7px;border-radius:50%;background:#AAB4BA}.status-working{background:#39A979}.status-thinking{background:#E8B949}.status-gone{background:#D8DEE2}
`;

export function installPipController({ button, canvas, ticker, renderMini, onEnter, onResize, onLeave, onMode, onRotate = null, onThemeCycle = null }) {
  if (!('documentPictureInPicture' in window)) return null;
  button.hidden = false;
  let pipWindow = null;
  let frameId = null;
  let officeHost = null;
  let miniList = null;
  let chrome = null;
  function renderFrame(time) {
    if (!pipWindow) return;
    ticker.update(time);
    frameId = pipWindow.requestAnimationFrame(renderFrame);
  }
  function closePip() {
    if (!pipWindow) return;
    if (frameId !== null) pipWindow.cancelAnimationFrame(frameId);
    frameId = null;
    chrome?.destroy();
    chrome = null;
    pipWindow = null;
    ticker.started = false;
    ticker.start();
    onLeave();
    officeHost = null;
    miniList = null;
  }
  async function openPip() {
    if (pipWindow) return;
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 420, height: 300 });
      const doc = pipWindow.document;
      doc.head.innerHTML = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Office PiP</title>';
      const style = doc.createElement('style');
      style.textContent = STYLE;
      doc.head.append(style);
      doc.body.innerHTML = '<main id="pip-content"><div id="pip-office"></div><div id="pip-mini" hidden><div id="agents"></div></div></main>';
      officeHost = doc.getElementById('pip-office');
      miniList = doc.getElementById('agents');
      officeHost.append(canvas);
      onEnter(officeHost);
      chrome = installWidgetChrome(doc, {
        onMode,
        onRotate,
        onThemeCycle,
        onClose: () => pipWindow?.close(),
        resizeWindow: (mode) => { try { pipWindow?.resizeTo(420, mode === 'office' ? 300 : 64); } catch { /* PiP resize may be restricted. */ } }
      });
      pipWindow.addEventListener('resize', () => onResize(officeHost));
      pipWindow.addEventListener('pagehide', closePip, { once: true });
      ticker.stop();
      ticker.started = true;
      frameId = pipWindow.requestAnimationFrame(renderFrame);
    } catch (error) {
      pipWindow = null;
      console.warn('Document PiP could not be opened', error);
    }
  }
  button.addEventListener('click', openPip);
  return { update(snapshot, options) { if (miniList) renderMini(miniList, snapshot, options); }, get isOpen() { return Boolean(pipWindow); } };
}
