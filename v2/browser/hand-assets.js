// Versioned, complete model assets only. Frames and camera data never enter this cache.
const CACHE_NAME = 'wildling-hand-assets-0.10.21-float16-v1';
const WASM_SIZES = {
  'vision_wasm_internal.wasm': 9574032,
  'vision_wasm_nosimd_internal.wasm': 9448638,
};
const WASM_MAGIC = [0, 97, 115, 109, 1, 0, 0, 0];
const MODEL_MAGIC = [0, 0, 80, 75, 3, 4];

function validate(bytes, asset) {
  if (bytes.byteLength !== asset.size) {
    throw new Error(`Incomplete hand asset ${asset.name}: expected ${asset.size} bytes, received ${bytes.byteLength}`);
  }
  if (!asset.magic.every((byte, i) => bytes[i] === byte)) {
    throw new Error(`Invalid hand asset ${asset.name}: unexpected file signature`);
  }
}

async function cachedBytes(cache, asset) {
  if (!cache) return null;
  try {
    const response = await cache.match(asset.url);
    if (!response) return null;
    if (!response.ok) throw new Error('Invalid cached response');
    const bytes = new Uint8Array(await response.arrayBuffer());
    validate(bytes, asset);
    return bytes;
  } catch {
    // A partial file, stale HTML response, or unavailable cache must not block a retry.
    try { await cache.delete(asset.url); } catch {}
    return null;
  }
}

async function download(asset, fetchImpl, progress, signal, stallTimeoutMs) {
  const controller = new AbortController();
  let reader, timer, rejectStopped;
  const stopped = new Promise((_, reject) => { rejectStopped = reject; });
  const stop = (error) => {
    clearTimeout(timer);
    controller.abort(error);
    rejectStopped(error);
    if (reader) void reader.cancel(error).catch(() => {});
  };
  const abort = () => stop(signal.reason ?? new Error('Hand asset download cancelled'));
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const error = new Error(`Hand asset ${asset.name} received no data for ${stallTimeoutMs} ms`);
      error.name = 'TimeoutError';
      stop(error);
    }, stallTimeoutMs);
  };
  if (signal.aborted) throw signal.reason;
  signal.addEventListener('abort', abort, { once: true });
  arm();
  try {
    const response = await Promise.race([fetchImpl(asset.url, { signal: controller.signal }), stopped]);
    if (!response.ok) throw new Error(`Hand asset request failed (${response.status}): ${asset.name}`);
    if (!response.body?.getReader) {
      const bytes = new Uint8Array(await Promise.race([response.arrayBuffer(), stopped]));
      validate(bytes, asset);
      progress(bytes.byteLength);
      return bytes;
    }
    reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      if (!value?.byteLength) continue;
      length += value.byteLength;
      if (length > asset.size) throw new Error(`Invalid hand asset ${asset.name}: too many bytes`);
      chunks.push(value);
      progress(value.byteLength);
      arm(); // Empty chunks and an open connection are not download progress.
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    validate(bytes, asset);
    return bytes;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.abort();
    // Failed response bodies should not continue consuming bandwidth in the background.
    if (reader) {
      void reader.cancel().catch(() => {});
      try { reader.releaseLock(); } catch {}
    }
  }
}

export async function loadHandAssets(files, base, onProgress, options = {}) {
  const wasmURL = new URL(files.wasmBinaryPath, base);
  const wasmName = wasmURL.pathname.split('/').pop();
  const wasmSize = WASM_SIZES[wasmName];
  if (!wasmSize) throw new Error(`Unsupported hand WASM asset: ${wasmName}`);
  const assets = [
    { name: wasmName, url: wasmURL.href, size: wasmSize, magic: WASM_MAGIC, type: 'application/wasm' },
    { name: 'hand_landmarker.task', url: new URL('hand_landmarker.task', base).href,
      size: 7819105, magic: MODEL_MAGIC, type: 'application/octet-stream' },
  ];
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const storage = options.cacheStorage === undefined ? globalThis.caches : options.cacheStorage;
  const urlAPI = options.URL ?? globalThis.URL;
  const stallTimeoutMs = options.stallTimeoutMs ?? 30000;
  let cache = null;
  try { cache = await storage?.open(CACHE_NAME); } catch {}
  const controller = new AbortController();
  const total = assets.reduce((sum, asset) => sum + asset.size, 0);
  let loaded = 0;
  const progress = (amount) => {
    if (!amount || controller.signal.aborted) return;
    loaded += amount;
    onProgress?.({ phase: 'download', loaded, total });
  };
  const results = await Promise.all(assets.map(async (asset) => {
    try {
      const cached = await cachedBytes(cache, asset);
      if (controller.signal.aborted) throw controller.signal.reason;
      if (cached) { progress(cached.byteLength); return { bytes: cached, cached: true }; }
      const bytes = await download(asset, fetchImpl, progress, controller.signal, stallTimeoutMs);
      return { bytes, cached: false };
    } catch (error) { controller.abort(error); throw error; }
  }));
  // Do not persist either new response until the entire requested fileset is valid.
  if (cache) await Promise.all(results.map(async (result, i) => {
    if (result.cached) return;
    try {
      await cache.put(assets[i].url, new Response(result.bytes, { headers: {
        'Content-Type': assets[i].type, 'Content-Length': String(result.bytes.byteLength),
      } }));
    } catch {} // Quota limits and private-browsing cache restrictions are non-fatal.
  }));
  const wasmBlobURL = urlAPI.createObjectURL(new Blob([results[0].bytes], { type: 'application/wasm' }));
  let released = false;
  return {
    files: { ...files, wasmBinaryPath: wasmBlobURL },
    modelAssetBuffer: results[1].bytes,
    release() {
      if (released) return;
      released = true;
      urlAPI.revokeObjectURL(wasmBlobURL);
    },
  };
}
