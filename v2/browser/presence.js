// Passers-by (ADR-020). Exhibition only: while nobody is playing, the litter notices people
// walking past the screen. ml5 BodyPose finds people; only each person's horizontal
// position and apparent size (shoulder width) are passed on. No frames, faces or poses
// are kept, and the camera is released the moment a visitor starts.
//
// `demo` mode plays a passer-by crossing the screen, for testing without a camera.

const ML5_URL = 'https://unpkg.com/ml5@1.4.0/dist/ml5.min.js';

export class PassersBy {
  constructor({ demo = false, send }) {
    this.demo = demo;
    this.send = send;
    this.status = 'off';
    this.people = [];
    this.lastSent = 0;
  }

  async start() {
    if (this.status !== 'off') return;
    this.status = 'starting';
    if (this.demo) { this.status = 'on'; this.t0 = performance.now(); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      this.video = Object.assign(document.createElement('video'), { playsInline: true, muted: true, width: 640, height: 480, srcObject: this.stream });
      await this.video.play();
      if (!window.ml5) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = ML5_URL; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      this.model = await new Promise((res) => { const m = window.ml5.bodyPose('MoveNet', { modelType: 'MULTIPOSE_LIGHTNING' }, () => res(m)); });
      if (this.status !== 'starting') { this.stop(); return; }
      this.model.detectStart(this.video, (poses) => this.read(poses));
      this.status = 'on';
    } catch { this.stop(); this.status = 'failed'; }
  }

  read(poses) {
    this.people = (poses ?? []).map((p) => {
      const l = p.keypoints?.find((k) => k.name === 'left_shoulder'), r = p.keypoints?.find((k) => k.name === 'right_shoulder');
      if (!l || !r || l.confidence < 0.3 || r.confidence < 0.3) return null;
      return { x: 1 - (l.x + r.x) / 2 / 640, size: Math.abs(l.x - r.x) / 640 }; // mirrored, like the hand camera
    }).filter(Boolean);
  }

  // Runs every frame from the page: watch only on the attract screen.
  update(snap, now) {
    const attract = snap.sessionState === 'ATTRACT';
    if (attract && this.status === 'off') this.start();
    if (!attract && this.status !== 'off' && this.status !== 'failed') { this.stop(); return; }
    if (this.status !== 'on' || now - this.lastSent < 250) return;
    this.lastSent = now;
    if (this.demo) { // someone strolls across every 18 s, taking 7 s
      const t = ((now - this.t0) / 1000) % 18;
      this.people = t < 7 ? [{ x: 0.08 + (t / 7) * 0.84, size: 0.24 }] : [];
    }
    this.send(this.people);
  }

  stop() {
    try { this.model?.detectStop(); } catch { /* not started */ }
    if (this.stream) for (const tr of this.stream.getTracks()) tr.stop();
    this.stream = null; this.video = null; this.model = null; this.people = [];
    if (this.status !== 'failed') this.status = 'off';
  }
}
