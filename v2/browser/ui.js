// Visitor interface: renders screens, toolbar and hints from the snapshot and turns
// clicks into commands. Short, specific copy; no developer terms; English by default.

import { COPY } from '../core/config.js';
import { CAMERA_ERRORS } from './camera.js';

const TEXT = {
  en: {
    attractEyebrow: 'An interactive piece about learning each other\'s distance',
    attractTag: 'A wild kitten that notices you, chooses for itself, and slowly learns your rhythm.',
    attractPrompt: 'Move closer, or start with a mouse',
    consentTitle: 'How would you like to say hello?',
    consentBody: 'You can use one hand in front of the camera, a mouse, or the keyboard. The cat responds the same way to all three.',
    consentFact1: 'The camera only looks for one hand. Video stays in this browser and is never saved or uploaded.',
    consentFact2: 'Your browser will still ask for camera permission.',
    consentFact3: 'Everything you do here is forgotten when the session ends.',
    useCamera: 'Use my hand (camera)', useMouse: 'Use the mouse', useKeyboard: 'Use the keyboard', back: 'Back',
    calibTitle: 'Hold one open hand inside the circle',
    calibLoading: 'Starting the camera…', calibLooking: 'Looking for your hand…', calibHold: 'Got it. Hold still for a moment…',
    pausedTitle: 'Paused',
    pausedReasons: { user: 'Take your time.', hidden: 'The page was in the background.', idle: 'Nobody seemed to be here.', system: 'Something needs a moment.' },
    continue: 'Continue', switchToMouse: 'Switch to mouse', end: 'End',
    reflectEyebrow: 'Before you go',
    reflectTitles: { grown: 'It grew up with you.', time_limit: 'Time to say goodbye.', idle: 'It noticed you left.', user: 'Thank you for visiting.', pause_timeout: 'Thank you for visiting.' },
    reflectNote: 'This relationship lives only in this session. The next visitor meets a cat that has never met anyone.',
    next: (s) => `Next visitor (${s})`,
    counts: (c) => `${c.fed} fish eaten · ${c.pounces} yarn catches · ${c.contactSec} s of accepted contact`,
    status: { mouse: 'Mouse', keyboard: 'Keyboard · arrows + Space', valid: 'Hand found', uncertain: 'Hold still…', lost: 'Looking for your hand' },
    sound: (on) => (on ? 'Sound on' : 'Sound off'), lang: '中文', endBtn: 'End',
    chapter: (n, phase) => `Chapter ${n} · ${{ kitten: 'Kitten · Jungle', juvenile: 'Juvenile · Snowfields', adult: 'Adult · Desert' }[phase]}`,
    offerEnd: 'Whenever you are ready, you can end here.',
  },
  zh: {
    attractEyebrow: '一件关于“学习彼此距离”的互动作品',
    attractTag: '一只会注意到你、自己做选择、并慢慢熟悉你节奏的小野猫。',
    attractPrompt: '靠近一点，或用鼠标开始',
    consentTitle: '你想怎样和它打招呼？',
    consentBody: '你可以在摄像头前用一只手，也可以用鼠标或键盘。猫对三种方式的回应规则完全相同。',
    consentFact1: '摄像头只用来寻找一只手。画面只留在本浏览器中，不会保存或上传。',
    consentFact2: '浏览器仍然会请求摄像头权限。',
    consentFact3: '本轮结束后，这里发生的一切都会被清除。',
    useCamera: '用手（摄像头）', useMouse: '用鼠标', useKeyboard: '用键盘', back: '返回',
    calibTitle: '请把一只张开的手放进圆圈里',
    calibLoading: '正在启动摄像头…', calibLooking: '正在寻找你的手…', calibHold: '看到了，请保持一下…',
    pausedTitle: '已暂停',
    pausedReasons: { user: '慢慢来。', hidden: '页面切到了后台。', idle: '好像没有人在了。', system: '系统需要一点时间。' },
    continue: '继续', switchToMouse: '改用鼠标', end: '结束',
    reflectEyebrow: '离开之前',
    reflectTitles: { grown: '它和你一起长大了。', time_limit: '该说再见了。', idle: '它发现你离开了。', user: '谢谢你的来访。', pause_timeout: '谢谢你的来访。' },
    reflectNote: '这段关系只存在于本轮。下一位观众会遇到一只从未见过任何人的猫。',
    next: (s) => `下一位（${s}）`,
    counts: (c) => `吃了 ${c.fed} 条鱼 · 抓到毛线球 ${c.pounces} 次 · 被接受的接触 ${c.contactSec} 秒`,
    status: { mouse: '鼠标', keyboard: '键盘 · 方向键 + 空格', valid: '已看到手', uncertain: '请稍停…', lost: '正在寻找你的手' },
    sound: (on) => (on ? '声音开' : '声音关'), lang: 'EN', endBtn: '结束',
    chapter: (n, phase) => `第 ${n} 章 · ${{ kitten: '幼猫 · 丛林', juvenile: '少年 · 雪原', adult: '成年 · 沙漠' }[phase]}`,
    offerEnd: '准备好了随时可以结束。',
  },
};

const TOOLS = ['FEED', 'PLAY', 'PET', 'WAIT'];
const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ dispatch, onChooseInput, onToggleSound, onToggleLang }) {
    this.dispatch = dispatch;
    this.lang = 'en';
    this.toolbar = $('toolbar');
    TOOLS.forEach((tool, i) => {
      const b = document.createElement('button');
      b.dataset.tool = tool;
      if (tool === 'WAIT') b.classList.add('wait');
      b.innerHTML = `<span class="label"></span><kbd>${i + 1}</kbd>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); dispatch({ type: 'select_tool', tool }); });
      this.toolbar.appendChild(b);
    });
    $('btnStart').onclick = () => dispatch({ type: 'start' });
    $('btnCamera').onclick = () => onChooseInput('camera');
    $('btnMouse').onclick = () => onChooseInput('mouse');
    $('btnKeyboard').onclick = () => onChooseInput('keyboard');
    $('btnCalibMouse').onclick = () => onChooseInput('mouse');
    $('btnCancel').onclick = () => dispatch({ type: 'end' });
    $('btnResume').onclick = () => dispatch({ type: 'resume' });
    $('btnSwitch').onclick = () => onChooseInput('mouse');
    $('btnPausedEnd').onclick = () => dispatch({ type: 'end' });
    $('btnEnd').onclick = (e) => { e.stopPropagation(); dispatch({ type: 'end' }); };
    $('btnNext').onclick = () => dispatch({ type: 'next' });
    $('btnSound').onclick = (e) => { e.stopPropagation(); onToggleSound(); };
    $('btnLang').onclick = (e) => { e.stopPropagation(); onToggleLang(); };
    $('btnLangAttract').onclick = () => onToggleLang();
    // "I'm still here" keeps the current tool and simply counts as activity
    $('still').onclick = () => dispatch({ type: 'select_tool', tool: this.activeTool ?? 'FEED' });
    this.lastState = null;
    this.setLang('en');
  }

  get t() { return TEXT[this.lang]; }
  get copy() { return COPY[this.lang]; }

  setLang(lang) {
    this.lang = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    for (const el of document.querySelectorAll('[data-t]')) {
      const v = this.t[el.dataset.t];
      if (typeof v === 'string') el.textContent = v;
    }
    for (const b of this.toolbar.children) b.querySelector('.label').textContent = this.copy.tools[b.dataset.tool];
    $('btnLang').textContent = this.t.lang;
    $('btnLangAttract').textContent = this.t.lang;
    $('btnEnd').textContent = this.t.endBtn;
    $('still').textContent = this.copy.stillThere;
    $('offerEnd').textContent = this.t.offerEnd;
  }

  show(id, on) { $(id).hidden = !on; }

  // extras: { catPx, cursorPx, camera, soundOn, width, height }
  update(snap, x) {
    const st = snap.sessionState;
    if (st !== this.lastState) {
      this.lastState = st;
      this.show('attract', st === 'ATTRACT');
      this.show('consent', st === 'CONSENT');
      this.show('calibrate', st === 'CALIBRATING');
      this.show('paused', st === 'PAUSED');
      this.show('reflection', st === 'REFLECTION');
      this.show('ui', st === 'ACTIVE');
      const focus = { ATTRACT: 'btnStart', CONSENT: 'btnCamera', PAUSED: 'btnResume', REFLECTION: 'btnNext' }[st];
      if (focus) setTimeout(() => $(focus)?.focus({ preventScroll: true }), 0);
    }
    if (st === 'CONSENT') this.consent(x.camera);
    if (st === 'CALIBRATING') this.calibrating(snap, x.camera);
    if (st === 'PAUSED') $('pausedReason').textContent = this.t.pausedReasons[snap.pauseReason] ?? '';
    if (st === 'REFLECTION') this.reflection(snap);
    if (st === 'ACTIVE') this.active(snap, x);
  }

  consent(cam) {
    const err = $('cameraError');
    if (cam.status === 'failed') { err.hidden = false; err.textContent = CAMERA_ERRORS[this.lang][cam.error] ?? ''; }
    else err.hidden = true;
  }

  calibrating(snap, cam) {
    const stable = Math.min(1, (snap.timers.calibStable ?? 0) / 1.5);
    $('calibArc').style.strokeDashoffset = String(289 * (1 - stable));
    $('calibStatus').textContent = cam.status === 'loading' ? this.t.calibLoading
      : stable > 0 ? this.t.calibHold : this.t.calibLooking;
  }

  reflection(snap) {
    const r = snap.recap;
    if (!r) return;
    $('reflectTitle').textContent = this.t.reflectTitles[snap.endReason] ?? this.t.reflectTitles.user;
    const ol = $('recap');
    const html = r.lines.map((l) => `<li>${l.text}<span class="ev">${l.evidence.join(', ') || 'no events'}</span></li>`).join('');
    if (ol.innerHTML !== html) ol.innerHTML = html;
    $('recapCounts').textContent = this.t.counts(r.counts);
    $('btnNext').textContent = this.t.next(Math.ceil(snap.timers.reflectionLeft ?? 0));
  }

  active(snap, x) {
    const c = snap.creature;
    const n = Math.min(3, Math.floor(c.ageProgress) + 1);
    $('chapter').textContent = this.t.chapter(n, c.phase);
    $('relation').textContent = this.copy.relation[c.relation];
    [...document.querySelectorAll('#hud .growth i')].forEach((el, i) => {
      el.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, c.ageProgress - i)) * 100)}%`);
    });

    const status = $('inputStatus');
    const src = snap.input.source;
    const q = src === 'camera' ? snap.input.quality : 'valid';
    status.className = `pill ${q}`;
    status.textContent = src === 'camera' ? this.t.status[q] : this.t.status[src];
    $('btnSound').textContent = this.t.sound(x.soundOn);

    this.activeTool = snap.activeTool;
    for (const b of this.toolbar.children) b.setAttribute('aria-pressed', String(b.dataset.tool === snap.activeTool));
    $('toolHint').textContent = this.copy.toolHints[snap.activeTool];
    this.show('still', snap.stillThere);
    this.show('offerEnd', snap.offerEnd && !snap.stillThere);

    // creature reasons speak from the cat; system reasons speak from the cursor
    const h = snap.displayHint;
    const bubble = $('bubble'), sys = $('sysHint');
    if (h && (h.owner === 'creature' || h.owner === 'result')) {
      bubble.textContent = this.copy[h.code] ?? h.code;
      bubble.className = `show ${h.owner}`;
      bubble.style.left = `${clampX(x.catPx.x, x.width)}px`;
      bubble.style.top = `${Math.max(60, x.catPx.y - x.catPx.r - 14)}px`;
    } else bubble.className = '';
    if (h && h.owner === 'system') {
      sys.textContent = this.copy[h.code] ?? h.code;
      sys.className = 'show';
      const at = x.cursorPx ?? { x: x.width / 2, y: x.height * 0.3 };
      sys.style.left = `${clampX(at.x, x.width)}px`;
      sys.style.top = `${Math.max(70, at.y - 40)}px`;
    } else sys.className = '';
  }
}

function clampX(v, w) { return Math.max(170, Math.min(w - 170, v)); }
