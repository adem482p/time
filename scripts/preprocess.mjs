// scripts/preprocess.mjs — prepare the static inputs the website consumes.
// Runs outside app/: app/ must not concern itself with files outside its own
// directory. The single source of truth is data/time.csv (produced by
// data/extract.py); this script copies it to the location the site reads
// (app/static/time.csv) and syncs root assets/ into app/static/assets/.
//
// Run from the repo root:
//   node scripts/preprocess.mjs
//
// Then `npm run dev` / `npm run build` inside app/ can be run without any
// pre-step that reaches outside app/.
import { cpSync, mkdirSync, existsSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..'); // repository root: data pipeline output
const app = join(root, 'app');

const csvSrc = join(root, 'data', 'time.csv');
const extract = join(root, 'data', 'extract.py');

// ---- time.csv: generate if missing, then copy to site-consumed location ----
// The single source of truth is data/time.csv, produced by data/extract.py.
// The site fetches `<base>/time.csv`, served from app/static/ in dev and
// copied to build/ by the adapter at build time.
if (!existsSync(csvSrc)) {
	console.log(`preprocess: ${csvSrc} missing — generating via data/extract.py`);
	try {
		execFileSync('python3', [extract, '--out', csvSrc], {
			cwd: root,
			stdio: 'inherit',
		});
	} catch (err) {
		console.error(`preprocess: failed to run data/extract.py: ${err.message}`);
		process.exit(1);
	}
	if (!existsSync(csvSrc)) {
		console.error(`preprocess: data/extract.py ran but ${csvSrc} was not produced`);
		process.exit(1);
	}
}
cpSync(csvSrc, join(app, 'static', 'time.csv'));

// ---- assets/: sync root assets/ into app/static/assets/ -------------------
// rm + fresh copy (not a merged cpSync): a merged copy would resurrect deleted
// files every run. Everything is copied EXCEPT the README screenshots
// (assets/screens/ and assets/preview*.png — only README.md consumes them,
// and only the copies at the repository root).
const assetsSrc = join(root, 'assets');
const assetsDst = join(app, 'static', 'assets');
function assetsExcluded(rel) {
	return rel.startsWith('screens/') || rel.startsWith('preview');
}
function* assetsFiles(dir, base) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		const rel = p.slice(base.length + 1);
		if (entry.isDirectory()) {
			if (assetsExcluded(rel + '/')) continue;
			yield* assetsFiles(p, base);
		} else if (!assetsExcluded(rel)) {
			yield [p, rel];
		}
	}
}
rmSync(assetsDst, { recursive: true, force: true });
mkdirSync(assetsDst, { recursive: true });
let n = 0;
for (const [src, rel] of assetsFiles(assetsSrc, assetsSrc)) {
	mkdirSync(join(assetsDst, dirname(rel)), { recursive: true });
	copyFileSync(src, join(assetsDst, rel));
	n += 1;
}
console.log(`[preprocess] time.csv + ${n} asset file(s) -> app/static/`);
