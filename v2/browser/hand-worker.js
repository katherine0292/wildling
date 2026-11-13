// Classic worker so the MediaPipe WASM loader can use importScripts.
let detector;

self.onmessage = async ({ data }) => {
  if (data.type === 'start') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const base = new URL('../vendor/mediapipe/', self.location.href);
      const files = await FilesetResolver.forVisionTasks(new URL('wasm', base).href);
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: new URL('hand_landmarker.task', base).href, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        // a little more forgiving than the defaults (0.5), so a hand at exhibition distance is kept
        minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
      });
      // the GPU is several times faster where the browser allows it in a worker; the CPU always works
      try { detector = await HandLandmarker.createFromOptions(files, options('GPU')); }
      catch { detector = await HandLandmarker.createFromOptions(files, options('CPU')); }
      self.postMessage({ type: 'ready' });
    } catch {
      self.postMessage({ type: 'error' });
    }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const { landmarks, worldLandmarks } = detector.detectForVideo(data.frame, data.time);
    self.postMessage({ type: 'hands', landmarks, worldLandmarks, time: data.time,
      width: data.frame.width, height: data.frame.height });
  } catch {
    self.postMessage({ type: 'error' });
  } finally {
    data.frame.close();
  }
};
