// Tests for the installable-PWA surface (issues 068 + 072) — run with the
// other suites: `node --test` / `node --test test/*.test.js`.
//
// Everything is exercised against the real artifacts: BOTH app manifests are
// parsed as JSON (not grepped), the icon PNGs are parsed at the byte level
// (IHDR: declared sizes must match the real file dimensions, the maskable icon
// must carry no alpha channel), every page is scanned for its manifest/icon
// links with hrefs RESOLVED against the page's own directory (the classes app
// links its in-directory manifest statically; the teachers app links it only
// via its ?install=1 opt-in script — issue 078, executed for real in a vm; the
// root landing, the online-only utility views and the redirect stub link none
// — issue 072), and each worker's runtime cache entry is re-parsed for the
// per-app family names covering every manifest- and page-referenced icon.
// Subpath safety (production deploys under
// https://adem482p.github.io/time/, issue 067) is a first-class assertion: no
// manifest URL may be root-absolute.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { APPS, isRelative, linkHrefs, readSrc, toRoot, pngIhdr } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// The two independently installable app descriptors are shared with the
// offline suite (test/helpers.js APPS); the issue-078 teachers opt-in and the
// classes static link are encoded there as manifestMode. The pages that carry
// NO manifest by design stay local to this suite.
const NO_MANIFEST = [
  'app/src/routes/+page.svelte',
  'app/src/routes/at/+page.svelte',
  'app/src/routes/all/+page.svelte'
];

function readManifest(app) {
  // A real JSON.parse: trailing commas, comments or a BOM must go red here,
  // not in the browser.
  return JSON.parse(readSrc(app.manifest));
}

// Issue 078: the teachers page's onMount injects the manifest link under ?install=1.
// The script is in the component's <script> section, not a separate <script> tag in HTML.
// We extract the onMount logic and run it in a vm sandbox that mimics just enough DOM.
function runInstallOptIn(html, search) {
  // Find the onMount block that contains the install=1 logic
  var onMountMatch = html.match(/onMount\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\)\s*;?/);
  assert.ok(onMountMatch, 'the page must carry an onMount with the install=1 logic');
  var onMountBody = onMountMatch[1];
  // Extract the ENTIRE if statement (condition + body) that contains "install=1"
  // so the condition is evaluated in the sandbox
  var installMatch = onMountBody.match(/if\s*\([\s\S]*?install=1[\s\S]*?\)\s*\{[\s\S]*?\}/);
  assert.ok(installMatch, 'the onMount must contain the install=1 conditional');
  var installStmt = installMatch[0];
  var appended = [];
  var sandbox = {
    location: { search: search },
    document: {
      createElement: function (tag) { return { tagName: tag }; },
      head: { appendChild: function (l) { appended.push({ rel: l.rel, href: l.href }); } }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(installStmt, sandbox, { filename: 'install-optin' });
  return appended;
}

test('each app manifest ships in its own directory with the installability fields (issues 068, 072)', function () {
  // No root manifest — each app owns its manifest in app/static/{app}/
  assert.ok(!fs.existsSync(path.join(ROOT, 'app/static/manifest.json')),
    'no root manifest — each app owns its manifest in app/static/{app}/ (issue 072)');
  APPS.forEach(function (app) {
    var m = readManifest(app);
    assert.strictEqual(typeof m.name, 'string');
    assert.ok(m.name.length > 0 && m.name.length <= 64, app.name + ': name should stay within launcher label limits');
    assert.strictEqual(typeof m.short_name, 'string');
    assert.ok(m.short_name.length > 0 && m.short_name.length <= 12,
      app.name + ': short_name is what the launcher shows when space is tight');
    assert.strictEqual(typeof m.description, 'string');
    assert.strictEqual(m.lang, 'en');
    assert.strictEqual(m.display, 'standalone', app.name + ': the installed app must get its own window');
    assert.strictEqual(m.orientation, 'any');
    assert.deepStrictEqual(m.categories, ['education']);
    assert.strictEqual(m.id, './', "id must stay './' — relative to the manifest, distinct per directory");
    assert.strictEqual(m.start_url, './',
      app.name + ": start_url must resolve on any subpath and hit this app's own entry");
    assert.strictEqual(m.scope, './',
      app.name + ": scope must cover this app's directory and nothing else (two workers, one origin)");
    var hex = /^#[0-9a-f]{6}$/i;
    assert.ok(hex.test(m.theme_color), 'theme_color must be a #rrggbb hex');
    assert.ok(hex.test(m.background_color), 'background_color must be a #rrggbb hex');
    // The manifest chrome color is the authored default the pages declare before
    // theme.js takes over the meta tag at runtime (issue 066 owns the runtime
    // side; this only pins the static agreement) — checked against THIS app's page.
    var pageTheme = readSrc(app.page).match(/<meta name="theme-color" content="([^"]+)"\s*\/?>/);
    assert.ok(pageTheme, app.page + ' must keep its author theme-color meta');
    assert.strictEqual(m.theme_color, pageTheme[1],
      app.name + ': manifest theme_color must equal the author <meta name="theme-color"> default');
  });
});

test('every page resolves the right manifest (or none) and real icons (issues 068, 072, 078)', function () {
  APPS.forEach(function (app) {
    var html = readSrc(app.page);
    // hrefs as written must stay the portable literals...
    if (app.manifestMode === 'static') {
      assert.deepStrictEqual(linkHrefs(html, 'manifest'), ['manifest.json'],
        app.page + ' must carry exactly one in-directory manifest link');
      // In the source tree, the manifest is at app/static/{app}/manifest.json.
      // The href="manifest.json" resolves to the page's directory in the built output,
      // but in the source tree it's at app/static/{app}/manifest.json.
      // We verify the manifest file exists at its source location.
      assert.ok(fs.existsSync(path.join(ROOT, app.manifest)),
        app.page + ': manifest file must exist at ' + app.manifest);
    } else {
      // issue 078: the teachers page is NOT installable by default — no static
      // manifest link ships at all; the page's own ?install=1 opt-in script
      // injects the link (executed above against the real page source).
      assert.deepStrictEqual(linkHrefs(html, 'manifest'), [],
        app.page + ' must carry NO static manifest link (issue 078: opt-in only)');
      var links = runInstallOptIn(html, '?install=1');
      assert.deepStrictEqual(links.map(function (l) { return [l.rel, l.href]; }),
        [['manifest', 'manifest.json']],
        app.page + ': ?install=1 must inject exactly one in-directory manifest link');
      // The injected href is 'manifest.json' — in the built output this resolves
      // to the app's manifest since both are in the same directory. In the source
      // they are in different locations, so we only verify the href value here.
      assert.strictEqual(links[0].href, 'manifest.json',
        app.page + ': the opt-in manifest link must have href="manifest.json"');
      // without the query nothing is written — the page stays non-installable
      ['', '?foo=1', '?install=0', '?install=10'].forEach(function (q) {
        assert.deepStrictEqual(runInstallOptIn(html, q), [],
          app.page + ': search ' + JSON.stringify(q) + ' must not inject a manifest');
      });
    }
    // In Svelte source, these are template expressions with ${base}
    assert.deepStrictEqual(linkHrefs(html, 'icon'), ['${base}/assets/icon-192.png'],
      app.page + ' must carry exactly one favicon link to the 192px app icon');
    assert.deepStrictEqual(linkHrefs(html, 'apple-touch-icon'), ['${base}/assets/apple-touch-icon.png'],
      app.page + ' must carry exactly one apple-touch-icon link');
    // In Svelte source, icon hrefs are template expressions like `${base}/assets/icon-192.png`.
    // The actual icons live at app/static/assets/ in the source tree.
    ['icon-192.png', 'apple-touch-icon.png'].forEach(function (icon) {
      assert.ok(fs.existsSync(path.join(ROOT, 'app/static/assets', icon)),
        app.page + ': icon target missing on disk: ' + icon);
    });
    assert.strictEqual(html.indexOf('data:,'), -1,
      app.page + ' must not keep the empty data: favicon — real icons exist now');
  });
  NO_MANIFEST.forEach(function (p) {
    var html = readSrc(p);
    assert.deepStrictEqual(linkHrefs(html, 'manifest'), [],
      p + ' links NO manifest — landing and utility pages are not installable (issue 072)');
    assert.strictEqual(html.indexOf('data:,'), -1, p + ' must not keep the empty data: favicon');
    // These pages also use template expressions for icons; check the actual files exist
    ['icon-192.png', 'apple-touch-icon.png'].forEach(function (icon) {
      assert.ok(fs.existsSync(path.join(ROOT, 'app/static/assets', icon)),
        p + ': icon target missing on disk: ' + icon);
    });
  });
});

test('the icons are real PNGs whose dimensions match both manifests’ declarations (issue 068)', function () {
  APPS.forEach(function (app) {
    var m = readManifest(app);
    var manifestDir = path.posix.dirname(app.manifest);
    assert.ok(Array.isArray(m.icons) && m.icons.length >= 3, app.name + ': the manifest must declare the icon set');
    var anySizes = [], maskableSizes = [];
    m.icons.forEach(function (icon) {
      assert.ok(isRelative(icon.src), 'icon src must be relative (subpath-safe): ' + icon.src);
      assert.strictEqual(icon.type, 'image/png');
      var declared = /^(\d+)x(\d+)$/.exec(icon.sizes);
      assert.ok(declared, 'sizes must be "WxH": ' + icon.sizes);
      // Icons live at app/static/assets/ (copied from root assets/), resolved from manifest dir
      var resolved = toRoot(icon.src, manifestDir);
      var ihdr = pngIhdr(resolved);
      assert.strictEqual(ihdr.width, Number(declared[1]), resolved + ' real width vs declared');
      assert.strictEqual(ihdr.height, Number(declared[2]), resolved + ' real height vs declared');
      if ((icon.purpose || 'any').split(/\s+/).indexOf('any') !== -1) anySizes.push(ihdr.width);
      if (icon.purpose && icon.purpose.split(/\s+/).indexOf('maskable') !== -1) {
        // A maskable icon must be full-bleed: the OS crops it, so an alpha
        // channel/background rectangle would show as junk around the artwork.
        assert.strictEqual(ihdr.colorType, 2, resolved + ' must be opaque RGB (no alpha) for masking');
        maskableSizes.push(ihdr.width);
      }
    });
    assert.ok(anySizes.some(function (s) { return s >= 192; }), app.name + ': need an any-purpose icon at >= 192px');
    assert.ok(anySizes.some(function (s) { return s >= 512; }), app.name + ': need an any-purpose icon at >= 512px');
    assert.ok(maskableSizes.some(function (s) { return s >= 512; }), app.name + ': need a maskable icon at >= 512px');
  });
  // The iOS touch icon is not in any manifest; pin its real size too.
  var apple = pngIhdr('app/static/assets/apple-touch-icon.png');
  assert.strictEqual(apple.width, 180);
  assert.strictEqual(apple.height, 180);
});

test('manifest URLs are relative and real, and neither manifest declares shortcuts (issues 068, 072)', function () {
  APPS.forEach(function (app) {
    var m = readManifest(app);
    var manifestDir = path.posix.dirname(app.manifest);
    [m.start_url, m.scope, m.id].concat(m.icons.map(function (i) { return i.src; })).forEach(function (url) {
      assert.ok(isRelative(url), 'no root-absolute or protocol URLs (breaks /time/): ' + url);
    });
    m.icons.forEach(function (i) {
      var resolved = toRoot(i.src, manifestDir);
      assert.ok(fs.existsSync(path.join(ROOT, resolved)), 'icon target must exist on disk: ' + i.src + ' -> ' + resolved);
    });
    // Issue 072: every former shortcut target (classes.html, and the utility
    // views — now at/index.html + all/index.html, formerly the root time and
    // timetable pages, issue 073) lies outside this app's './' scope, and
    // out-of-scope shortcut URLs are not dependable — each app is single-page.
    // If shortcuts ever return, they must resolve INSIDE the app directory.
    assert.strictEqual(m.shortcuts, undefined,
      app.name + ': no shortcuts — every target would sit outside the app scope (issue 072)');
  });
});

test('the worker runtime-caches responses — no build-time snapshot list (issues 068, 070, 072, 087)', function () {
  var tmpl = readSrc('app/scripts/sw-template.js');
  assert.ok(tmpl.indexOf('var CACHE =') !== -1,
    'sw-template.js must declare the runtime cache entry');
  assert.ok(tmpl.indexOf('__SNAPSHOT_URLS__') === -1,
    'sw-template.js must not carry the retired snapshot-list token (issue 087)');
  assert.ok(tmpl.indexOf('__SNAP_SUFFIX__') === -1,
    'sw-template.js must not carry the retired snapshot-version token (issue 087)');
  // The generated worker carries no URL list either.
  var gen = readSrc('app/scripts/gen-sw.mjs');
  assert.ok(gen.indexOf('__SNAPSHOT_URLS__') === -1,
    'gen-sw.mjs must not build a snapshot URL list any more (issue 087)');
});

test('the manifest is served as JSON by filename — no .webmanifest MIME trap (issue 068)', function () {
  // Chrome rejects a manifest whose MIME type is not JSON-ish. Static hosts
  // (GitHub Pages, python3 -m http.server) reliably serve *.json as
  // application/json, while *.webmanifest can fall through to
  // application/octet-stream on minimal hosts. The filename IS the fix: no
  // server config exists in this repo (no build step, no backend), so keep the
  // one naming choice that works everywhere. The teachers page links its
  // manifest only via the ?install=1 opt-in (issue 078) — that injected href
  // must carry the same .json safety.
  APPS.forEach(function (app) {
    var html = readSrc(app.page);
    var hrefs = app.manifestMode === 'static'
      ? linkHrefs(html, 'manifest')
      : runInstallOptIn(html, '?install=1').map(function (l) { return l.href; });
    assert.strictEqual(hrefs.length, 1);
    assert.ok(/\.json$/.test(hrefs[0]), app.page + ': the manifest link must end in .json');
    var m = readManifest(app);
    m.icons.forEach(function (i) {
      assert.ok(/\.png$/.test(i.src), 'icon src must keep a .png extension for MIME safety: ' + i.src);
    });
  });
});

// ---- issue 072: two installed apps, and the old URL's redirect stub ----------

test('the two manifests declare distinct installed-app identities with the chosen names (issue 072)', function () {
  var t = readManifest(APPS[0]);
  var c = readManifest(APPS[1]);
  // Exact user-chosen names (issue 072).
  assert.strictEqual(t.name, 'Emplois — Enseignants');
  assert.strictEqual(t.short_name, 'Enseignants');
  assert.strictEqual(c.name, 'Emplois — Classes');
  assert.strictEqual(c.short_name, 'Classes');
  // id defaults to start_url, but declare it: './' resolves against each
  // manifest's OWN directory, so the two ids are two different URLs — two
  // entries in the installed-apps list, not one relabeled app.
  [t, c].forEach(function (m) { assert.strictEqual(m.id, './'); });
  var idT = toRoot(t.id, APPS[0].dir), idC = toRoot(c.id, APPS[1].dir);
  assert.strictEqual(idT, 'teachers/');
  assert.strictEqual(idC, 'classes/');
  assert.notStrictEqual(idT, idC, 'the two app ids must resolve to different URLs');
  assert.notStrictEqual(t.name, c.name, 'the two app names must differ');
  assert.notStrictEqual(t.short_name, c.short_name, 'the two launcher labels must differ');
  assert.notStrictEqual(APPS[0].manifest, APPS[1].manifest, 'the two manifests are two files');
});

test('classes.html is a redirect stub to the moved app page (issue 072)', function () {
  var html = readSrc('classes.html');
  // no-JS path
  assert.ok(html.indexOf('url=./classes/') !== -1, 'the meta refresh must target ./classes/');
  // JS path preserves deep links (README captures use ?redact=1) and anchors
  assert.ok(html.indexOf("location.replace('./classes/' + location.search + location.hash)") !== -1,
    'the script redirect must forward the query string and the hash');
  // SEO: the old URL must not compete with the app page it hands off to
  assert.ok(html.indexOf('name="robots" content="noindex"') !== -1, 'the stub must be noindex');
  assert.ok(html.indexOf('<link rel="canonical" href="https://adem482p.github.io/time/classes/">') !== -1,
    'the stub must point its canonical at the moved page');
  // and it must carry NO app surface of its own
  assert.deepStrictEqual(linkHrefs(html, 'manifest'), [],
    'the stub links no manifest');
  assert.strictEqual(html.split('register.js').length - 1, 0,
    'the stub registers no service worker');
});

test('index.html is a head-only redirect to the teachers app page (issue 073)', function () {
  var html = readSrc('index.html');
  // The root does nothing but hand over to the teachers app (issue 073):
  // a head-only document — browsers synthesise the empty <body> — so nothing
  // ever paints and there is no data-page, nav, stylesheet or theme replay.
  assert.strictEqual(html.indexOf('<body'), -1, 'the landing has no <body> — it paints nothing');
  // no-JS path
  assert.ok(html.indexOf('content="0; url=teachers/"') !== -1,
    'the meta refresh must target teachers/');
  // JS path preserves deep links (README captures use ?redact=1) and anchors
  assert.ok(html.indexOf("location.replace('teachers/' + location.search + location.hash)") !== -1,
    'the script redirect must forward the query string and the hash');
  // SEO: the root URL hands its meaning to the page it redirects to
  assert.ok(html.indexOf('<link rel="canonical" href="https://adem482p.github.io/time/teachers/">') !== -1,
    'the landing must point its canonical at the teachers app page');
  // and it must carry no app surface of its own
  assert.deepStrictEqual(linkHrefs(html, 'manifest'), [], 'the landing links no manifest');
  assert.strictEqual(html.split('register.js').length - 1, 0,
    'the landing registers no service worker');
  ['rel="stylesheet"', '<nav', '/* Issue 066:', 'data-page', 'name="theme-color"'].forEach(function (tok) {
    assert.strictEqual(html.indexOf(tok), -1, 'the landing must not carry ' + tok);
  });
});

// ---- issue 069: the ISIMa logo icon set -----------------------------------

// Decode an 8-bit opaque-RGB PNG down to raw RGB triples, in pure node:
// walk the chunks, inflate the IDAT stream, then un-scanline the per-row
// filters (0..4). This lets the safe-zone test below measure the REAL pixels
// the OS will crop, not the authoring intent.
function decodePngRgb(rel) {
  var ihdr = pngIhdr(rel);
  assert.strictEqual(ihdr.colorType, 2, rel + ' must be opaque RGB (no alpha)');
  var buf = fs.readFileSync(path.join(ROOT, rel));
  assert.strictEqual(buf[24], 8, rel + ' must be 8-bit');
  var off = 8, idat = [], w = ihdr.width, h = ihdr.height;
  while (off < buf.length) {
    var len = buf.readUInt32BE(off);
    var type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  var raw = zlib.inflateSync(Buffer.concat(idat));
  var bpp = 3, stride = w * bpp, out = Buffer.alloc(stride * h);
  for (var y = 0; y < h; y++) {
    var f = raw[y * (stride + 1)];
    var src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    var cur = out.subarray(y * stride, (y + 1) * stride);
    var prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (var x = 0; x < stride; x++) {
      var a = x >= bpp ? cur[x - bpp] : 0;
      var b = prev ? prev[x] : 0;
      var c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      var v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        // PNG spec Paeth: p = a + b - c; pick the nearest of a, b, c to p.
        var p = a + b - c;
        var pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        var pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        v += pr;
      }
      cur[x] = v & 0xff;
    }
  }
  return out;
}

test('the maskable icon keeps the ISIMa logo inside the safe zone, full-bleed (issue 069)', function () {
  // The OS crops a maskable icon to a circle/squircle: every ink pixel must
  // live in the inner 80% circle (radius 204.8 px at 512) and the background
  // must reach every edge (an alpha channel or letterboxed gap would show as
  // junk). Measure that against the committed PNG's real pixels. Both manifests
  // declare the same shared icon (issue 072 keeps the 069 set at assets/).
  APPS.forEach(function (app) {
    var m = readManifest(app);
    var maskable = m.icons.filter(function (i) {
      return i.purpose && i.purpose.split(/\s+/).indexOf('maskable') !== -1;
    });
    assert.strictEqual(maskable.length, 1, app.name + ': exactly one maskable icon');
    // The manifest's icon src is relative to the manifest's directory
    var manifestDir = path.posix.dirname(app.manifest);
    var w = 512, h = 512, px = decodePngRgb(toRoot(maskable[0].src, manifestDir));
    // Full-bleed background of assets/icon-maskable.svg: ISIM Blue gradient
    // #0b4da2 (top) -> #052455 (bottom).
    var top = [0x0b, 0x4d, 0xa2], bot = [0x05, 0x24, 0x55], tol = 25;
    var ink = 0, maxDist = 0;
    function delta(x, y) {
      var t = (y + 0.5) / h, i = (y * w + x) * 3, d = 0;
      for (var ch = 0; ch < 3; ch++) {
        d = Math.max(d, Math.abs(px[i + ch] - (top[ch] + (bot[ch] - top[ch]) * t)));
      }
      return d;
    }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (delta(x, y) > tol) {
          ink++;
          var dist = Math.sqrt((x + 0.5 - w / 2) * (x + 0.5 - w / 2) + (y + 0.5 - h / 2) * (y + 0.5 - h / 2));
          if (dist > maxDist) maxDist = dist;
        }
      }
    }
    assert.ok(ink > 10000, app.name + ': the logo artwork must actually be on the maskable icon (ink px: ' + ink + ')');
    assert.ok(maxDist <= 204.8,
      app.name + ': every ink pixel must stay in the maskable safe zone: ' + maxDist.toFixed(1) + ' px from centre');
    [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].forEach(function (c) {
      assert.ok(delta(c[0], c[1]) <= tol,
        app.name + ': corner must be full-bleed background, not artwork or a gap: ' + c);
    });
  });
});

test('the committed icon art is the official ISIMa logo (issue 069)', function () {
  // Provenance pin: the verbatim download and both compositions share the
  // official lockup's viewBox, and every shipped PNG is real art (the file
  // sizes moved from ~1.4-3.0 KB monogram to ~8-28 KB logo bytes).
  var logo = readSrc('assets/isima-logo.svg');
  assert.ok(logo.length > 10000, 'the verbatim official logo must be kept');
  assert.ok(logo.indexOf('301.26 231.42') !== -1, 'official lockup viewBox');
  ['assets/icon.svg', 'assets/icon-maskable.svg'].forEach(function (f) {
    var src = readSrc(f);
    assert.ok(src.indexOf('301.26 231.42') !== -1, f + ' must embed the official lockup');
  });
  ['assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
    'assets/apple-touch-icon.png'].forEach(function (f) {
    assert.ok(fs.statSync(path.join(ROOT, f)).size > 4096, f + ' must be real logo art, not a stub');
  });
});