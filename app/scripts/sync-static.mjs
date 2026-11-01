// scripts/sync-static.mjs — refresh the copied static inputs in app/static/
// from their single sources in the repository (data pipeline output and
// vendored material). The copies are the only thing the dev server and the
// build consume; the sources never move.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..'); // app/
const root = join(app, '..'); // the repository root: data pipeline output

cpSync(join(root, 'emplois.csv'), join(app, 'static', 'emplois.csv'));
cpSync(join(root, 'assets'), join(app, 'static', 'assets'), { recursive: true });
// vendor assets already live in app/static/vendor (single source of truth)
// app manifests already live in app/static/{teachers,classes}/
// the legacy root redirect stub: forward pre-split bookmarks of classes.html
// to the classes app (relative './classes/' still resolves from the root)
if (existsSync(join(root, 'classes.html'))) {
	cpSync(join(root, 'classes.html'), join(app, 'static', 'classes.html'));
}
console.log('[sync-static] emplois.csv, assets/ -> app/static/');
