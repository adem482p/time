// scripts/sync-static.mjs — refresh the copied static inputs in app/static/
// from their single sources in the repository root (data pipeline output and
// vendored material). The copies are the only thing the dev server and the
// build consume; the sources never move.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..'); // app/
const root = join(app, '..'); // the repository root: data pipeline output, assets, vendor

cpSync(join(root, 'emplois.csv'), join(app, 'static', 'emplois.csv'));
cpSync(join(root, 'assets'), join(app, 'static', 'assets'), { recursive: true });
cpSync(join(root, 'vendor'), join(app, 'static', 'vendor'), { recursive: true });
// the two app manifests move with their pages (legacy content, issue 072)
for (const pkg of ['teachers', 'classes']) {
	mkdirSync(join(app, 'static', pkg), { recursive: true });
	cpSync(join(root, pkg, 'manifest.json'), join(app, 'static', pkg, 'manifest.json'));
}
// the legacy root redirect stub: forward pre-split bookmarks of classes.html
// to the classes app (relative './classes/' still resolves from the root)
cpSync(join(root, 'classes.html'), join(app, 'static', 'classes.html'));
console.log('[sync-static] emplois.csv, assets/, vendor/, app manifests, classes.html -> app/static/');

