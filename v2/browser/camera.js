// Video frames are transferred to a local worker and never recorded or uploaded.
const START_TIMEOUT_MS = 25000;
const PALM = [0, 5, 9, 13, 17];
const TIPS = [8, 12, 16, 20];
const CROP = 0.1;
const HOLD_MS = 300; // how long the drawn hand survives a missed detection
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const centroid = (points) => ({
  x: PALM.reduce((sum, i) => sum + points[i].x, 0) / PALM.length,
  y: PALM.reduce((sum, i) => sum + points[i].y, 0) / PALM.length,
});

export class CameraInput {
  constructor() {
    this.run = 0;
    this.seq = 0;
    this.stop();
  }

  async start() {
    this.stop();
    const run = this.run;
    this.status = 'loading';
    if (!window.isSecureContext) return this.fail('insecure');
    if (!navigator.mediaDevices?.getUserMedia) return this.fail('no_device');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      });
    } catch (e) {
      if (run !== this.run) return;
      return this.fail(e.name === 'NotReadableError' ? 'in_use'
        : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'no_device' : 'denied');
    }
    if (run !== this.run) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    this.stream = stream;
    this.timer = setTimeout(() => this.fail('library'), START_TIMEOUT_MS);
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (run === this.run) this.fail('disconnected');
    });
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    this.video = video;
    try {
      await video.play();
      if (run !== this.run) return;
      const worker = new Worker(new URL('./hand-worker.js', import.meta.url));
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (run !== this.run) return;
        if (data.type === 'error') return this.fail('library');
        if (data.type === 'ready') {
          clearTimeout(this.timer);
          this.status = 'ready';
        } else {
          this.onHands(data);
        }
        this.nextFrame(run);
      };
      worker.onerror = () => { if (run === this.run) this.fail('library'); };
      worker.postMessage({ type: 'start' });
    } catch {
      if (run === this.run) this.fail('library');
    }
  }

  nextFrame(run) {
    const video = this.video;
    const send = async (time) => {
      if (run !== this.run) return;
      try {
        const frame = await createImageBitmap(video);
        if (run !== this.run) return frame.close();
        this.worker.postMessage({ type: 'frame', frame, time }, [frame]);
      } catch {
        if (run === this.run) this.fail('library');
      }
    };
    if (video.requestVideoFrameCallback && !document.hidden) video.requestVideoFrameCallback(send);
    else requestAnimationFrame(send);
  }

  onHands({ landmarks, worldLandmarks, width, height, time }) {
    const hands = landmarks.map((points, i) => ({ points, world: worldLandmarks?.[i] }))
      .filter(({ points }) => points.length === 21 && points.every((k) => Number.isFinite(k.x) && Number.isFinite(k.y)));
    this.multiHand = hands.length > 1;
    const sample = { t: time, seq: ++this.seq, source: 'camera', present: hands.length > 0 };
    if (!hands.length) {
      this.sample = sample;
      // keep drawing the last hand briefly: one missed frame should not make it blink
      if (this.visualTime === null || time - this.visualTime > HOLD_MS) { this.keypoints = null; this.raw = null; this.visualTime = null; }
      return;
    }

    // Keep the nearest previously tracked palm. Two equally plausible hands are uncertain.
    for (const hand of hands) hand.center = centroid(hand.points);
    if (this.prev && time - this.prev.time > 500) this.prev = null;
    if (this.prev) hands.sort((a, b) => dist(a.center, this.prev) - dist(b.center, this.prev));
    const [hand, other] = hands;
    if (other && (!this.prev || Math.abs(dist(hand.center, this.prev) - dist(other.center, this.prev)) < 0.05)) {
      this.sample = sample;
      this.keypoints = null;
      this.visualTime = null;
      return;
    }
    this.prev = { ...hand.center, time };
    const raw = hand.points.map((k) => ({ x: k.x * width, y: k.y * height }));
    const palm = dist(raw[0], raw[9]);
    const center = centroid(raw);
    const spread = TIPS.reduce((sum, i) => sum + dist(raw[i], center), 0) / TIPS.length;
    const normal = hand.points.map((k) => ({
      x: (1 - k.x - CROP) / (1 - 2 * CROP),
      y: (k.y - CROP) / (1 - 2 * CROP),
    }));
    const c = centroid(normal);
    // Smooth the drawn hand more when it is still. The recognizer receives the actual sample.
    const previous = this.keypoints;
    const dt = Math.max((time - (this.visualTime ?? time)) / 1000, 1 / 120);
    const movement = previous ? dist(c, centroid(previous)) : 0;
    const alpha = !previous || dt > 0.2 || movement > 0.25 ? 1
      : 1 - Math.exp(-2 * Math.PI * (4 + Math.min(22, 4 * movement / dt)) * dt);
    this.raw = hand.points.map((k) => ({ x: k.x, y: k.y })); // camera space, for the preview window
    this.keypoints = normal.map((point, i) => previous ? ({
      x: previous[i].x + alpha * (point.x - previous[i].x),
      y: previous[i].y + alpha * (point.y - previous[i].y),
    }) : point);
    this.visualTime = time;
    this.sample = { ...sample, x: c.x, y: c.y, handScale: palm / (Math.min(width, height) * (1 - 2 * CROP)),
      open: Math.max(0, Math.min(1, (spread / Math.max(palm, 1) - 0.9) / 0.7)),
      pinchRatio: dist(raw[4], raw[8]) / Math.max(palm, 1), keypointCount: 21,
      keypoints: normal, keypoints3D: hand.world ?? null };
  }

  take() { const sample = this.sample; this.sample = null; return sample; }

  fail(kind) { this.stop(); this.status = 'failed'; this.error = kind; }

  stop() {
    this.run++;
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.status = 'off';
    this.error = null;
    this.sample = null;
    this.keypoints = null;
    this.raw = null;
    this.visualTime = null;
    this.prev = null;
    this.multiHand = false;
  }
}

export const CAMERA_ERRORS = {
  en: {
    denied: 'Camera permission was declined. You can carry on with the mouse.',
    no_device: 'No camera was found. You can carry on with the mouse.',
    in_use: 'The camera is busy in another app. You can carry on with the mouse.',
    library: 'Hand tracking could not load. Try again or use the mouse.',
    timeout: 'No steady hand was found in time. Try again or use the mouse.',
    insecure: 'Hand tracking needs a secure page. You can carry on with the mouse.',
    disconnected: 'The camera disconnected. You can carry on with the mouse.',
  },
};
