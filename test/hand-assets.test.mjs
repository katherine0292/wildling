import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHandAssets } from '../v2/browser/hand-assets.js';

const base = new URL('https://example.test/v2/vendor/mediapipe/');
const files = { wasmLoaderPath: new URL('wasm/vision_wasm_internal.js', base).href,
  wasmBinaryPath: new URL('wasm/vision_wasm_internal.wasm', base).href };
const wasm = new Uint8Array(9574032);
wasm.set([0, 97, 115, 109, 1, 0, 0, 0]);
const model = new Uint8Array(7819105);
model.set([0, 0, 80, 75, 3, 4]);
const total = wasm.byteLength + model.byteLength;

function streamResponse(bytes) {
  return new Response(new ReadableStream({ start(controller) {
    const middle = Math.floor(bytes.byteLength / 2);
    controller.enqueue(bytes.subarray(0, middle));
    controller.enqueue(new Uint8Array()); // An empty chunk must not produce progress.
    controller.enqueue(bytes.subarray(middle));
    controller.close();
  } }), { headers: { 'Content-Length': '1' } }); // Decoded bytes, not this header, set the size.
}
function fakeURLs() {
  const created = [], revoked = [];
  return { created, revoked,
    createObjectURL(blob) { created.push(blob); return `blob:hand-assets-${created.length}`; },
    revokeObjectURL(url) { revoked.push(url); } };
}
function memoryCache() {
  const entries = new Map(), puts = [], deleted = [], opened = [];
  const cache = {
    async match(url) { return entries.get(url)?.clone(); },
    async put(url, response) { puts.push(url); entries.set(url, response.clone()); },
    async delete(url) { deleted.push(url); return entries.delete(url); },
  };
  return { entries, puts, deleted, opened,
    async open(name) { opened.push(name); return cache; } };
}
function assetFetch(calls = []) {
  return async (url) => { calls.push(url); return streamResponse(url.endsWith('.wasm') ? wasm : model); };
}

test('streams real combined progress, caches complete assets, and releases its WASM URL once', async () => {
  const progress = [], calls = [], cacheStorage = memoryCache(), URL = fakeURLs();
  const loaded = await loadHandAssets(files, base, p => progress.push(p), {
    fetchImpl: assetFetch(calls), cacheStorage, URL,
  });
  assert.equal(calls.length, 2);
  assert.equal(progress.length, 4, 'only nonempty byte chunks report progress');
  assert.ok(progress.every((p, i) => p.phase === 'download' && p.total === total
    && p.loaded > (i ? progress[i - 1].loaded : 0)));
  assert.equal(progress.at(-1).loaded, total);
  assert.equal(loaded.files.wasmLoaderPath, files.wasmLoaderPath);
  assert.equal(loaded.files.wasmBinaryPath, 'blob:hand-assets-1');
  assert.ok(loaded.modelAssetBuffer instanceof Uint8Array);
  assert.equal(loaded.modelAssetBuffer.byteLength, model.byteLength);
  assert.equal(URL.created[0].type, 'application/wasm');
  assert.equal(URL.created[0].size, wasm.byteLength);
  assert.equal(cacheStorage.puts.length, 2);
  assert.ok(cacheStorage.opened.every(name => name === 'wildling-hand-assets-0.10.21-float16-v1'));
  loaded.release(); loaded.release();
  assert.deepEqual(URL.revoked, ['blob:hand-assets-1']);

  const fromCache = await loadHandAssets(files, base, undefined, {
    fetchImpl: async () => { throw new Error('cache should avoid the network'); }, cacheStorage, URL,
  });
  assert.equal(fromCache.modelAssetBuffer.byteLength, model.byteLength);
  assert.equal(cacheStorage.puts.length, 2, 'cache hits are not rewritten');
  fromCache.release();
});

test('invalid or truncated cache entries are discarded and fetched again', async () => {
  const cacheStorage = memoryCache(), URL = fakeURLs(), calls = [];
  const wrongMagic = new Uint8Array(wasm.byteLength); wrongMagic.set([60, 104, 116, 109, 108]);
  cacheStorage.entries.set(files.wasmBinaryPath, new Response(wrongMagic));
  cacheStorage.entries.set(new globalThis.URL('hand_landmarker.task', base).href, new Response(model.subarray(0, 100)));
  const loaded = await loadHandAssets(files, base, undefined, { fetchImpl: assetFetch(calls), cacheStorage, URL });
  assert.equal(calls.length, 2);
  assert.equal(cacheStorage.deleted.length, 2);
  assert.equal(cacheStorage.puts.length, 2);
  loaded.release();
});

test('failed requests and incomplete response bodies are never cached', async () => {
  for (const failure of ['http', 'truncated', 'broken', 'html']) {
    const cacheStorage = memoryCache(), URL = fakeURLs();
    const fetchImpl = async url => {
      if (url.endsWith('.wasm')) return streamResponse(wasm);
      if (failure === 'http') return new Response('Unavailable', { status: 503 });
      if (failure === 'truncated') return streamResponse(model.subarray(0, 100));
      if (failure === 'html') {
        const html = new Uint8Array(model.byteLength); html.set([60, 104, 116, 109, 108]);
        return streamResponse(html);
      }
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error('connection lost')); } }));
    };
    await assert.rejects(loadHandAssets(files, base, undefined, { fetchImpl, cacheStorage, URL }),
      /503|Incomplete hand asset|connection lost|unexpected file signature/, failure);
    assert.equal(cacheStorage.puts.length, 0, failure);
    assert.equal(URL.created.length, 0, failure);
  }
});

test('a stalled byte stream times out, aborts its fetch, and does not fake progress', async () => {
  const cacheStorage = memoryCache(), URL = fakeURLs(), progress = [];
  let signal, emptyChunks;
  const fetchImpl = async (url, options) => {
    if (!url.endsWith('.wasm')) return streamResponse(model);
    signal = options.signal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(wasm.subarray(0, 64));
        emptyChunks = setInterval(() => controller.enqueue(new Uint8Array()), 4);
      },
      cancel() { clearInterval(emptyChunks); },
    }));
  };
  await assert.rejects(loadHandAssets(files, base, p => progress.push(p), {
    fetchImpl, cacheStorage, URL, stallTimeoutMs: 20,
  }), { name: 'TimeoutError' });
  assert.equal(signal.aborted, true);
  assert.equal(progress.length, 3, 'one WASM chunk and two model chunks; empty chunks are not progress');
  assert.ok(progress.every((p, i) => p.loaded > (i ? progress[i - 1].loaded : 0)));
  assert.equal(cacheStorage.puts.length, 0);
});

test('the no-data deadline resets when a slow response keeps delivering bytes', async () => {
  const URL = fakeURLs();
  const fetchImpl = async url => {
    if (!url.endsWith('.wasm')) return streamResponse(model);
    return new Response(new ReadableStream({ async start(controller) {
      const quarter = Math.floor(wasm.byteLength / 4);
      for (let i = 0; i < 4; i++) {
        if (i) await new Promise(resolve => setTimeout(resolve, 45));
        controller.enqueue(wasm.subarray(i * quarter, i === 3 ? wasm.byteLength : (i + 1) * quarter));
      }
      controller.close();
    } }));
  };
  const loaded = await loadHandAssets(files, base, undefined, {
    fetchImpl, cacheStorage: null, URL, stallTimeoutMs: 100,
  });
  assert.equal(loaded.modelAssetBuffer.byteLength, model.byteLength);
  loaded.release();
});

test('the resolver-selected non-SIMD binary uses its own validated size', async () => {
  const noSIMD = new Uint8Array(9448638); noSIMD.set(wasm.subarray(0, 8));
  const URL = fakeURLs();
  const selected = { ...files,
    wasmLoaderPath: new globalThis.URL('wasm/vision_wasm_nosimd_internal.js', base).href,
    wasmBinaryPath: new globalThis.URL('wasm/vision_wasm_nosimd_internal.wasm', base).href };
  const loaded = await loadHandAssets(selected, base, undefined, {
    fetchImpl: async url => streamResponse(url.endsWith('.wasm') ? noSIMD : model), cacheStorage: null, URL,
  });
  assert.equal(URL.created[0].size, noSIMD.byteLength);
  assert.equal(loaded.files.wasmLoaderPath, selected.wasmLoaderPath);
  loaded.release();
});

test('a fetch that never produces headers also has a no-data deadline', async () => {
  const progress = [], URL = fakeURLs();
  await assert.rejects(loadHandAssets(files, base, p => progress.push(p), {
    fetchImpl: () => new Promise(() => {}), cacheStorage: null, URL, stallTimeoutMs: 15,
  }), { name: 'TimeoutError' });
  assert.equal(progress.length, 0);
  assert.equal(URL.created.length, 0);
});

test('cache open and write failures do not prevent hand assets from loading', async () => {
  const URL = fakeURLs();
  for (const cacheStorage of [
    { async open() { throw new Error('private browsing'); } },
    { async open() { return { async match() { return null; }, async put() { throw new Error('quota'); } }; } },
  ]) {
    const loaded = await loadHandAssets(files, base, undefined, { fetchImpl: assetFetch(), cacheStorage, URL });
    assert.equal(loaded.modelAssetBuffer.byteLength, model.byteLength);
    loaded.release();
  }
});
