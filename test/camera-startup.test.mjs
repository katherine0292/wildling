import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraInput, cameraLoadingText, CAMERA_ERRORS } from '../v2/browser/camera.js';

function browser(t) {
  let worker, callbacks = 0, stopped = false;
  const video = { play: async () => {}, requestVideoFrameCallback() { callbacks++; } };
  const track = { addEventListener() {}, stop() { stopped = true; } };
  const globals = {
    window: { isSecureContext: true },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getVideoTracks: () => [track] }) } },
    document: { hidden: false, createElement: () => video },
    Worker: class {
      constructor() { worker = this; this.sent = []; }
      postMessage(message) { this.sent.push(message); }
      terminate() { this.terminated = true; }
      emit(data) { this.onmessage({ data }); }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  return { get worker() { return worker; }, get callbacks() { return callbacks; }, get stopped() { return stopped; } };
}

test('camera waits through download progress and requests frames only after ready', async (t) => {
  const env = browser(t), camera = new CameraInput();
  t.after(() => camera.stop());
  await camera.start();
  assert.equal(env.worker.sent[0].progress, true);
  env.worker.emit({ type: 'loading', phase: 'download', loaded: 1024, total: 4096 });
  assert.equal(camera.status, 'loading');
  assert.equal(env.callbacks, 0, 'no frame may be sent to an uninitialized detector');
  assert.match(cameraLoadingText(camera), /25%/);
  env.worker.emit({ type: 'loading', phase: 'initializing' });
  assert.match(cameraLoadingText(camera), /Preparing/);
  assert.equal(env.callbacks, 0);
  env.worker.emit({ type: 'ready', delegate: 'CPU' });
  assert.equal(camera.status, 'ready');
  assert.equal(camera.delegate, 'CPU');
  assert.equal(camera.loading, null);
  assert.equal(env.callbacks, 1);
});

test('a download failure releases the camera and retains an actionable error', async (t) => {
  const env = browser(t), camera = new CameraInput();
  t.after(() => camera.stop());
  await camera.start();
  env.worker.emit({ type: 'error', stage: 'download', message: 'No download progress for 30 seconds' });
  assert.equal(camera.status, 'failed');
  assert.equal(camera.error, 'download');
  assert.match(camera.errorDetail, /30 seconds/);
  assert.ok(CAMERA_ERRORS.en[camera.error]);
  assert.equal(camera.stream, null);
  assert.equal(env.stopped, true);
});

test('late loading events from a stopped worker cannot revive a camera session', async (t) => {
  const env = browser(t), camera = new CameraInput();
  await camera.start();
  const oldWorker = env.worker;
  camera.stop();
  oldWorker.emit({ type: 'loading', phase: 'download', loaded: 1024, total: 4096 });
  oldWorker.emit({ type: 'ready' });
  assert.equal(camera.status, 'off');
  assert.equal(camera.loading, null);
  assert.equal(env.callbacks, 0);
});
