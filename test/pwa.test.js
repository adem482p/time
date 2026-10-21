// Tests for the installable-PWA surface (issue 068) — run with the other
// suites: `node --test` / `node --test test/*.test.js`.
//
// Everything is exercised against the real artifacts: manifest.json is parsed
// as JSON (not grepped), the icon PNGs are parsed at the byte level (IHDR:
// declared sizes must match the real file dimensions, the maskable icon must
// carry no alpha channel), the four pages are scanned for the manifest/icon
// links, and the SNAPSHOT_URLS literal in sw.js is re-parsed for derived coverage
// of every manifest- and page-referenced icon. Subpath safety (production
// deploys under https://adem482p.github.io/time/, issue 067) is a first-class
// assertion: no manifest URL may be root-absolute.

'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');
var zlib = require('node:zlib');

var ROOT = path.join(__dirname, '..');
var PAGES = ['index.html', 'classes.html', 'time.html', 'timetable.html'];

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readManifest() {
  // A real JSON.parse: trailing commas, comments or a BOM must go red here,
  // not in the browser.
  return JSON.parse(readSrc('manifest.json'));
}

// Parse the SNAPSHOT_URLS array literal out of sw.js (hand-written, no build
// step). Renamed from PRECACHE by issue 070 (the "last snapshot" model).
function snapshotUrls() {
  var src = readSrc('sw.js');
  var block = src.match(/var SNAPSHOT_URLS = \[([\s\S]*?)\];/);
  assert.ok(block, 'sw.js must declare the hand-written SNAPSHOT_URLS literal');
  var urls = [], m, re = /'([^']+)'/g;
  while ((m = re.exec(block[1]))) urls.push(m[1]);
  return urls;
}

// Read a PNG's IHDR: {width, height, colorType} from the real bytes.
// offset 16..19 width (BE), 20..23 height (BE), 24 bit depth, 25 color type
// (2 = truecolour RGB — no alpha; 6 = RGBA).
function pngIhdr(rel) {
  var buf = fs.readFileSync(path.join(ROOT, rel));
  assert.ok(buf.length > 26, rel + ' must be longer than a PNG header');
  assert.strictEqual(buf.readUInt32BE(0), 0x89504e47, rel + ' must start with the PNG signature');
  assert.strictEqual(buf.toString('latin1', 12, 16), 'IHDR', rel + ' first chunk must be IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25]
  };
}

function linkHrefs(html, rel) {
  var out = [], m, re = new RegExp('<link\\b[^>]*\\brel="' + rel + '"[^>]*\\bhref="([^"]+)"', 'g');
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function isRelative(url) {
  // Root-absolute ("/…"), protocol-relative ("//…") and absolute URLs break
  // under the production subpath /time/ (issue 067's lesson).
  return !/^(https?:)?\/\//.test(url) && !/^\/(?!\/)/.test(url) && !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

test('the web app manifest ships at the site root with the installability fields (issue 068)', function () {
  var m = readManifest();
  assert.strictEqual(typeof m.name, 'string');
  assert.ok(m.name.length > 0 && m.name.length <= 64, 'name should stay within launcher label limits');
  assert.strictEqual(typeof m.short_name, 'string');
  assert.ok(m.short_name.length > 0 && m.short_name.length <= 12,
    'short_name is what the launcher shows when space is tight');
  assert.strictEqual(typeof m.description, 'string');
  assert.strictEqual(m.lang, 'en');
  assert.strictEqual(m.display, 'standalone', 'the installed app must get its own window');
  assert.strictEqual(m.orientation, 'any');
  assert.deepStrictEqual(m.categories, ['education']);
  assert.strictEqual(m.start_url, './', 'start_url must resolve on any subpath and hit the precached bare origin');
  assert.strictEqual(m.scope, './', 'scope must cover the whole site on any subpath');
  var hex = /^#[0-9a-f]{6}$/i;
  assert.ok(hex.test(m.theme_color), 'theme_color must be a #rrggbb hex');
  assert.ok(hex.test(m.background_color), 'background_color must be a #rrggbb hex');
  // The manifest chrome color is the authored default the pages declare before
  // js/theme.js takes over the meta tag at runtime (issue 066 owns the runtime
  // side; this only pins the static agreement).
  var idxTheme = readSrc('index.html').match(/<meta name="theme-color" content="([^"]+)">/);
  assert.ok(idxTheme, 'index.html must keep its author theme-color meta');
  assert.strictEqual(m.theme_color, idxTheme[1],
    'manifest theme_color must equal the author <meta name="theme-color"> default');
});

test('every page links the manifest and real icons, and no page keeps the empty favicon (issue 068)', function () {
  PAGES.forEach(function (p) {
    var html = readSrc(p);
    assert.deepStrictEqual(linkHrefs(html, 'manifest'), ['manifest.json'],
      p + ' must carry exactly one manifest link to manifest.json');
    assert.deepStrictEqual(linkHrefs(html, 'icon'), ['assets/icon-192.png'],
      p + ' must carry exactly one favicon link to the 192px app icon');
    assert.deepStrictEqual(linkHrefs(html, 'apple-touch-icon'), ['assets/apple-touch-icon.png'],
      p + ' must carry exactly one apple-touch-icon link');
    assert.strictEqual(html.indexOf('data:,'), -1,
      p + ' must not keep the empty data: favicon — real icons exist now');
  });
});

test('the icons are real PNGs whose dimensions match the manifest declarations (issue 068)', function () {
  var m = readManifest();
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 3, 'the manifest must declare the icon set');
  var anySizes = [], maskableSizes = [];
  m.icons.forEach(function (icon) {
    assert.ok(isRelative(icon.src), 'icon src must be relative (subpath-safe): ' + icon.src);
    assert.strictEqual(icon.type, 'image/png');
    var declared = /^(\d+)x(\d+)$/.exec(icon.sizes);
    assert.ok(declared, 'sizes must be "WxH": ' + icon.sizes);
    var ihdr = pngIhdr(icon.src);
    assert.strictEqual(ihdr.width, Number(declared[1]), icon.src + ' real width vs declared');
    assert.strictEqual(ihdr.height, Number(declared[2]), icon.src + ' real height vs declared');
    if ((icon.purpose || 'any').split(/\s+/).indexOf('any') !== -1) anySizes.push(ihdr.width);
    if (icon.purpose && icon.purpose.split(/\s+/).indexOf('maskable') !== -1) {
      // A maskable icon must be full-bleed: the OS crops it, so an alpha
      // channel/background rectangle would show as junk around the artwork.
      assert.strictEqual(ihdr.colorType, 2, icon.src + ' must be opaque RGB (no alpha) for masking');
      maskableSizes.push(ihdr.width);
    }
  });
  assert.ok(anySizes.some(function (s) { return s >= 192; }), 'need an any-purpose icon at >= 192px');
  assert.ok(anySizes.some(function (s) { return s >= 512; }), 'need an any-purpose icon at >= 512px');
  assert.ok(maskableSizes.some(function (s) { return s >= 512; }), 'need a maskable icon at >= 512px');
  // The iOS touch icon is not in the manifest; pin its real size too.
  var apple = pngIhdr('assets/apple-touch-icon.png');
  assert.strictEqual(apple.width, 180);
  assert.strictEqual(apple.height, 180);
});

test('manifest and shortcut URLs are relative and point at real pages (issue 068)', function () {
  var m = readManifest();
  [m.start_url, m.scope].concat(
    m.icons.map(function (i) { return i.src; }),
    (m.shortcuts || []).map(function (s) { return s.url; })
  ).forEach(function (url) {
    assert.ok(isRelative(url), 'no root-absolute or protocol URLs (breaks /time/): ' + url);
  });
  assert.ok(Array.isArray(m.shortcuts) && m.shortcuts.length > 0, 'shortcuts exist for the app pages');
  m.shortcuts.forEach(function (s) {
    assert.ok(typeof s.name === 'string' && s.name.length > 0, 'each shortcut needs a name');
    var resolved = path.join(ROOT, s.url.split('?')[0].split('#')[0]);
    assert.ok(fs.existsSync(resolved), 'shortcut target must exist on disk: ' + s.url);
    assert.ok(PAGES.indexOf(s.url) !== -1, 'shortcut must point at one of the four pages: ' + s.url);
  });
});

test('the snapshot covers the manifest and every icon, and the old generations are gone (issues 068, 070)', function () {
  var urls = snapshotUrls();
  var m = readManifest();
  var required = ['manifest.json', 'assets/apple-touch-icon.png'];
  m.icons.forEach(function (i) { required.push(i.src); });
  PAGES.forEach(function (p) {
    var html = readSrc(p);
    linkHrefs(html, 'icon').concat(linkHrefs(html, 'apple-touch-icon'), linkHrefs(html, 'manifest'))
      .forEach(function (href) { if (required.indexOf(href) === -1) required.push(href); });
  });
  required.forEach(function (u) {
    assert.ok(urls.indexOf(u) !== -1, 'SNAPSHOT_URLS misses the install-surface asset: ' + u);
    assert.ok(fs.existsSync(path.join(ROOT, u)), 'snapshot icon/manifest missing on disk: ' + u);
  });
  // The SNAPSHOT_URLS change above MUST come with a generation bump so the
  // old snapshot is destroyed on activate (sw.js header invariant, issue 063;
  // issue 070 renamed cache -> snapshot and v1/v2 -> snapshot-v1).
  var src = readSrc('sw.js');
  assert.strictEqual(src.indexOf("'emplois-v1'"), -1,
    "the superseded 'emplois-v1' generation must not survive a SNAPSHOT_URLS change");
  assert.strictEqual(src.indexOf("'emplois-v2'"), -1,
    "the superseded 'emplois-v2' generation must not survive a SNAPSHOT_URLS change");
  assert.ok(/SNAPSHOT = 'emplois-snapshot-v\d+'/.test(src), 'sw.js must declare a versioned snapshot name');
});

test('the manifest is served as JSON by filename — no .webmanifest MIME trap (issue 068)', function () {
  // Chrome rejects a manifest whose MIME type is not JSON-ish. Static hosts
  // (GitHub Pages, python3 -m http.server) reliably serve *.json as
  // application/json, while *.webmanifest can fall through to
  // application/octet-stream on minimal hosts. The filename IS the fix: no
  // server config exists in this repo (no build step, no backend), so keep the
  // one naming choice that works everywhere.
  PAGES.forEach(function (p) {
    var hrefs = linkHrefs(readSrc(p), 'manifest');
    assert.strictEqual(hrefs.length, 1);
    assert.ok(/\.json$/.test(hrefs[0]), p + ': the manifest link must end in .json');
  });
  var m = readManifest();
  m.icons.forEach(function (i) {
    assert.ok(/\.png$/.test(i.src), 'icon src must keep a .png extension for MIME safety: ' + i.src);
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
        var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
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
  // junk). Measure that against the committed PNG's real pixels.
  var m = readManifest();
  var maskable = m.icons.filter(function (i) {
    return i.purpose && i.purpose.split(/\s+/).indexOf('maskable') !== -1;
  });
  assert.strictEqual(maskable.length, 1, 'exactly one maskable icon');
  var w = 512, h = 512, px = decodePngRgb(maskable[0].src);
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
  assert.ok(ink > 10000, 'the logo artwork must actually be on the maskable icon (ink px: ' + ink + ')');
  assert.ok(maxDist <= 204.8,
    'every ink pixel must stay in the maskable safe zone: ' + maxDist.toFixed(1) + ' px from centre');
  [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].forEach(function (c) {
    assert.ok(delta(c[0], c[1]) <= tol,
      'corner must be full-bleed background, not artwork or a gap: ' + c);
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
