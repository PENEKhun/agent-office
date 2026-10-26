import { opacityPopoverState, pinHintVisible, settingsPanelState, toolbarLabelsVisible, transientHint } from '/widget-settings.js';

const TOOLBAR_STYLE = `
  #widget-toolbar{--widget-dim-factor:1;position:absolute;z-index:50;top:8px;right:8px;display:flex;align-items:center;gap:1px;max-width:calc(100% - 16px);padding:4px;background:rgba(255,255,255,.9);border:1px solid rgba(220,229,235,.9);border-radius:11px;box-shadow:0 3px 12px rgba(38,52,59,.2);opacity:0;pointer-events:none;transition:opacity 150ms ease;user-select:none}
  #widget-toolbar.visible{opacity:var(--widget-dim-factor);pointer-events:auto}#widget-toolbar button{display:flex;align-items:center;justify-content:center;gap:2px;height:34px;min-width:34px;padding:0 3px;border:1px solid #dce5eb;border-radius:8px;background:#fff;color:#536575;font:13px/1.1 system-ui,sans-serif;white-space:nowrap;cursor:pointer;user-select:none}
  #widget-toolbar button:hover{background:#f2f8f6}#widget-toolbar button[aria-pressed=true]{background:#e9f6f0;color:#357d66;border-color:#b9dfcf}
  #widget-toolbar .toolbar-label{display:none}
  #widget-toolbar .toolbar-divider{width:1px;height:22px;margin:0 1px;background:#dce5eb;flex:0 0 1px}
  #widget-toolbar.wide .toolbar-label{display:inline}
  #widget-toolbar #widget-pin-button[aria-pressed=true]{background:#e9f6f0;color:#357d66;border-color:#b9dfcf}
  #widget-toolbar.pin-active{z-index:90;top:0;right:0;width:36px;height:36px;padding:4px;gap:0;border:0;border-radius:0;background:transparent;box-shadow:none;opacity:1;pointer-events:none;transition:none}
  #widget-toolbar.pin-active>button:not(#widget-pin-button),#widget-toolbar.pin-active>.toolbar-divider{display:none}#widget-toolbar.pin-active #widget-pin-button{width:28px;height:28px;min-width:28px;padding:0;border:1px solid #b9dfcf;border-radius:8px;background:rgba(255,255,255,.96);box-shadow:0 2px 8px rgba(38,52,59,.22);font-size:16px;pointer-events:auto}#widget-toolbar.pin-active #widget-pin-button .toolbar-label{display:none}
  #widget-pin-hint,#widget-action-hint{position:absolute;z-index:89;top:8px;padding:6px 9px;border:1px solid #d9e8df;border-radius:9px;background:rgba(255,255,255,.96);box-shadow:0 2px 8px #26374622;color:#357d66;font:12px/1.2 system-ui,sans-serif;pointer-events:none;user-select:none}#widget-pin-hint{right:88px}#widget-action-hint{right:8px;top:52px;color:#536575;border-color:#dce5eb}#widget-pin-hint[hidden],#widget-action-hint[hidden]{display:none}
  #opacity-popover[hidden]{display:none!important}#opacity-popover{position:absolute;z-index:60;top:52px;right:8px;width:min(280px,calc(100% - 16px));padding:11px 12px;border:1px solid #dce5eb;border-radius:11px;background:rgba(255,255,255,.98);box-shadow:0 4px 16px #26374633;color:#263746;font:13px/1.4 system-ui,sans-serif;user-select:none}
  #opacity-popover h2{margin:0 0 7px;font-size:14px}#opacity-popover label{display:grid;grid-template-columns:56px minmax(70px,1fr) 40px;align-items:center;gap:7px;margin:7px 0;font-size:13px}
  #opacity-popover input[type=range]{width:100%;accent-color:#14A38B;outline:none;border-radius:8px}#opacity-popover input[type=range]:focus-visible{outline:2px solid #14A38B;outline-offset:2px}
  #opacity-popover label.auto-dim{display:flex;gap:8px;margin-top:9px}#opacity-popover label.auto-dim input{width:16px;height:16px;accent-color:#14A38B}
  #widget-settings[hidden]{display:none!important}#widget-settings{position:absolute;z-index:40;top:52px;right:8px;bottom:8px;left:8px;display:flex;flex-direction:column;min-width:0;min-height:0;padding:14px;border:1px solid #dce5eb;border-radius:13px;background:rgba(255,255,255,.97);box-shadow:0 4px 18px #26374633;color:#263746;font:13px/1.4 system-ui,sans-serif;user-select:none}
  .settings-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 0 9px;border-bottom:1px solid #e8eef1}.settings-header h1{margin:0;font-size:16px}.settings-header button{min-width:34px;height:34px}
  .settings-body{min-height:0;overflow:auto;padding:8px 2px 3px}.settings-group{padding:7px 0;border-bottom:1px solid #edf1f3}.settings-group h2{margin:0 0 6px;font-size:14px}.settings-help{margin:3px 0;color:#71808b;font-size:12px}
  .settings-group button{min-height:34px;padding:6px 10px;border:1px solid #dce5eb;border-radius:8px;background:white;color:#536575;font:13px system-ui,sans-serif;cursor:pointer}
  #connection-sources{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}.connection-chip{padding:6px 8px;border-radius:8px;background:#f0f4f5;font-size:12px;user-select:text}.connection-chip.connection-missing{color:#8a5555;background:#f8eeee}.connection-chip.connection-stale{color:#75633b;background:#f8f3e7}.connection-chip.connection-active{color:#2d7258;background:#e9f5ef}
  #connection-form{display:grid;grid-template-columns:minmax(0,1fr);gap:7px}#connection-source,#connection-path,#connection-form button,#connection-reset{min-height:36px;padding:6px 9px;border:1px solid #d9e2e8;border-radius:8px;background:white;color:#263746;font:13px system-ui,sans-serif}#connection-path-row{display:flex;gap:7px;min-width:0}#connection-path{flex:1;min-width:0;user-select:text}#connection-form button{flex:0 0 auto;border:0;background:#45a58a;color:white;cursor:pointer}#connection-reset{display:block;min-height:34px;margin:7px 0 0 auto;color:#536575;cursor:pointer}
  #connection-message{min-height:17px;margin-top:5px;color:#71808b;font-size:12px;user-select:text}#connection-explanation{margin:2px 0 7px;color:#687985;font-size:12px;user-select:text}
  #settings-shortcuts p{margin:3px 0;font-size:12px}#settings-version{margin:8px 0 0;color:#71808b;font-size:12px}
`;

const PIP_TOOLBAR_STYLE = `
  #widget-toolbar{position:absolute;z-index:50;top:8px;right:8px;display:flex;align-items:center;gap:5px;padding:5px;background:rgba(255,255,255,.9);border:1px solid rgba(220,229,235,.9);border-radius:11px;box-shadow:0 3px 12px rgba(38,52,59,.2);opacity:0;pointer-events:none;transition:opacity 150ms ease}
  #widget-toolbar.visible{opacity:1;pointer-events:auto}#widget-toolbar button{height:34px;min-width:34px;padding:0 8px;border:1px solid #dce5eb;border-radius:8px;background:#fff;color:#536575;font:13px/1.1 system-ui,sans-serif;white-space:nowrap;cursor:pointer}
  #widget-toolbar button:hover{background:#f2f8f6}#widget-toolbar button[aria-pressed=true]{background:#e9f6f0;color:#357d66;border-color:#b9dfcf}
  #widget-toolbar #widget-mode-button{min-width:84px}#widget-toolbar #widget-close-button{min-width:66px}
`;

function toolbarMarkup(desktop) {
  const button = (id, icon, label, aria, extra = '') => `<button id="${id}" type="button" aria-label="${aria}" title="${aria}" ${extra}><span aria-hidden="true">${icon}</span><span class="toolbar-label">${label}</span></button>`;
  return [
    button('widget-mode-button', '▤', '전환', '미니 보기로 전환', 'aria-controls="pip-office pip-mini"'),
    '<span class="toolbar-divider" aria-hidden="true"></span>',
    button('widget-theme-button', '✦', '테마', '테마 순환'),
    button('widget-rotate-button', '⟳', '회전', '시점 회전'),
    button('widget-opacity-button', '◐', '투명도', '투명도 설정 열기', 'aria-controls="opacity-popover" aria-expanded="false"'),
    '<span class="toolbar-divider" aria-hidden="true"></span>',
    button('widget-pin-button', '📍', '핀', desktop ? '마우스 통과 켜기' : '마우스 통과는 데스크톱 앱에서 사용할 수 있음', desktop ? 'aria-pressed="false"' : 'disabled aria-disabled="true"'),
    button('widget-settings-button', '⚙', '설정', '설정 열기', 'aria-controls="widget-settings" aria-expanded="false"'),
    button('widget-close-button', '×', '숨기기', desktop ? '위젯 숨기기' : '위젯 닫기')
  ].join('');
}

function installOpacityPopover(doc, opacity, onOpacityChange) {
  const popover = doc.createElement('section');
  popover.id = 'opacity-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', '투명도 설정');
  popover.innerHTML = '<h2>투명도</h2><label>배경 <input id="background-opacity" type="range" min="0" max="100" aria-label="배경 투명도"><output></output></label><label>전체 <input id="overall-opacity" type="range" min="30" max="100" aria-label="전체 투명도"><output></output></label><label class="auto-dim"><input id="auto-dim" type="checkbox"> 자동 흐림</label>';
  doc.body.append(popover);
  for (const [key, id] of [['background', 'background-opacity'], ['overall', 'overall-opacity']]) {
    const input = popover.querySelector(`#${id}`);
    input.value = String(opacity[key]);
    const output = input.nextElementSibling;
    output.value = `${input.value}%`;
    output.textContent = `${input.value}%`;
    input.addEventListener('input', () => {
      output.value = `${input.value}%`;
      output.textContent = `${input.value}%`;
      onOpacityChange({ [key]: Number(input.value) });
    });
  }
  const autoDim = popover.querySelector('#auto-dim');
  autoDim.checked = opacity.autoDim === true;
  autoDim.addEventListener('change', () => onOpacityChange({ autoDim: autoDim.checked }));
  return popover;
}

export function installWidgetChrome(doc, {
  onMode, onClose, onRotate = null, onThemeCycle = null, onHoverChange = () => {}, resizeWindow = () => {},
  initialMode = 'office', desktop = false, settingsEnabled = false, onSettingsClose = () => {},
  onOpacityChange = () => {}, onPassthroughToggle = () => {}, passthrough = false,
  opacity = { background: 100, overall: 100, autoDim: false }
}) {
  const style = doc.createElement('style');
  style.textContent = settingsEnabled ? TOOLBAR_STYLE : PIP_TOOLBAR_STYLE;
  doc.head.append(style);
  const toolbar = doc.createElement('nav');
  toolbar.id = 'widget-toolbar';
  toolbar.setAttribute('aria-label', '위젯 도구');
  toolbar.innerHTML = settingsEnabled
    ? toolbarMarkup(desktop)
    : '<button id="widget-mode-button" type="button" aria-label="미니 보기로 전환" aria-controls="pip-office pip-mini"><span aria-hidden="true">▤</span> <span id="widget-mode-label">미니</span></button><button id="widget-rotate-button" type="button" aria-label="시점 회전">⟳</button><button id="widget-theme-button" type="button" aria-label="테마 순환">✦</button><button id="widget-close-button" type="button" aria-label="위젯 닫기">×</button>';
  doc.body.append(toolbar);
  toolbar.classList.toggle('wide', settingsEnabled && toolbarLabelsVisible(doc.documentElement.clientWidth));
  const pinHint = doc.createElement('div');
  pinHint.id = 'widget-pin-hint';
  pinHint.hidden = true;
  pinHint.textContent = '클릭 통과 중';
  doc.body.append(pinHint);
  const actionHint = doc.createElement('div');
  actionHint.id = 'widget-action-hint';
  actionHint.hidden = true;
  actionHint.setAttribute('role', 'status');
  doc.body.append(actionHint);
  const opacityPopover = settingsEnabled ? installOpacityPopover(doc, opacity, onOpacityChange) : null;
  let opacityOpen = false;
  let settingsOpen = false;
  let pinEnabledAt = passthrough ? Date.now() : null;
  let pinHintTimer = null;
  let actionHintTimer = null;
  let hideTimer = null;
  const settingsPanel = settingsEnabled ? doc.querySelector('#widget-settings') : null;
  const settingsButton = toolbar.querySelector('#widget-settings-button');
  const opacityButton = toolbar.querySelector('#widget-opacity-button');

  function updateToolbarLabels() {
    toolbar.classList.toggle('wide', settingsEnabled && toolbarLabelsVisible(doc.documentElement.clientWidth));
  }
  const ResizeObserverType = doc.defaultView.ResizeObserver;
  const resizeObserver = settingsEnabled && ResizeObserverType ? new ResizeObserverType(updateToolbarLabels) : null;
  resizeObserver?.observe(doc.documentElement);

  function closeOpacityPopover() {
    opacityOpen = opacityPopoverState(opacityOpen, 'close');
    if (opacityPopover) opacityPopover.hidden = !opacityOpen;
    opacityButton?.setAttribute('aria-expanded', String(opacityOpen));
    const label = opacityOpen ? '투명도 설정 닫기' : '투명도 설정 열기';
    opacityButton?.setAttribute('aria-label', label);
    if (opacityButton) opacityButton.title = label;
  }
  function toggleOpacityPopover() {
    opacityOpen = opacityPopoverState(opacityOpen, 'toggle');
    opacityPopover.hidden = !opacityOpen;
    opacityButton.setAttribute('aria-expanded', String(opacityOpen));
    const label = opacityOpen ? '투명도 설정 닫기' : '투명도 설정 열기';
    opacityButton.setAttribute('aria-label', label);
    opacityButton.title = label;
    if (opacityOpen) opacityPopover.querySelector('#background-opacity')?.focus();
  }

  function setMode(mode) {
    const office = mode === 'office';
    const officeHost = doc.querySelector('#pip-office');
    const miniHost = doc.querySelector('#pip-mini');
    doc.body.classList.toggle('mini-mode', !office);
    officeHost.hidden = !office;
    officeHost.style.display = office ? 'block' : 'none';
    officeHost.inert = !office;
    officeHost.setAttribute('aria-hidden', String(!office));
    miniHost.hidden = office;
    miniHost.style.display = office ? 'none' : 'flex';
    miniHost.inert = office;
    miniHost.setAttribute('aria-hidden', String(office));
    const nextLabel = office ? '미니' : '오피스';
    const modeButton = toolbar.querySelector('#widget-mode-button');
    const pipModeLabel = modeButton.querySelector('#widget-mode-label');
    if (pipModeLabel) pipModeLabel.textContent = nextLabel;
    modeButton.setAttribute('aria-label', `${nextLabel} 보기로 전환`);
    modeButton.title = `${nextLabel} 보기로 전환`;
    modeButton.setAttribute('aria-pressed', String(!office));
    if (!settingsOpen) resizeWindow(office ? 'office' : 'mini');
    onMode(mode, officeHost);
  }

  function closeSettings() {
    if (!settingsPanel || !settingsOpen) return;
    settingsOpen = settingsPanelState(settingsOpen, 'close');
    settingsPanel.hidden = true;
    settingsPanel.inert = true;
    settingsPanel.setAttribute('aria-hidden', 'true');
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.setAttribute('aria-label', '설정 열기');
    settingsButton.title = '설정 열기';
    onSettingsClose();
    settingsButton.focus();
  }
  function openSettings(section = null) {
    if (!settingsPanel) return;
    closeOpacityPopover();
    settingsOpen = settingsPanelState(settingsOpen, 'open');
    settingsPanel.hidden = false;
    settingsPanel.inert = false;
    settingsPanel.setAttribute('aria-hidden', 'false');
    settingsButton.setAttribute('aria-expanded', 'true');
    settingsButton.setAttribute('aria-label', '설정 닫기');
    settingsButton.title = '설정 닫기';
    const target = section === 'connection' ? doc.querySelector('#connection-screen') : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      doc.querySelector('#connection-source')?.focus();
    } else doc.querySelector('#settings-close')?.focus();
  }

  if (settingsPanel) {
    settingsPanel.hidden = true;
    settingsPanel.inert = true;
    settingsPanel.setAttribute('aria-hidden', 'true');
    doc.querySelector('#settings-close')?.addEventListener('click', closeSettings);
    settingsButton.addEventListener('click', () => settingsOpen ? closeSettings() : openSettings());
  }

  function showHint(text) {
    const value = typeof text === 'string' ? text : '';
    if (actionHintTimer !== null) doc.defaultView.clearTimeout(actionHintTimer);
    actionHint.textContent = value;
    actionHint.hidden = !transientHint(value, Date.now(), Date.now());
    if (value) actionHintTimer = doc.defaultView.setTimeout(() => { actionHint.hidden = true; actionHintTimer = null; }, 1500);
  }
  function setPinHint(enabled, resetClock = true) {
    if (resetClock) pinEnabledAt = enabled ? Date.now() : null;
    if (pinHintTimer !== null) doc.defaultView.clearTimeout(pinHintTimer);
    pinHintTimer = null;
    pinHint.hidden = !pinHintVisible(enabled, pinEnabledAt, Date.now());
    if (!pinHint.hidden) pinHintTimer = doc.defaultView.setTimeout(() => { pinHint.hidden = true; pinHintTimer = null; }, 2500);
  }
  function setPassthrough(enabled) {
    const pinButton = toolbar.querySelector('#widget-pin-button');
    if (!pinButton || pinButton.disabled) return;
    const active = enabled === true;
    const wasActive = toolbar.classList.contains('pin-active');
    toolbar.classList.toggle('pin-active', active);
    pinButton.setAttribute('aria-pressed', String(active));
    pinButton.setAttribute('aria-label', active ? '마우스 통과 끄기' : '마우스 통과 켜기');
    pinButton.title = active ? '마우스 통과 끄기' : '마우스 통과 켜기';
    pinButton.querySelector('[aria-hidden="true"]').textContent = active ? '📌' : '📍';
    setPinHint(active, !wasActive);
  }

  function reveal() {
    if (hideTimer !== null) doc.defaultView.clearTimeout(hideTimer);
    hideTimer = null;
    toolbar.classList.add('visible');
    onHoverChange(true);
  }
  function delayHide() {
    if (hideTimer !== null) doc.defaultView.clearTimeout(hideTimer);
    hideTimer = doc.defaultView.setTimeout(() => {
      toolbar.classList.remove('visible');
      hideTimer = null;
      onHoverChange(false);
    }, 1500);
  }

  toolbar.querySelector('#widget-mode-button').addEventListener('click', () => { closeOpacityPopover(); setMode(doc.body.classList.contains('mini-mode') ? 'office' : 'mini'); });
  toolbar.querySelector('#widget-close-button').addEventListener('click', () => { closeOpacityPopover(); onClose(); });
  toolbar.querySelector('#widget-pin-button')?.addEventListener('click', () => { closeOpacityPopover(); onPassthroughToggle(); });
  toolbar.querySelector('#widget-rotate-button')?.addEventListener('click', () => {
    closeOpacityPopover();
    const angle = onRotate?.(1);
    if (settingsEnabled) showHint(`${angle ?? ''}°`);
  });
  toolbar.querySelector('#widget-theme-button')?.addEventListener('click', () => {
    closeOpacityPopover();
    const theme = onThemeCycle?.();
    if (settingsEnabled) showHint(theme ?? '');
  });
  opacityButton?.addEventListener('click', toggleOpacityPopover);
  settingsButton?.addEventListener('click', closeOpacityPopover);
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (opacityOpen) { event.preventDefault(); closeOpacityPopover(); opacityButton?.focus(); }
    else if (settingsOpen) { event.preventDefault(); closeSettings(); }
  });
  doc.documentElement.addEventListener('pointerenter', reveal);
  doc.documentElement.addEventListener('pointermove', reveal);
  doc.documentElement.addEventListener('pointerleave', delayHide);
  setPassthrough(passthrough);
  setMode(initialMode);
  return {
    setMode, setPassthrough, openSettings, closeSettings, closeOpacityPopover,
    setDimFactor(factor) { toolbar.style.setProperty('--widget-dim-factor', String(factor)); },
    toolbar,
    destroy() {
      if (hideTimer !== null) doc.defaultView.clearTimeout(hideTimer);
      if (pinHintTimer !== null) doc.defaultView.clearTimeout(pinHintTimer);
      if (actionHintTimer !== null) doc.defaultView.clearTimeout(actionHintTimer);
      resizeObserver?.disconnect();
      toolbar.remove(); pinHint.remove(); actionHint.remove(); opacityPopover?.remove(); style.remove();
    }
  };
}
