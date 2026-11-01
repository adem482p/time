// scripts/sync-static.mjs — refresh the copied static inputs in app/static/
// from their single sources in the repository (data pipeline output and
// vendored material). The copies are the only thing the dev server and the
// build consume; the sources never move.
import { cpSync, mkdirSync, existsSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..'); // app/
const root = join(app, '..'); // the repository root: data pipeline output

cpSync(join(root, 'emplois.csv'), join(app, 'static', 'emplois.csv'));
// assets/ is synced by rm + fresh copy (not a merged cpSync): the removed-file
// staleness a merged copy carries would resurrect deleted files every build.
// Everything is copied EXCEPT the README screenshots (assets/screens/ and
// assets/preview*.png — only README.md consumes them, and only the copies at
// the repository root); excluded entries therefore never land in app/static.
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
for (const [src, rel] of assetsFiles(assetsSrc, assetsSrc)) {
	mkdirSync(join(assetsDst, dirname(rel)), { recursive: true });
	copyFileSync(src, join(assetsDst, rel));
}
// vendor assets already live in app/static/vendor (single source of truth)
// app manifests already live in app/static/{teachers,classes}/
// the legacy root redirect stub: forward pre-split bookmarks of classes.html
// to the classes app (relative './classes/' still resolves from the root)
if (existsSync(join(root, 'classes.html'))) {
	cpSync(join(root, 'classes.html'), join(app, 'static', 'classes.html'));
}
console.log('[sync-static] emplois.csv, assets/ -> app/static/');
