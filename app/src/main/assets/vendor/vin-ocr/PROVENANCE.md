# Local VIN text recognition

Copied from pinned npm packages recorded with integrity hashes in package-lock.json:

- tesseract.js 6.0.1: tesseract.min.js and worker.min.js; Apache 2.0 (LICENSE.md).
- tesseract.js-core 6.1.2: four WASM-in-JavaScript core variants; Apache 2.0 (CORE-LICENSE.txt).
- @tesseract.js-data/eng 1.0.0, `4.0.0_best_int/eng.traineddata.gz`: English trained data. Package metadata declares MIT; upstream trained data license is Apache 2.0, reproduced in DATA-LICENSE.txt.

Upstream data license: https://github.com/naptha/tessdata/blob/gh-pages/LICENSE

These files are unmodified. Browser OCR uses local worker/core/language paths and
does not send photos to a service. Mobile camera permissions and browser WASM
compatibility still require physical-device acceptance before production release.
