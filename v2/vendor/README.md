# Vendored libraries

| File | Version | License | Why local |
|---|---|---|---|
| `p5.min.js` | p5.js 1.11.1 | LGPL-2.1 | Offline exhibition build (PRD V2 §8); pinned version, no CDN at runtime |
| `qrcode.js` | qrcode-generator 1.4.4 (Kazuhiko Arase) | MIT (header kept in the file) | Draws the code on the take-home postcard without any network call |

ml5.js (HandPose) is still loaded on demand when the visitor chooses the camera; bundling it and its model weights is part of the offline package milestone (see `docs/STATUS.md`).
