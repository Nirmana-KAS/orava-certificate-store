// Copies the text-reading engine (Tesseract.js, its WebAssembly core, English language data)
// and the PDF renderer's worker into public/ocr, so the admin's browser loads them from this
// site and never from a third-party CDN. Runs before `next dev` and `next build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");

const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(
  createRequire(join(tesseract, "package.json")).resolve("tesseract.js-core/package.json"),
);
const lang = dirname(require.resolve("@tesseract.js-data/eng/package.json"));
const pdfjs = dirname(require.resolve("pdfjs-dist/package.json"));

const files: [string, string][] = [
  [join(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only builds (the engine we use), with and without SIMD; the worker picks one
  ...readdirSync(core)
    .filter((f) => /^tesseract-core(-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(f))
    .map((f): [string, string] => [join(core, f), join("core", f)]),
  [join(lang, "4.0.0_best_int", "eng.traineddata.gz"), join("lang", "eng.traineddata.gz")],
  [join(pdfjs, "build", "pdf.worker.min.mjs"), "pdf.worker.min.mjs"],
];

let copied = 0;
for (const [from, to] of files) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest) && statSync(dest).size === statSync(from).size) continue;
  copyFileSync(from, dest);
  copied++;
}
console.log(
  `OCR assets ready in public/ocr (${copied} updated, ${files.length - copied} unchanged).`,
);
