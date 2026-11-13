// The camera preview (exhibition feedback): a small mirrored view of what the hand tracker
// sees, with the detected hand drawn on top. Visitors can check at a glance that their hand
// is in frame and found. Frames are drawn to this canvas only; nothing is stored.

const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
const CAPTION = { loading: 'Starting the camera…', valid: 'Hand found', uncertain: 'Hold your hand still', lost: 'Show one open hand', failed: 'Camera off' };

export class CameraPreview {
  constructor(camera) {
    this.camera = camera;
    this.el = document.getElementById('camPreview');
    this.canvas = document.getElementById('camCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.caption = document.getElementById('camCaption');
  }

  // quality: the track's quality when the camera is the input, else null
  update(quality) {
    const cam = this.camera, on = cam.status === 'loading' || cam.status === 'ready';
    this.el.hidden = !on;
    if (!on) return;
    const state = cam.status === 'loading' ? 'loading' : quality ?? 'lost';
    this.el.dataset.state = state;
    if (this.caption.textContent !== CAPTION[state]) this.caption.textContent = CAPTION[state];
    const { ctx, canvas } = this, W = canvas.width, H = canvas.height, v = cam.video;
    ctx.save();
    ctx.fillStyle = '#10160f'; ctx.fillRect(0, 0, W, H);
    ctx.translate(W, 0); ctx.scale(-1, 1); // mirror, so moving right moves right
    if (v && v.readyState >= 2) {
      const s = Math.max(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
      ctx.globalAlpha = 0.85; ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h); ctx.globalAlpha = 1;
    }
    const k = cam.raw;
    if (k) {
      ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = state === 'valid' ? 'rgba(243,206,135,0.95)' : 'rgba(159,214,230,0.95)';
      for (const b of BONES) { ctx.beginPath(); b.forEach((i, n) => (n ? ctx.lineTo(k[i].x * W, k[i].y * H) : ctx.moveTo(k[i].x * W, k[i].y * H))); ctx.stroke(); }
      ctx.fillStyle = '#fff8e8';
      for (const q of k) { ctx.beginPath(); ctx.arc(q.x * W, q.y * H, 3.2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
}
