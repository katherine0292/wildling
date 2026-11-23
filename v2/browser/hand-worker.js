// Classic worker so the MediaPipe WASM loader can use importScripts.
let detector;

self.onmessage = async ({ data }) => {
  if (data.type === 'start') {
    let assets, stage = 'library';
    // Older cached camera adapters expect only ready/hands/error messages.
    const progress = (update) => { if (data.progress) self.postMessage({ type: 'loading', ...update }); };
    try {
      progress({ phase: stage });
      const [{ FilesetResolver, HandLandmarker }, { loadHandAssets }] = await Promise.all([
        import('../vendor/mediapipe/vision_bundle.mjs'), import('./hand-assets.js'),
      ]);
      const base = new URL('../vendor/mediapipe/', self.location.href);
      const files = await FilesetResolver.forVisionTasks(new URL('wasm', base).href);
      stage = 'download';
      progress({ phase: stage });
      assets = await loadHandAssets(files, base, progress);
      stage = 'initializing';
      progress({ phase: stage });
      const options = (delegate) => ({
        baseOptions: { modelAssetBuffer: assets.modelAssetBuffer, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        // a little more forgiving than the defaults (0.5), so a hand at exhibition distance is kept
        minHandDetectionConfidence: 0.4, minHandPresenceConfidence: 0.4, minTrackingConfidence: 0.4,
      });
      // Try CPU if the browser cannot initialize the GPU delegate in a worker.
      let delegate = 'GPU';
      try { detector = await HandLandmarker.createFromOptions(assets.files, options(delegate)); }
      catch { delegate = 'CPU'; detector = await HandLandmarker.createFromOptions(assets.files, options(delegate)); }
      self.postMessage({ type: 'ready', delegate });
    } catch (error) {
      self.postMessage({ type: 'error', stage, message: error?.message ?? String(error) });
    } finally {
      assets?.release();
    }
    return;
  }
  if (data.type !== 'frame') return;
  try {
    const { landmarks, worldLandmarks } = detector.detectForVideo(data.frame, data.time);
    self.postMessage({ type: 'hands', landmarks, worldLandmarks, time: data.time,
      width: data.frame.width, height: data.frame.height });
  } catch (error) {
    self.postMessage({ type: 'error', stage: 'inference', message: error?.message ?? String(error) });
  } finally {
    data.frame.close();
  }
};
