// Classic worker so the MediaPipe WASM loader can use importScripts.
let detector;

self.onmessage = async ({ data }) => {
  if (data.type === 'start') {
    try {
      const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const base = new URL('../vendor/mediapipe/', self.location.href);
      const files = await FilesetResolver.forVisionTasks(new URL('wasm', base).href);
      detector = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('hand_landmarker.task', base).href, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
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
