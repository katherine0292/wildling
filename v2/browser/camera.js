// Camera input adapter (PRD V2 F2-01, F2-02).
//  • the camera is requested only after the visitor chooses hand tracking, video only
//  • every failure has its own actionable message and an immediate mouse fallback
//  • 12 s without a usable video or model counts as a failure
//  • stop() ends every MediaStream track and the detection loop
//  • mirroring happens here, once; nothing downstream mirrors again
// Video frames stay in memory in this tab. Nothing is recorded or uploaded — but the
// browser still asks for camera permission, and the copy says so.

const ML5_URL = 'https://unpkg.com/ml5@1.4.0/dist/ml5.min.js';
const TIMEOUT_MS = 12000;
const PALM = [0, 5, 9, 13, 17];
const TIPS = [8, 12, 16, 20];
const CROP = 0.1; // use the middle 80 % of the frame so edges are reachable

function loadScript(src) {
  if (window.ml5) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('library'));
    document.head.appendChild(s);
  });
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class CameraInput {
  constructor() {
    this.status = 'off';      // off · loading · ready · failed
    this.error = null;        // denied · no_device · in_use · library · timeout · insecure
    this.sample = null;
    this.keypoints = null;    // normalised, for the optional skeleton overlay
    this.multiHand = false;
    this.seq = 0;
    this.prev = null;
  }

  async start() {
    this.status = 'loading';
    this.error = null;
    if (!window.isSecureContext) return this.fail('insecure');
    const timer = setTimeout(() => { if (this.status === 'loading') this.fail('timeout'); }, TIMEOUT_MS);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    } catch (e) {
      clearTimeout(timer);
      const kind = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied'
        : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'no_device'
        : e.name === 'NotReadableError' ? 'in_use' : 'denied';
      return this.fail(kind);
    }
    if (this.status !== 'loading') { this.stopTracks(); return; }
    this.video = document.createElement('video');
    this.video.playsInline = true; this.video.muted = true;
    this.video.width = 640; this.video.height = 480;
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
      await loadScript(ML5_URL);
      this.model = await new Promise((resolve, reject) => {
        const m = window.ml5.handPose({ maxHands: 2, flipped: false }, () => resolve(m));
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
      });
    } catch (e) {
      clearTimeout(timer);
      return this.fail(e.message === 'timeout' ? 'timeout' : 'library');
    }
    clearTimeout(timer);
    if (this.status !== 'loading') { this.stop(); return; }
    this.status = 'ready';
    this.model.detectStart(this.video, (r) => this.onHands(r));
  }

  fail(kind) { this.status = 'failed'; this.error = kind; this.stopTracks(); }

  onHands(results) {
    const t = performance.now();
    if (!results || !results.length) { this.sample = { t, seq: ++this.seq, source: 'camera', present: false }; this.keypoints = null; return; }
    // keep following the same hand; never jump to a bystander's hand
    const norm = results.map((h) => h.keypoints.map((k) => ({
      x: (1 - k.x / 640 - CROP) / (1 - 2 * CROP),
      y: (k.y / 480 - CROP) / (1 - 2 * CROP),
    })));
    const centre = (kp) => ({ x: PALM.reduce((s, i) => s + kp[i].x, 0) / PALM.length, y: PALM.reduce((s, i) => s + kp[i].y, 0) / PALM.length });
    let pick = 0;
    this.multiHand = norm.length > 1;
    if (norm.length > 1 && this.prev) {
      const ds = norm.map((kp) => d2(centre(kp), this.prev));
      pick = ds[0] <= ds[1] ? 0 : 1;
      if (Math.abs(ds[0] - ds[1]) < 0.05) { this.sample = { t, seq: ++this.seq, source: 'camera', present: true, x: NaN, y: NaN }; return; }
    }
    const kp = norm[pick];
    const c = centre(kp);
    this.prev = c;
    const raw = results[pick].keypoints;
    const px = (i) => ({ x: raw[i].x, y: raw[i].y });
    const palmPx = d2(px(0), px(9));
    const shortSidePx = 480 * (1 - 2 * CROP);
    const handScale = palmPx / shortSidePx;
    const tips = TIPS.reduce((s, i) => s + d2(px(i), { x: PALM.reduce((a, j) => a + raw[j].x, 0) / 5, y: PALM.reduce((a, j) => a + raw[j].y, 0) / 5 }), 0) / TIPS.length;
    const open = Math.max(0, Math.min(1, (tips / Math.max(palmPx, 1) - 0.9) / 0.7));
    const finite = raw.length === 21 && raw.every((k) => Number.isFinite(k.x) && Number.isFinite(k.y));
    this.keypoints = kp;
    this.sample = {
      t, seq: ++this.seq, source: 'camera', present: true,
      x: c.x, y: c.y,
      handScale, open,
      pinchRatio: d2(px(4), px(8)) / Math.max(palmPx, 1),
      keypointCount: finite ? 21 : 0,
    };
  }

  // Returns the newest sample once; the track ages it out if the model stalls.
  take() { const s = this.sample; this.sample = null; return s; }

  stopTracks() {
    if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
    this.stream = null;
  }

  stop() {
    try { this.model?.detectStop(); } catch { /* model may not have started */ }
    this.stopTracks();
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.status = 'off';
    this.sample = null;
    this.keypoints = null;
    this.prev = null;
  }
}

export const CAMERA_ERRORS = {
  en: {
    denied: 'Camera permission was declined. You can carry on with the mouse.',
    no_device: 'No camera was found. You can carry on with the mouse.',
    in_use: 'The camera is busy in another app. You can carry on with the mouse.',
    library: 'Hand tracking could not load. You can carry on with the mouse.',
    timeout: 'Hand tracking is taking too long. You can carry on with the mouse.',
    insecure: 'The camera needs https or localhost. You can carry on with the mouse.',
  },
};
