# 069: Use the official ISIM Mahdia logo as the app icon

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

Observed: the installable-PWA icon set shipped by issue 068 is made of
hand-drawn geometric art — a white letter "E" (for *Emplois*) on the ISIM Blue
gradient, authored as `assets/icon.svg` / `assets/icon-maskable.svg` and
rasterised into `assets/icon-192.png`, `assets/icon-512.png`,
`assets/icon-maskable-512.png` and `assets/apple-touch-icon.png`. It is tidy
and on-brand-colour, but it says nothing about the institution the timetable
belongs to: an installed "Emplois" launcher, a browser tab and a phone home
screen all show an abstract monogram instead of the ISIM Mahdia identity.

Expected: the app icon should be the **official ISIMa logo**, still meeting
every constraint the PWA surface pins — legible at the 192 px favicon size,
inside the maskable safe zone (inner 80 % circle) for the croppable icon,
opaque full-bleed RGB for the maskable PNG, and byte-exact IHDR sizes matching
the manifest.

Institution check: the brief guessed Université Abdelhamid Mehri (Constantine);
that is wrong. The institute is the **Institut Supérieur d'Informatique de
Mahdia (ISIMa)**, part of **Université de Monastir** (see
https://um.rnu.tn/fr/etablissements/instituts/institut-supérieur-dinformatique-de-mahdia
and fr.wikipedia), official site https://isima.rnu.tn.

## Root cause / approach

Not a defect: the icons were generated before anyone sourced the institution's
artwork (issue 068 picked a neutral monogram deliberately). This issue replaces
that generated art with the official logo, keeping every filename, the manifest
shape and the `sw.js` PRECACHE list untouched.

Approach (as executed):

1. Source the official logo from the institute's own site — it is served as an
   Adobe Illustrator SVG export and used as the site header logo; see
   *Provenance* below for URLs, hashes and licence findings.
2. Compose the icon in vector: the official **white-on-dark lockup** (the
   variant the institute itself publishes for dark/photographic backgrounds)
   centred on the existing full-bleed ISIM Blue gradient — same two colour
   stops as issue 068. Both compositions (white background + coloured lockup,
   blue background + white lockup) were rendered and compared at 512 px and
   192 px; the blue/white pairing is decisively more legible at 192 px (the
   coloured wordmark goes soft on white, the navy wordmark vanishes on blue —
   only white-on-blue keeps emblem, wordmark and subtitle readable).
3. Keep the source-art convention (`<name>.svg` → `<name>.png`): the verbatim
   download is committed as `assets/isima-logo.svg` (provenance anchor,
   byte-identical, sha256 below); `assets/icon.svg` and
   `assets/icon-maskable.svg` embed that lockup verbatim on the background and
   carry the regeneration commands in their header comments.
4. Regenerate the four PNGs at their exact sizes with `rsvg-convert`, written
   as opaque RGB (colorType 2). `sw.js`, `manifest.json` and the four HTML
   `<head>`s needed no change: same filenames, same sizes, same purposes.

### Provenance

- **Asset**: official ISIMa lockup, white-on-dark ("slider") variant —
  the cyan/teal "i" swoosh emblem with the green dot, white "isima" wordmark
  and the "Institut Supérieur d'Informatique de Mahdia" subtitle.
- **Source URL**: https://isima.rnu.tn/build/assets/logo-slider-BmNTy0I4.svg
  — linked from the institute's own stylesheet
  (https://isima.rnu.tn/build/assets/site-DKjTDTPx.css, the `.logo-header`
  background), i.e. the exact file the institute renders as its site logo.
- **Retrieved**: 2026-10-21 from isima.rnu.tn (HTTP 200).
- **sha256**: `94e34493dcb96b3dbb11ca1ed38e75b9d5a031722cffb9535c5c51fccda25446`
  (the committed `assets/isima-logo.svg` is byte-identical to the download).
- **Catalogued but not used**:
  - coloured-on-white variant of the same lockup:
    https://isima.rnu.tn/build/assets/logo-pLPmP72g.svg (same viewBox); the
    institute itself uses it for light backgrounds. Rejected for the favicon:
    at 192 px its wordmark/ subtitle lose contrast (rendered and compared).
  - the institute's own PWA icons, which show its preferred icon treatment
    (full lockup on white, no background colour):
    https://isima.rnu.tn/pwa/apple-touch-icon-180x180.png and
    https://isima.rnu.tn/pwa/maskable-icon-512x512.png. We follow the same
    "full lockup, centred" idea but on the app's ISIM Blue brand background,
    which keeps the app's existing colour identity and the white-lockup
    variant the institute publishes for exactly this situation.
- **Licence / attribution / trademark position** — searched and found
  **nothing**: no licence, terms, copyright or logo-usage statement exists on
  isima.rnu.tn (no `mentions légales` page — 404; no © line or legal/privacy
  links in the site footer; no statement in the SVG metadata). The logo is the
  institute's identifying mark (trademark by use), reproduced here as the icon
  of an unofficial, non-endorsing open timetable utility for that institute's
  own schedule. No licence requires attribution, so attribution stays in this
  issue file and `vendor/NOTICE` is untouched (its pattern covers bundled
  third-party works with licences). If the institute ever objects, reverting
  is a source-art swap in `assets/icon.svg` / `assets/icon-maskable.svg` plus
  a PNG regeneration.

## Repro steps

```sh
cd /home/user/.local/share/opencode/worktree/1de5bb/069-isima-logo-icon
node --test test/*.test.js
python3 -m http.server 8123 --directory .
```

Open http://127.0.0.1:8123/ — the tab icon, the manifest icons and the iOS
touch icon are the geometric "E" monogram. After the fix they are the official
ISIMa logo on the ISIM Blue background, and the same test suite still passes
(167 → 169 tests).

## Discussion

### Fix implemented (2026-10-21)

Implemented by the folded researcher+implementer for issue 069.

**Changed files**

| File | Change |
|---|---|
| `assets/isima-logo.svg` | **new** — verbatim official logo (sha256 above), provenance anchor |
| `assets/icon.svg` | replaced: ISIM Blue gradient + official lockup nested at 82 % canvas width, centred |
| `assets/icon-maskable.svg` | replaced: same, lockup at 312 px canvas width (safe-zone sized) |
| `assets/icon-192.png` | regenerated from `icon.svg` @192 — 1406 → 8985 bytes, RGB |
| `assets/icon-512.png` | regenerated @512 — 3041 → 27967 bytes, RGB |
| `assets/apple-touch-icon.png` | regenerated @180 — 1431 → 8430 bytes, RGB |
| `assets/icon-maskable-512.png` | regenerated from `icon-maskable.svg` @512 — 2806 → 21225 bytes, RGB |
| `test/pwa.test.js` | +2 tests (maskable safe zone measured on real pixels; logo provenance/art pins) |
| `issues/069-isima-logo-icon.md` | this file |

`manifest.json`, `sw.js` (26-URL PRECACHE untouched), `index.html`,
`classes.html`, `time.html`, `timetable.html`: **byte-identical** to `main`
(`cmp`-verified) — same filenames/ purposes/ sizes, so nothing downstream of
issue 068 needed touching. The old monogram source art is overwritten in place
(no file deleted; git history keeps it) — it served no other purpose
(`assets/preview.svg` never referenced it; `grep`-verified).

**Design measurements**

- Maskable safe zone: lockup rect 312 × 239.7 centred on 512 → far corners
  197.0 px from centre; **measured on the committed PNG's real pixels**
  (decoded in the test): max ink distance **183.4 px** vs the 204.8 px safe
  radius (21.4 px margin), 19 301 ink pixels, all four corners pure background
  (full-bleed, no alpha — colorType 2 confirmed by PIL and by the test's IHDR
  reader).
- The 192 px favicon keeps emblem, wordmark and subtitle legible (rendered
  natively at 192 by rsvg, visually checked at size and in the browser).

**Verification results**

1. `node --test test/*.test.js` → **169 pass / 0 fail** (baseline on `main`:
   167 pass / 0 fail; +2 new tests in `test/pwa.test.js`). No other suite
   touched or broken.
2. `python3 -m http.server 8123 --bind 127.0.0.1` (PID 1165195, **killed
   afterwards**): all four pages, `manifest.json` (served
   `application/json`), the four PNGs and the three SVGs → HTTP 200.
3. PIL: all four icon PNGs are `RGB` (no alpha), dimensions exactly
   192×192 / 512×512 / 512×512 / 180×180 — matching the manifest declarations
   (also pinned by the existing byte-level IHDR tests).
4. Playwright (Chromium) on http://127.0.0.1:8123/: manifest fetched (200,
   `application/json`) and parsed; all three manifest icons plus the
   apple-touch-icon load with correct natural sizes; **0 console errors for
   the page load** (the only entry is the browser's automatic `/favicon.ico`
   probe 404 — pre-existing on `main`, the page declares its icon via
   `<link rel="icon">`); rendered favicon screenshot visually verified.

**Exact diff** (relative to `main` @ cb55857; binaries listed above, not
inlined):

```diff
--- clean/assets/icon.svg	2026-10-21 13:34:45.514451343 +0100
+++ 069-isima-logo-icon/assets/icon.svg	2026-10-21 13:58:50.477551562 +0100
@@ -1,10 +1,15 @@
 <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
-  <!-- App icon source (issue 068): generate the committed PNGs with
-       rsvg-convert -w <s> -h <s> assets/icon.svg -o assets/icon-<s>.png
-       (also the source for assets/apple-touch-icon.png at 180).
-       Full-bleed ISIM Blue gradient (same stops as assets/preview.svg) with a
-       geometric white "E" for Emplois and the wordmark's light-blue accent
-       bar underneath. Purpose "any": the OS masks it; no baked rounding. -->
+  <!-- App icon source (issue 069): the official ISIMa lockup (white-on-dark
+       variant, assets/isima-logo.svg) centred on the full-bleed ISIM Blue
+       gradient (same stops as before, issue 068). The lockup is scaled to 82%
+       of the canvas width; the OS masks purpose "any", so no baked rounding. -->
+  <!-- Regenerate the committed PNGs (then flatten to RGB with PIL — drop the
+       fully-opaque alpha channel, and crop exactly WxH):
+         rsvg-convert -w 512 -h 512 assets/icon.svg -o /tmp/icon512.png
+         rsvg-convert -w 192 -h 192 assets/icon.svg -o /tmp/icon192.png
+         rsvg-convert -w 180 -h 180 assets/icon.svg -o /tmp/icon180.png
+       -> assets/icon-512.png, assets/icon-192.png,
+          assets/apple-touch-icon.png (180) -->
   <defs>
     <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0b4da2"/>
@@ -12,11 +17,212 @@
     </linearGradient>
   </defs>
   <rect width="512" height="512" fill="url(#bg)"/>
-  <g fill="#ffffff">
-    <rect x="156" y="84" width="44" height="284"/>
-    <rect x="156" y="84" width="200" height="44"/>
-    <rect x="156" y="204" width="160" height="44"/>
-    <rect x="156" y="324" width="200" height="44"/>
-  </g>
-  <rect x="156" y="406" width="140" height="22" rx="11" fill="#7fb2ff"/>
+  <svg x="46" y="94.69" width="420" height="322.63" viewBox="0 0 301.26 231.42">
+  <!-- Official ISIMa lockup, white-on-dark variant, copied verbatim from
+       https://isima.rnu.tn/build/assets/logo-slider-BmNTy0I4.svg
+       (retrieved 2026-10-21; provenance and licence notes in
+       issues/069-isima-logo-icon.md). Original viewBox 0 0 301.26 231.42,
+       ink fills it edge to edge. -->
+    <style type="text/css">
+    	.st0{fill:url(#SVGID_1_);}
+    	.st1{fill:url(#SVGID_00000012452033857554364170000003166221339989402757_);}
+    	.st2{fill:url(#SVGID_00000106870024935404341590000005112153355012736653_);}
+    	.st3{fill:#FFFFFF;}
+    	.st4{display:none;fill:#FFFFFF;}
+    </style>
+    <linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="97.8798" y1="5.9047" x2="122.0952" y2="24.8238">
+    	<stop  offset="0.1818" style="stop-color:#F1EE82"/>
+    	<stop  offset="1" style="stop-color:#7DBA42"/>
+    </linearGradient>
+    <circle class="st0" cx="109.99" cy="15.36" r="15.36"/>
+    <linearGradient id="SVGID_00000063620961977237544380000008804526131405976760_" gradientUnits="userSpaceOnUse" x1="52.7452" y1="216.4774" x2="52.7452" y2="30.7285">
+    	<stop  offset="0.1879" style="stop-color:#094D6A"/>
+    	<stop  offset="1" style="stop-color:#23C2E2"/>
+    </linearGradient>
+    <path style="fill:url(#SVGID_00000063620961977237544380000008804526131405976760_);" d="M63.9,30.73c0,0-78.28,100.57-61.55,160.48
+    	c14.05,50.31,62.94,16.38,77.28-22.69c0,0-41.87,54.73-48.33,30c-6.46-24.73,32.32-101.74,74.2-136.87L88.07,30.73H63.9z"/>
+    <linearGradient id="SVGID_00000032623394942694470310000014129266982845146030_" gradientUnits="userSpaceOnUse" x1="-16.5952" y1="176.9333" x2="91.5816" y2="33.3779">
+    	<stop  offset="0" style="stop-color:#094D6A;stop-opacity:0"/>
+    	<stop  offset="0.4424" style="stop-color:#34C2DC"/>
+    </linearGradient>
+    <path style="fill:url(#SVGID_00000032623394942694470310000014129266982845146030_);" d="M63.9,30.73c0,0-78.28,100.57-61.55,160.48
+    	l8.71-12.37C4.59,154.11,88.07,30.73,88.07,30.73H63.9z"/>
+    <g>
+    	<g>
+    		<path class="st3" d="M78.72,201.66h2.09v11.06h-2.09V201.66z"/>
+    		<path class="st3" d="M82.65,204.54h2.05v0.84c0.46-0.39,0.89-0.67,1.27-0.82c0.38-0.15,0.76-0.23,1.16-0.23
+    			c0.81,0,1.5,0.28,2.06,0.85c0.48,0.48,0.71,1.19,0.71,2.14v5.41h-2.03v-3.58c0-0.98-0.04-1.62-0.13-1.95
+    			c-0.09-0.32-0.24-0.57-0.46-0.73c-0.22-0.17-0.49-0.25-0.81-0.25c-0.41,0-0.77,0.14-1.07,0.42c-0.3,0.28-0.5,0.66-0.62,1.15
+    			c-0.06,0.25-0.09,0.81-0.09,1.66v3.28h-2.05V204.54z"/>
+    		<path class="st3" d="M96.6,205.69l-1.27,1.27c-0.52-0.51-0.99-0.77-1.41-0.77c-0.23,0-0.41,0.05-0.54,0.15s-0.2,0.22-0.2,0.36
+    			c0,0.11,0.04,0.21,0.12,0.3c0.08,0.09,0.29,0.22,0.61,0.38l0.75,0.38c0.79,0.39,1.34,0.79,1.63,1.2s0.44,0.88,0.44,1.43
+    			c0,0.73-0.27,1.33-0.8,1.82c-0.53,0.49-1.25,0.73-2.15,0.73c-1.19,0-2.15-0.47-2.86-1.4l1.26-1.38c0.24,0.28,0.52,0.51,0.85,0.68
+    			c0.32,0.17,0.61,0.26,0.86,0.26c0.27,0,0.49-0.06,0.65-0.2c0.17-0.13,0.25-0.28,0.25-0.45c0-0.32-0.3-0.62-0.89-0.92l-0.69-0.35
+    			c-1.32-0.67-1.99-1.5-1.99-2.5c0-0.65,0.25-1.2,0.75-1.66s1.14-0.69,1.91-0.69c0.53,0,1.03,0.12,1.5,0.35
+    			C95.87,204.92,96.27,205.25,96.6,205.69z"/>
+    		<path class="st3" d="M98.3,201.53h2.05v3.02h1.22v1.77h-1.22v6.42H98.3v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M103.17,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C102.5,201.3,102.81,201.17,103.17,201.17z M102.14,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M106,201.53h2.05v3.02h1.22v1.77h-1.22v6.42H106v-6.42h-1.05v-1.77H106V201.53z"/>
+    		<path class="st3" d="M110.05,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M119.24,201.53h2.05v3.02h1.22v1.77h-1.22v6.42h-2.05v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M133.34,203.17l-1.56,1.38c-0.55-0.76-1.11-1.14-1.67-1.14c-0.28,0-0.5,0.07-0.68,0.22
+    			c-0.18,0.15-0.26,0.32-0.26,0.5s0.06,0.36,0.19,0.53c0.17,0.22,0.69,0.69,1.54,1.42c0.8,0.67,1.29,1.1,1.46,1.27
+    			c0.43,0.43,0.73,0.84,0.91,1.24c0.18,0.39,0.27,0.82,0.27,1.29c0,0.91-0.31,1.66-0.94,2.25c-0.63,0.59-1.45,0.89-2.46,0.89
+    			c-0.79,0-1.47-0.19-2.06-0.58s-1.09-0.99-1.5-1.82l1.77-1.07c0.53,0.98,1.14,1.47,1.84,1.47c0.36,0,0.67-0.11,0.91-0.32
+    			c0.25-0.21,0.37-0.45,0.37-0.73c0-0.25-0.09-0.5-0.28-0.75c-0.19-0.25-0.6-0.63-1.23-1.15c-1.21-0.98-1.98-1.74-2.34-2.28
+    			s-0.53-1.07-0.53-1.6c0-0.77,0.29-1.42,0.88-1.97c0.58-0.55,1.31-0.82,2.17-0.82c0.55,0,1.08,0.13,1.58,0.38
+    			C132.22,202.02,132.76,202.49,133.34,203.17z"/>
+    		<path class="st3" d="M135,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7c0.23,0.17,0.52,0.25,0.86,0.25
+    			s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47c0,1.43-0.11,2.41-0.34,2.93
+    			c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6c-0.55-0.4-0.94-0.96-1.17-1.68
+    			c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M145.99,204.54v0.9c0.37-0.37,0.77-0.65,1.2-0.83c0.43-0.19,0.89-0.28,1.38-0.28c1.07,0,1.98,0.4,2.72,1.21
+    			c0.75,0.81,1.12,1.84,1.12,3.11c0,1.22-0.39,2.24-1.16,3.06c-0.77,0.82-1.69,1.23-2.75,1.23c-0.47,0-0.91-0.08-1.32-0.25
+    			s-0.81-0.44-1.21-0.82v3.86h-2.04v-11.18H145.99z M148.14,206.23c-0.65,0-1.18,0.22-1.61,0.66c-0.43,0.44-0.64,1.02-0.64,1.73
+    			c0,0.73,0.21,1.31,0.64,1.76c0.43,0.45,0.96,0.67,1.61,0.67c0.63,0,1.15-0.23,1.58-0.68c0.43-0.46,0.64-1.04,0.64-1.75
+    			c0-0.7-0.21-1.28-0.63-1.73C149.32,206.45,148.79,206.23,148.14,206.23z"/>
+    		<path class="st3" d="M162.01,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L162.01,209.23z M159.95,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H159.95z"/>
+    		<path class="st3" d="M162.88,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M168.78,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C168.11,201.3,168.42,201.17,168.78,201.17z M167.75,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M179.56,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L179.56,209.23z M177.51,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H177.51z"/>
+    		<path class="st3" d="M180.91,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M189.37,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M204.51,201.38h2.05v11.34h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V201.38z M202.36,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S203.01,206.23,202.36,206.23z"/>
+    		<path class="st3" d="M209.58,205.18h-1.17l-0.41-3.79h2L209.58,205.18z"/>
+    		<path class="st3" d="M211.49,201.66h2.09v11.06h-2.09V201.66z"/>
+    		<path class="st3" d="M215.42,204.54h2.05v0.84c0.46-0.39,0.89-0.67,1.27-0.82c0.38-0.15,0.76-0.23,1.16-0.23
+    			c0.81,0,1.5,0.28,2.07,0.85c0.48,0.48,0.71,1.19,0.71,2.14v5.41h-2.03v-3.58c0-0.98-0.04-1.62-0.13-1.95
+    			c-0.09-0.32-0.24-0.57-0.46-0.73c-0.22-0.17-0.49-0.25-0.81-0.25c-0.42,0-0.77,0.14-1.07,0.42s-0.5,0.66-0.62,1.15
+    			c-0.06,0.25-0.09,0.81-0.09,1.66v3.28h-2.05V204.54z"/>
+    		<path class="st3" d="M223.38,204.54h0.73c0-1.07,0.02-1.71,0.05-1.9c0.05-0.45,0.24-0.81,0.57-1.07c0.32-0.26,0.78-0.4,1.37-0.4
+    			c0.43,0,0.91,0.1,1.44,0.29v1.56c-0.3-0.08-0.54-0.13-0.73-0.13c-0.24,0-0.42,0.05-0.53,0.15c-0.08,0.08-0.12,0.23-0.12,0.47
+    			l-0.01,1.02h1.3v1.74h-1.3v6.45h-2.05v-6.45h-0.73V204.54z"/>
+    		<path class="st3" d="M232.2,204.33c0.77,0,1.5,0.19,2.18,0.58c0.68,0.39,1.21,0.91,1.59,1.57c0.38,0.66,0.57,1.38,0.57,2.14
+    			c0,0.77-0.19,1.49-0.58,2.17c-0.38,0.67-0.91,1.2-1.57,1.58c-0.66,0.38-1.39,0.57-2.19,0.57c-1.17,0-2.17-0.42-3-1.25
+    			c-0.83-0.83-1.24-1.85-1.24-3.04c0-1.28,0.47-2.34,1.41-3.2C230.19,204.7,231.14,204.33,232.2,204.33z M232.24,206.27
+    			c-0.64,0-1.17,0.22-1.59,0.67c-0.42,0.44-0.64,1.01-0.64,1.7c0,0.71,0.21,1.29,0.63,1.73c0.42,0.44,0.95,0.66,1.59,0.66
+    			c0.64,0,1.18-0.22,1.6-0.67s0.64-1.02,0.64-1.72s-0.21-1.27-0.63-1.71C233.43,206.48,232.89,206.27,232.24,206.27z"/>
+    		<path class="st3" d="M237.43,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M242.52,204.54h2.05v0.94c0.35-0.39,0.74-0.67,1.17-0.87c0.43-0.19,0.9-0.29,1.4-0.29
+    			c0.51,0,0.97,0.13,1.39,0.38c0.41,0.25,0.74,0.62,0.99,1.1c0.33-0.48,0.73-0.85,1.2-1.1c0.47-0.25,0.99-0.38,1.55-0.38
+    			c0.58,0,1.09,0.14,1.54,0.41s0.76,0.62,0.95,1.06c0.19,0.44,0.29,1.15,0.29,2.13v4.8h-2.07v-4.15c0-0.93-0.12-1.56-0.35-1.88
+    			s-0.58-0.49-1.04-0.49c-0.35,0-0.67,0.1-0.94,0.3c-0.28,0.2-0.49,0.48-0.62,0.83c-0.14,0.35-0.2,0.92-0.2,1.7v3.69h-2.07v-3.96
+    			c0-0.73-0.05-1.26-0.16-1.59c-0.11-0.33-0.27-0.57-0.49-0.73c-0.22-0.16-0.48-0.24-0.78-0.24c-0.34,0-0.65,0.1-0.93,0.3
+    			c-0.28,0.2-0.49,0.49-0.62,0.85c-0.14,0.37-0.21,0.94-0.21,1.73v3.64h-2.05V204.54z"/>
+    		<path class="st3" d="M262.74,204.54h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V204.54z M260.58,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S261.23,206.23,260.58,206.23z"/>
+    		<path class="st3" d="M266.81,201.53h2.05v3.02h1.22v1.77h-1.22v6.42h-2.05v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M271.68,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C271.01,201.3,271.32,201.17,271.68,201.17z M270.65,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M280.3,204.54h2.05v11.18h-2.05v-3.86c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V204.54z M278.14,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S278.79,206.23,278.14,206.23z"/>
+    		<path class="st3" d="M284.11,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M301.25,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L301.25,209.23z M299.2,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H299.2z"/>
+    		<path class="st3" d="M157.23,219.87h2.05v11.34h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V219.87z M155.07,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S155.72,224.71,155.07,224.71z"/>
+    		<path class="st3" d="M169.25,227.71h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L169.25,227.71z M167.2,226.1c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H167.2z"/>
+    		<path class="st3" d="M175.91,220.15h2.05l2.57,7.72l2.59-7.72h2.05l1.86,11.06h-2.04l-1.19-6.99l-2.35,6.99h-1.86l-2.33-6.99
+    			l-1.21,6.99h-2.05L175.91,220.15z"/>
+    		<path class="st3" d="M194.2,223.03h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V223.03z M192.04,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S192.69,224.71,192.04,224.71z"/>
+    		<path class="st3" d="M198.03,219.87h2.04v3.99c0.4-0.35,0.8-0.61,1.21-0.78s0.82-0.26,1.23-0.26c0.81,0,1.5,0.28,2.05,0.84
+    			c0.48,0.49,0.71,1.2,0.71,2.14v5.41h-2.02v-3.59c0-0.95-0.05-1.59-0.14-1.93s-0.24-0.59-0.46-0.75c-0.22-0.17-0.49-0.25-0.81-0.25
+    			c-0.42,0-0.77,0.14-1.07,0.41c-0.3,0.28-0.51,0.65-0.62,1.13c-0.06,0.25-0.09,0.81-0.09,1.68v3.29h-2.04V219.87z"/>
+    		<path class="st3" d="M213,219.87h2.05v11.34H213v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V219.87z M210.84,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S211.49,224.71,210.84,224.71z"/>
+    		<path class="st3" d="M217.62,219.66c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C216.95,219.79,217.26,219.66,217.62,219.66z M216.59,223.03h2.05v8.18h-2.05V223.03z"/>
+    		<path class="st3" d="M226.25,223.03h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V223.03z M224.09,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S224.74,224.71,224.09,224.71z"/>
+    	</g>
+    </g>
+    <g>
+    	<path class="st4" d="M258.96,180.39c2.76,2.94,6.15,4.42,10.18,4.42c4.16,0,7.61-1.45,10.35-4.34c2.74-2.89,4.11-6.69,4.11-11.38
+    		c0-4.59-1.37-8.31-4.11-11.16c-1.17-1.22-2.48-2.16-3.92-2.85c-6.15,2.92-12.78,5.63-19.81,8.11c-0.62,1.8-0.94,3.78-0.94,5.95
+    		C254.82,173.7,256.2,177.45,258.96,180.39z"/>
+    	<path class="st3" d="M116.36,180.49c0,4.69-1.72,8.61-5.16,11.75c-3.45,3.14-8.07,4.71-13.86,4.71c-7.7,0-13.85-3.01-18.44-9.03
+    		l8.15-8.88c1.55,1.81,3.37,3.27,5.46,4.39s3.94,1.67,5.56,1.67c1.74,0,3.15-0.42,4.22-1.26c1.07-0.84,1.6-1.81,1.6-2.91
+    		c0-2.04-1.92-4.03-5.77-5.97l-0.41-0.2l-4.06-2.03c-8.54-4.3-12.81-9.69-12.81-16.16c0-4.18,1.61-7.74,4.83-10.7
+    		c3.22-2.97,7.33-4.45,12.35-4.45c3.43,0,6.65,0.76,9.68,2.26c3.03,1.51,5.59,3.67,7.69,6.48l-8.2,8.2
+    		c-3.33-3.3-6.36-4.95-9.07-4.95c-1.49,0-2.66,0.32-3.5,0.95c-0.84,0.63-1.26,1.41-1.26,2.35c0,0.71,0.27,1.37,0.8,1.97
+    		c0.53,0.6,1.85,1.41,3.96,2.45l4.85,2.43c5.11,2.52,8.62,5.09,10.53,7.71c1.34,1.84,2.2,3.91,2.6,6.21
+    		C116.27,178.44,116.36,179.45,116.36,180.49z"/>
+    	<path class="st3" d="M131.97,121.04c-2.32,0-4.31,0.82-5.95,2.48c-1.65,1.65-2.47,3.64-2.47,5.97c0,2.43,0.83,4.49,2.49,6.19
+    		s3.67,2.55,6.03,2.55c2.29,0,4.26-0.83,5.9-2.5c1.65-1.67,2.47-3.68,2.47-6.04c0-2.39-0.83-4.43-2.49-6.12
+    		C136.28,121.88,134.29,121.04,131.97,121.04z"/>
+    	<rect x="125.34" y="142.78" class="st3" width="13.25" height="52.81"/>
+    	<path class="st3" d="M231.43,164.62v30.97h-13.34v-22.25h-0.01v-4.54c0-5.99-0.74-10.04-2.23-12.16s-3.72-3.18-6.7-3.18
+    		c-2.26,0-4.29,0.65-6.09,1.94c-1.78,1.3-3.13,3.08-4,5.37c-0.88,2.28-1.3,5.94-1.3,10.99v4.89h-0.01v18.94h-13.34v-17.47h-0.01
+    		v-8.11c0-4.72-0.35-8.14-1.04-10.26c-0.7-2.12-1.75-3.7-3.14-4.74c-1.4-1.03-3.08-1.55-5.06-1.55c-2.21,0-4.21,0.66-6.01,1.97
+    		s-3.14,3.14-4.04,5.51c-0.89,2.36-1.33,6.08-1.33,11.16v23.49h-13.25v-52.81h13.25v6.07c2.26-2.49,4.78-4.35,7.55-5.58
+    		c2.76-1.23,5.78-1.85,9.05-1.85c3.31,0,6.28,0.81,8.94,2.43c2.67,1.62,4.79,3.98,6.42,7.09c2.1-3.11,4.68-5.47,7.75-7.09
+    		c3.05-1.62,6.39-2.43,10.03-2.43c3.75,0,7.04,0.88,9.89,2.63c2.86,1.74,4.9,4.02,6.15,6.84
+    		C230.8,153.7,231.43,158.28,231.43,164.62z"/>
+    	<path class="st3" d="M283.02,142.78v5.83c-2.36-2.4-4.93-4.19-7.7-5.39c-2.78-1.2-5.76-1.8-8.92-1.8c-6.89,0-12.74,2.61-17.55,7.82
+    		c-4.49,4.86-6.86,11.01-7.16,18.44c-0.03,0.53-0.07,1.05-0.07,1.6c0,7.86,2.49,14.44,7.47,19.73s10.87,7.94,17.69,7.94
+    		c3.04,0,5.86-0.55,8.46-1.63s5.2-2.86,7.78-5.31v5.58h13.25v-52.81H283.02z M279.49,157.93c2.74,2.84,4.12,6.56,4.12,11.16
+    		c0,4.69-1.38,8.48-4.12,11.38c-2.74,2.89-6.19,4.34-10.35,4.34c-4.03,0-7.42-1.47-10.18-4.41c-2.76-2.95-4.13-6.7-4.13-11.26
+    		c0-2.18,0.32-4.16,0.94-5.96c0.68-1.94,1.71-3.68,3.12-5.18c2.71-2.9,6.11-4.35,10.21-4.35c2.4,0,4.55,0.49,6.48,1.42
+    		C277.01,155.77,278.32,156.71,279.49,157.93z"/>
+    </g>
+  </svg>
 </svg>
--- clean/assets/icon-maskable.svg	2026-10-21 13:34:45.514451343 +0100
+++ 069-isima-logo-icon/assets/icon-maskable.svg	2026-10-21 13:57:32.878955320 +0100
@@ -1,10 +1,12 @@
 <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
-  <!-- Maskable app icon source (issue 068): same mark as assets/icon.svg
-       scaled 0.75 about the canvas centre, so the whole glyph stays inside
-       the Android maskable safe zone (inner 80% circle) when the OS crops it
-       to a circle/squircle. Background stays full-bleed and opaque.
+  <!-- Maskable app icon source (issue 069): same lockup as assets/icon.svg
+       scaled to 312 px of canvas width (61%), centred. The lockup rect then
+       spans 312x239.7 centred on the canvas, whose far corners sit 197.0 px
+       from centre — inside the maskable safe zone (inner 80% circle, radius
+       204.8 px at 512). Background stays full-bleed and opaque (the OS crops).
        Generate with:
-       rsvg-convert -w 512 -h 512 assets/icon-maskable.svg -o assets/icon-maskable-512.png -->
+         rsvg-convert -w 512 -h 512 assets/icon-maskable.svg -o /tmp/mask512.png
+       then flatten to RGB as for icon.svg. -->
   <defs>
     <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stop-color="#0b4da2"/>
@@ -12,13 +14,212 @@
     </linearGradient>
   </defs>
   <rect width="512" height="512" fill="url(#bg)"/>
-  <g transform="translate(256 256) scale(0.75) translate(-256 -256)">
-    <g fill="#ffffff">
-      <rect x="156" y="84" width="44" height="284"/>
-      <rect x="156" y="84" width="200" height="44"/>
-      <rect x="156" y="204" width="160" height="44"/>
-      <rect x="156" y="324" width="200" height="44"/>
+  <svg x="100" y="136.15" width="312" height="239.7" viewBox="0 0 301.26 231.42">
+  <!-- Official ISIMa lockup, white-on-dark variant, copied verbatim from
+       https://isima.rnu.tn/build/assets/logo-slider-BmNTy0I4.svg
+       (retrieved 2026-10-21; provenance and licence notes in
+       issues/069-isima-logo-icon.md). Original viewBox 0 0 301.26 231.42,
+       ink fills it edge to edge. -->
+    <style type="text/css">
+    	.st0{fill:url(#SVGID_1_);}
+    	.st1{fill:url(#SVGID_00000012452033857554364170000003166221339989402757_);}
+    	.st2{fill:url(#SVGID_00000106870024935404341590000005112153355012736653_);}
+    	.st3{fill:#FFFFFF;}
+    	.st4{display:none;fill:#FFFFFF;}
+    </style>
+    <linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="97.8798" y1="5.9047" x2="122.0952" y2="24.8238">
+    	<stop  offset="0.1818" style="stop-color:#F1EE82"/>
+    	<stop  offset="1" style="stop-color:#7DBA42"/>
+    </linearGradient>
+    <circle class="st0" cx="109.99" cy="15.36" r="15.36"/>
+    <linearGradient id="SVGID_00000063620961977237544380000008804526131405976760_" gradientUnits="userSpaceOnUse" x1="52.7452" y1="216.4774" x2="52.7452" y2="30.7285">
+    	<stop  offset="0.1879" style="stop-color:#094D6A"/>
+    	<stop  offset="1" style="stop-color:#23C2E2"/>
+    </linearGradient>
+    <path style="fill:url(#SVGID_00000063620961977237544380000008804526131405976760_);" d="M63.9,30.73c0,0-78.28,100.57-61.55,160.48
+    	c14.05,50.31,62.94,16.38,77.28-22.69c0,0-41.87,54.73-48.33,30c-6.46-24.73,32.32-101.74,74.2-136.87L88.07,30.73H63.9z"/>
+    <linearGradient id="SVGID_00000032623394942694470310000014129266982845146030_" gradientUnits="userSpaceOnUse" x1="-16.5952" y1="176.9333" x2="91.5816" y2="33.3779">
+    	<stop  offset="0" style="stop-color:#094D6A;stop-opacity:0"/>
+    	<stop  offset="0.4424" style="stop-color:#34C2DC"/>
+    </linearGradient>
+    <path style="fill:url(#SVGID_00000032623394942694470310000014129266982845146030_);" d="M63.9,30.73c0,0-78.28,100.57-61.55,160.48
+    	l8.71-12.37C4.59,154.11,88.07,30.73,88.07,30.73H63.9z"/>
+    <g>
+    	<g>
+    		<path class="st3" d="M78.72,201.66h2.09v11.06h-2.09V201.66z"/>
+    		<path class="st3" d="M82.65,204.54h2.05v0.84c0.46-0.39,0.89-0.67,1.27-0.82c0.38-0.15,0.76-0.23,1.16-0.23
+    			c0.81,0,1.5,0.28,2.06,0.85c0.48,0.48,0.71,1.19,0.71,2.14v5.41h-2.03v-3.58c0-0.98-0.04-1.62-0.13-1.95
+    			c-0.09-0.32-0.24-0.57-0.46-0.73c-0.22-0.17-0.49-0.25-0.81-0.25c-0.41,0-0.77,0.14-1.07,0.42c-0.3,0.28-0.5,0.66-0.62,1.15
+    			c-0.06,0.25-0.09,0.81-0.09,1.66v3.28h-2.05V204.54z"/>
+    		<path class="st3" d="M96.6,205.69l-1.27,1.27c-0.52-0.51-0.99-0.77-1.41-0.77c-0.23,0-0.41,0.05-0.54,0.15s-0.2,0.22-0.2,0.36
+    			c0,0.11,0.04,0.21,0.12,0.3c0.08,0.09,0.29,0.22,0.61,0.38l0.75,0.38c0.79,0.39,1.34,0.79,1.63,1.2s0.44,0.88,0.44,1.43
+    			c0,0.73-0.27,1.33-0.8,1.82c-0.53,0.49-1.25,0.73-2.15,0.73c-1.19,0-2.15-0.47-2.86-1.4l1.26-1.38c0.24,0.28,0.52,0.51,0.85,0.68
+    			c0.32,0.17,0.61,0.26,0.86,0.26c0.27,0,0.49-0.06,0.65-0.2c0.17-0.13,0.25-0.28,0.25-0.45c0-0.32-0.3-0.62-0.89-0.92l-0.69-0.35
+    			c-1.32-0.67-1.99-1.5-1.99-2.5c0-0.65,0.25-1.2,0.75-1.66s1.14-0.69,1.91-0.69c0.53,0,1.03,0.12,1.5,0.35
+    			C95.87,204.92,96.27,205.25,96.6,205.69z"/>
+    		<path class="st3" d="M98.3,201.53h2.05v3.02h1.22v1.77h-1.22v6.42H98.3v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M103.17,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C102.5,201.3,102.81,201.17,103.17,201.17z M102.14,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M106,201.53h2.05v3.02h1.22v1.77h-1.22v6.42H106v-6.42h-1.05v-1.77H106V201.53z"/>
+    		<path class="st3" d="M110.05,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M119.24,201.53h2.05v3.02h1.22v1.77h-1.22v6.42h-2.05v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M133.34,203.17l-1.56,1.38c-0.55-0.76-1.11-1.14-1.67-1.14c-0.28,0-0.5,0.07-0.68,0.22
+    			c-0.18,0.15-0.26,0.32-0.26,0.5s0.06,0.36,0.19,0.53c0.17,0.22,0.69,0.69,1.54,1.42c0.8,0.67,1.29,1.1,1.46,1.27
+    			c0.43,0.43,0.73,0.84,0.91,1.24c0.18,0.39,0.27,0.82,0.27,1.29c0,0.91-0.31,1.66-0.94,2.25c-0.63,0.59-1.45,0.89-2.46,0.89
+    			c-0.79,0-1.47-0.19-2.06-0.58s-1.09-0.99-1.5-1.82l1.77-1.07c0.53,0.98,1.14,1.47,1.84,1.47c0.36,0,0.67-0.11,0.91-0.32
+    			c0.25-0.21,0.37-0.45,0.37-0.73c0-0.25-0.09-0.5-0.28-0.75c-0.19-0.25-0.6-0.63-1.23-1.15c-1.21-0.98-1.98-1.74-2.34-2.28
+    			s-0.53-1.07-0.53-1.6c0-0.77,0.29-1.42,0.88-1.97c0.58-0.55,1.31-0.82,2.17-0.82c0.55,0,1.08,0.13,1.58,0.38
+    			C132.22,202.02,132.76,202.49,133.34,203.17z"/>
+    		<path class="st3" d="M135,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7c0.23,0.17,0.52,0.25,0.86,0.25
+    			s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47c0,1.43-0.11,2.41-0.34,2.93
+    			c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6c-0.55-0.4-0.94-0.96-1.17-1.68
+    			c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M145.99,204.54v0.9c0.37-0.37,0.77-0.65,1.2-0.83c0.43-0.19,0.89-0.28,1.38-0.28c1.07,0,1.98,0.4,2.72,1.21
+    			c0.75,0.81,1.12,1.84,1.12,3.11c0,1.22-0.39,2.24-1.16,3.06c-0.77,0.82-1.69,1.23-2.75,1.23c-0.47,0-0.91-0.08-1.32-0.25
+    			s-0.81-0.44-1.21-0.82v3.86h-2.04v-11.18H145.99z M148.14,206.23c-0.65,0-1.18,0.22-1.61,0.66c-0.43,0.44-0.64,1.02-0.64,1.73
+    			c0,0.73,0.21,1.31,0.64,1.76c0.43,0.45,0.96,0.67,1.61,0.67c0.63,0,1.15-0.23,1.58-0.68c0.43-0.46,0.64-1.04,0.64-1.75
+    			c0-0.7-0.21-1.28-0.63-1.73C149.32,206.45,148.79,206.23,148.14,206.23z"/>
+    		<path class="st3" d="M162.01,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L162.01,209.23z M159.95,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H159.95z"/>
+    		<path class="st3" d="M162.88,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M168.78,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C168.11,201.3,168.42,201.17,168.78,201.17z M167.75,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M179.56,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L179.56,209.23z M177.51,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H177.51z"/>
+    		<path class="st3" d="M180.91,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M189.37,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M204.51,201.38h2.05v11.34h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V201.38z M202.36,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S203.01,206.23,202.36,206.23z"/>
+    		<path class="st3" d="M209.58,205.18h-1.17l-0.41-3.79h2L209.58,205.18z"/>
+    		<path class="st3" d="M211.49,201.66h2.09v11.06h-2.09V201.66z"/>
+    		<path class="st3" d="M215.42,204.54h2.05v0.84c0.46-0.39,0.89-0.67,1.27-0.82c0.38-0.15,0.76-0.23,1.16-0.23
+    			c0.81,0,1.5,0.28,2.07,0.85c0.48,0.48,0.71,1.19,0.71,2.14v5.41h-2.03v-3.58c0-0.98-0.04-1.62-0.13-1.95
+    			c-0.09-0.32-0.24-0.57-0.46-0.73c-0.22-0.17-0.49-0.25-0.81-0.25c-0.42,0-0.77,0.14-1.07,0.42s-0.5,0.66-0.62,1.15
+    			c-0.06,0.25-0.09,0.81-0.09,1.66v3.28h-2.05V204.54z"/>
+    		<path class="st3" d="M223.38,204.54h0.73c0-1.07,0.02-1.71,0.05-1.9c0.05-0.45,0.24-0.81,0.57-1.07c0.32-0.26,0.78-0.4,1.37-0.4
+    			c0.43,0,0.91,0.1,1.44,0.29v1.56c-0.3-0.08-0.54-0.13-0.73-0.13c-0.24,0-0.42,0.05-0.53,0.15c-0.08,0.08-0.12,0.23-0.12,0.47
+    			l-0.01,1.02h1.3v1.74h-1.3v6.45h-2.05v-6.45h-0.73V204.54z"/>
+    		<path class="st3" d="M232.2,204.33c0.77,0,1.5,0.19,2.18,0.58c0.68,0.39,1.21,0.91,1.59,1.57c0.38,0.66,0.57,1.38,0.57,2.14
+    			c0,0.77-0.19,1.49-0.58,2.17c-0.38,0.67-0.91,1.2-1.57,1.58c-0.66,0.38-1.39,0.57-2.19,0.57c-1.17,0-2.17-0.42-3-1.25
+    			c-0.83-0.83-1.24-1.85-1.24-3.04c0-1.28,0.47-2.34,1.41-3.2C230.19,204.7,231.14,204.33,232.2,204.33z M232.24,206.27
+    			c-0.64,0-1.17,0.22-1.59,0.67c-0.42,0.44-0.64,1.01-0.64,1.7c0,0.71,0.21,1.29,0.63,1.73c0.42,0.44,0.95,0.66,1.59,0.66
+    			c0.64,0,1.18-0.22,1.6-0.67s0.64-1.02,0.64-1.72s-0.21-1.27-0.63-1.71C233.43,206.48,232.89,206.27,232.24,206.27z"/>
+    		<path class="st3" d="M237.43,204.54h1.76v1.03c0.19-0.41,0.44-0.71,0.76-0.92c0.32-0.21,0.66-0.32,1.04-0.32
+    			c0.27,0,0.54,0.07,0.83,0.21l-0.64,1.77c-0.24-0.12-0.44-0.18-0.59-0.18c-0.32,0-0.58,0.2-0.8,0.59c-0.22,0.39-0.33,1.16-0.33,2.3
+    			l0.01,0.4v3.31h-2.04V204.54z"/>
+    		<path class="st3" d="M242.52,204.54h2.05v0.94c0.35-0.39,0.74-0.67,1.17-0.87c0.43-0.19,0.9-0.29,1.4-0.29
+    			c0.51,0,0.97,0.13,1.39,0.38c0.41,0.25,0.74,0.62,0.99,1.1c0.33-0.48,0.73-0.85,1.2-1.1c0.47-0.25,0.99-0.38,1.55-0.38
+    			c0.58,0,1.09,0.14,1.54,0.41s0.76,0.62,0.95,1.06c0.19,0.44,0.29,1.15,0.29,2.13v4.8h-2.07v-4.15c0-0.93-0.12-1.56-0.35-1.88
+    			s-0.58-0.49-1.04-0.49c-0.35,0-0.67,0.1-0.94,0.3c-0.28,0.2-0.49,0.48-0.62,0.83c-0.14,0.35-0.2,0.92-0.2,1.7v3.69h-2.07v-3.96
+    			c0-0.73-0.05-1.26-0.16-1.59c-0.11-0.33-0.27-0.57-0.49-0.73c-0.22-0.16-0.48-0.24-0.78-0.24c-0.34,0-0.65,0.1-0.93,0.3
+    			c-0.28,0.2-0.49,0.49-0.62,0.85c-0.14,0.37-0.21,0.94-0.21,1.73v3.64h-2.05V204.54z"/>
+    		<path class="st3" d="M262.74,204.54h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V204.54z M260.58,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S261.23,206.23,260.58,206.23z"/>
+    		<path class="st3" d="M266.81,201.53h2.05v3.02h1.22v1.77h-1.22v6.42h-2.05v-6.42h-1.05v-1.77h1.05V201.53z"/>
+    		<path class="st3" d="M271.68,201.17c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C271.01,201.3,271.32,201.17,271.68,201.17z M270.65,204.54h2.05v8.18h-2.05V204.54z"/>
+    		<path class="st3" d="M280.3,204.54h2.05v11.18h-2.05v-3.86c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V204.54z M278.14,206.23c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S278.79,206.23,278.14,206.23z"/>
+    		<path class="st3" d="M284.11,204.54h2.08v3.94c0,0.77,0.05,1.3,0.16,1.6c0.11,0.3,0.28,0.53,0.51,0.7
+    			c0.23,0.17,0.52,0.25,0.86,0.25s0.63-0.08,0.87-0.24c0.24-0.16,0.42-0.4,0.53-0.72c0.08-0.24,0.13-0.74,0.13-1.51v-4.01h2.05v3.47
+    			c0,1.43-0.11,2.41-0.34,2.93c-0.28,0.64-0.68,1.13-1.22,1.48c-0.54,0.34-1.22,0.52-2.05,0.52c-0.9,0-1.62-0.2-2.18-0.6
+    			c-0.55-0.4-0.94-0.96-1.17-1.68c-0.16-0.5-0.24-1.4-0.24-2.71V204.54z"/>
+    		<path class="st3" d="M301.25,209.23h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L301.25,209.23z M299.2,207.61c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H299.2z"/>
+    		<path class="st3" d="M157.23,219.87h2.05v11.34h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V219.87z M155.07,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S155.72,224.71,155.07,224.71z"/>
+    		<path class="st3" d="M169.25,227.71h-6.6c0.1,0.58,0.35,1.04,0.76,1.39c0.41,0.34,0.94,0.51,1.58,0.51c0.77,0,1.43-0.27,1.98-0.8
+    			l1.73,0.81c-0.43,0.61-0.95,1.06-1.55,1.36s-1.32,0.44-2.14,0.44c-1.28,0-2.33-0.41-3.14-1.21s-1.21-1.82-1.21-3.04
+    			c0-1.25,0.4-2.29,1.21-3.11c0.8-0.82,1.81-1.24,3.03-1.24c1.29,0,2.34,0.41,3.14,1.24c0.81,0.83,1.21,1.92,1.21,3.27
+    			L169.25,227.71z M167.2,226.1c-0.14-0.46-0.4-0.83-0.8-1.11c-0.4-0.29-0.86-0.43-1.39-0.43c-0.57,0-1.07,0.16-1.51,0.48
+    			c-0.27,0.2-0.52,0.55-0.75,1.06H167.2z"/>
+    		<path class="st3" d="M175.91,220.15h2.05l2.57,7.72l2.59-7.72h2.05l1.86,11.06h-2.04l-1.19-6.99l-2.35,6.99h-1.86l-2.33-6.99
+    			l-1.21,6.99h-2.05L175.91,220.15z"/>
+    		<path class="st3" d="M194.2,223.03h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V223.03z M192.04,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S192.69,224.71,192.04,224.71z"/>
+    		<path class="st3" d="M198.03,219.87h2.04v3.99c0.4-0.35,0.8-0.61,1.21-0.78s0.82-0.26,1.23-0.26c0.81,0,1.5,0.28,2.05,0.84
+    			c0.48,0.49,0.71,1.2,0.71,2.14v5.41h-2.02v-3.59c0-0.95-0.05-1.59-0.14-1.93s-0.24-0.59-0.46-0.75c-0.22-0.17-0.49-0.25-0.81-0.25
+    			c-0.42,0-0.77,0.14-1.07,0.41c-0.3,0.28-0.51,0.65-0.62,1.13c-0.06,0.25-0.09,0.81-0.09,1.68v3.29h-2.04V219.87z"/>
+    		<path class="st3" d="M213,219.87h2.05v11.34H213v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V219.87z M210.84,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S211.49,224.71,210.84,224.71z"/>
+    		<path class="st3" d="M217.62,219.66c0.36,0,0.67,0.13,0.93,0.39c0.26,0.26,0.39,0.58,0.39,0.95c0,0.37-0.13,0.68-0.38,0.94
+    			c-0.26,0.26-0.56,0.39-0.92,0.39c-0.37,0-0.68-0.13-0.93-0.39c-0.26-0.26-0.39-0.58-0.39-0.96c0-0.36,0.13-0.67,0.38-0.93
+    			C216.95,219.79,217.26,219.66,217.62,219.66z M216.59,223.03h2.05v8.18h-2.05V223.03z"/>
+    		<path class="st3" d="M226.25,223.03h2.05v8.18h-2.05v-0.87c-0.4,0.38-0.8,0.66-1.21,0.82s-0.84,0.25-1.31,0.25
+    			c-1.06,0-1.97-0.41-2.74-1.23c-0.77-0.82-1.16-1.84-1.16-3.06c0-1.26,0.37-2.3,1.12-3.11c0.75-0.81,1.65-1.21,2.72-1.21
+    			c0.49,0,0.95,0.09,1.38,0.28c0.43,0.19,0.83,0.46,1.2,0.83V223.03z M224.09,224.71c-0.63,0-1.16,0.22-1.58,0.67
+    			c-0.42,0.45-0.63,1.02-0.63,1.73c0,0.71,0.21,1.29,0.64,1.75c0.43,0.46,0.95,0.68,1.58,0.68c0.64,0,1.18-0.22,1.6-0.67
+    			c0.42-0.45,0.64-1.04,0.64-1.76c0-0.71-0.21-1.29-0.64-1.73S224.74,224.71,224.09,224.71z"/>
+    	</g>
+    </g>
+    <g>
+    	<path class="st4" d="M258.96,180.39c2.76,2.94,6.15,4.42,10.18,4.42c4.16,0,7.61-1.45,10.35-4.34c2.74-2.89,4.11-6.69,4.11-11.38
+    		c0-4.59-1.37-8.31-4.11-11.16c-1.17-1.22-2.48-2.16-3.92-2.85c-6.15,2.92-12.78,5.63-19.81,8.11c-0.62,1.8-0.94,3.78-0.94,5.95
+    		C254.82,173.7,256.2,177.45,258.96,180.39z"/>
+    	<path class="st3" d="M116.36,180.49c0,4.69-1.72,8.61-5.16,11.75c-3.45,3.14-8.07,4.71-13.86,4.71c-7.7,0-13.85-3.01-18.44-9.03
+    		l8.15-8.88c1.55,1.81,3.37,3.27,5.46,4.39s3.94,1.67,5.56,1.67c1.74,0,3.15-0.42,4.22-1.26c1.07-0.84,1.6-1.81,1.6-2.91
+    		c0-2.04-1.92-4.03-5.77-5.97l-0.41-0.2l-4.06-2.03c-8.54-4.3-12.81-9.69-12.81-16.16c0-4.18,1.61-7.74,4.83-10.7
+    		c3.22-2.97,7.33-4.45,12.35-4.45c3.43,0,6.65,0.76,9.68,2.26c3.03,1.51,5.59,3.67,7.69,6.48l-8.2,8.2
+    		c-3.33-3.3-6.36-4.95-9.07-4.95c-1.49,0-2.66,0.32-3.5,0.95c-0.84,0.63-1.26,1.41-1.26,2.35c0,0.71,0.27,1.37,0.8,1.97
+    		c0.53,0.6,1.85,1.41,3.96,2.45l4.85,2.43c5.11,2.52,8.62,5.09,10.53,7.71c1.34,1.84,2.2,3.91,2.6,6.21
+    		C116.27,178.44,116.36,179.45,116.36,180.49z"/>
+    	<path class="st3" d="M131.97,121.04c-2.32,0-4.31,0.82-5.95,2.48c-1.65,1.65-2.47,3.64-2.47,5.97c0,2.43,0.83,4.49,2.49,6.19
+    		s3.67,2.55,6.03,2.55c2.29,0,4.26-0.83,5.9-2.5c1.65-1.67,2.47-3.68,2.47-6.04c0-2.39-0.83-4.43-2.49-6.12
+    		C136.28,121.88,134.29,121.04,131.97,121.04z"/>
+    	<rect x="125.34" y="142.78" class="st3" width="13.25" height="52.81"/>
+    	<path class="st3" d="M231.43,164.62v30.97h-13.34v-22.25h-0.01v-4.54c0-5.99-0.74-10.04-2.23-12.16s-3.72-3.18-6.7-3.18
+    		c-2.26,0-4.29,0.65-6.09,1.94c-1.78,1.3-3.13,3.08-4,5.37c-0.88,2.28-1.3,5.94-1.3,10.99v4.89h-0.01v18.94h-13.34v-17.47h-0.01
+    		v-8.11c0-4.72-0.35-8.14-1.04-10.26c-0.7-2.12-1.75-3.7-3.14-4.74c-1.4-1.03-3.08-1.55-5.06-1.55c-2.21,0-4.21,0.66-6.01,1.97
+    		s-3.14,3.14-4.04,5.51c-0.89,2.36-1.33,6.08-1.33,11.16v23.49h-13.25v-52.81h13.25v6.07c2.26-2.49,4.78-4.35,7.55-5.58
+    		c2.76-1.23,5.78-1.85,9.05-1.85c3.31,0,6.28,0.81,8.94,2.43c2.67,1.62,4.79,3.98,6.42,7.09c2.1-3.11,4.68-5.47,7.75-7.09
+    		c3.05-1.62,6.39-2.43,10.03-2.43c3.75,0,7.04,0.88,9.89,2.63c2.86,1.74,4.9,4.02,6.15,6.84
+    		C230.8,153.7,231.43,158.28,231.43,164.62z"/>
+    	<path class="st3" d="M283.02,142.78v5.83c-2.36-2.4-4.93-4.19-7.7-5.39c-2.78-1.2-5.76-1.8-8.92-1.8c-6.89,0-12.74,2.61-17.55,7.82
+    		c-4.49,4.86-6.86,11.01-7.16,18.44c-0.03,0.53-0.07,1.05-0.07,1.6c0,7.86,2.49,14.44,7.47,19.73s10.87,7.94,17.69,7.94
+    		c3.04,0,5.86-0.55,8.46-1.63s5.2-2.86,7.78-5.31v5.58h13.25v-52.81H283.02z M279.49,157.93c2.74,2.84,4.12,6.56,4.12,11.16
+    		c0,4.69-1.38,8.48-4.12,11.38c-2.74,2.89-6.19,4.34-10.35,4.34c-4.03,0-7.42-1.47-10.18-4.41c-2.76-2.95-4.13-6.7-4.13-11.26
+    		c0-2.18,0.32-4.16,0.94-5.96c0.68-1.94,1.71-3.68,3.12-5.18c2.71-2.9,6.11-4.35,10.21-4.35c2.4,0,4.55,0.49,6.48,1.42
+    		C277.01,155.77,278.32,156.71,279.49,157.93z"/>
     </g>
-    <rect x="156" y="406" width="140" height="22" rx="11" fill="#7fb2ff"/>
-  </g>
+  </svg>
 </svg>
--- clean/test/pwa.test.js	2026-10-21 13:34:45.515451317 +0100
+++ 069-isima-logo-icon/test/pwa.test.js	2026-10-21 14:01:41.020356577 +0100
@@ -16,6 +16,7 @@
 var assert = require('node:assert');
 var fs = require('node:fs');
 var path = require('node:path');
+var zlib = require('node:zlib');
 
 var ROOT = path.join(__dirname, '..');
 var PAGES = ['index.html', 'classes.html', 'time.html', 'timetable.html'];
@@ -192,3 +193,104 @@
     assert.ok(/\.png$/.test(i.src), 'icon src must keep a .png extension for MIME safety: ' + i.src);
   });
 });
+
+// ---- issue 069: the ISIMa logo icon set -----------------------------------
+
+// Decode an 8-bit opaque-RGB PNG down to raw RGB triples, in pure node:
+// walk the chunks, inflate the IDAT stream, then un-scanline the per-row
+// filters (0..4). This lets the safe-zone test below measure the REAL pixels
+// the OS will crop, not the authoring intent.
+function decodePngRgb(rel) {
+  var ihdr = pngIhdr(rel);
+  assert.strictEqual(ihdr.colorType, 2, rel + ' must be opaque RGB (no alpha)');
+  var buf = fs.readFileSync(path.join(ROOT, rel));
+  assert.strictEqual(buf[24], 8, rel + ' must be 8-bit');
+  var off = 8, idat = [], w = ihdr.width, h = ihdr.height;
+  while (off < buf.length) {
+    var len = buf.readUInt32BE(off);
+    var type = buf.toString('latin1', off + 4, off + 8);
+    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
+    if (type === 'IEND') break;
+    off += 12 + len;
+  }
+  var raw = zlib.inflateSync(Buffer.concat(idat));
+  var bpp = 3, stride = w * bpp, out = Buffer.alloc(stride * h);
+  for (var y = 0; y < h; y++) {
+    var f = raw[y * (stride + 1)];
+    var src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
+    var cur = out.subarray(y * stride, (y + 1) * stride);
+    var prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
+    for (var x = 0; x < stride; x++) {
+      var a = x >= bpp ? cur[x - bpp] : 0;
+      var b = prev ? prev[x] : 0;
+      var c = (prev && x >= bpp) ? prev[x - bpp] : 0;
+      var v = src[x];
+      if (f === 1) v += a;
+      else if (f === 2) v += b;
+      else if (f === 3) v += (a + b) >> 1;
+      else if (f === 4) {
+        var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
+        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
+      }
+      cur[x] = v & 0xff;
+    }
+  }
+  return out;
+}
+
+test('the maskable icon keeps the ISIMa logo inside the safe zone, full-bleed (issue 069)', function () {
+  // The OS crops a maskable icon to a circle/squircle: every ink pixel must
+  // live in the inner 80% circle (radius 204.8 px at 512) and the background
+  // must reach every edge (an alpha channel or letterboxed gap would show as
+  // junk). Measure that against the committed PNG's real pixels.
+  var m = readManifest();
+  var maskable = m.icons.filter(function (i) {
+    return i.purpose && i.purpose.split(/\s+/).indexOf('maskable') !== -1;
+  });
+  assert.strictEqual(maskable.length, 1, 'exactly one maskable icon');
+  var w = 512, h = 512, px = decodePngRgb(maskable[0].src);
+  // Full-bleed background of assets/icon-maskable.svg: ISIM Blue gradient
+  // #0b4da2 (top) -> #052455 (bottom).
+  var top = [0x0b, 0x4d, 0xa2], bot = [0x05, 0x24, 0x55], tol = 25;
+  var ink = 0, maxDist = 0;
+  function delta(x, y) {
+    var t = (y + 0.5) / h, i = (y * w + x) * 3, d = 0;
+    for (var ch = 0; ch < 3; ch++) {
+      d = Math.max(d, Math.abs(px[i + ch] - (top[ch] + (bot[ch] - top[ch]) * t)));
+    }
+    return d;
+  }
+  for (var y = 0; y < h; y++) {
+    for (var x = 0; x < w; x++) {
+      if (delta(x, y) > tol) {
+        ink++;
+        var dist = Math.sqrt((x + 0.5 - w / 2) * (x + 0.5 - w / 2) + (y + 0.5 - h / 2) * (y + 0.5 - h / 2));
+        if (dist > maxDist) maxDist = dist;
+      }
+    }
+  }
+  assert.ok(ink > 10000, 'the logo artwork must actually be on the maskable icon (ink px: ' + ink + ')');
+  assert.ok(maxDist <= 204.8,
+    'every ink pixel must stay in the maskable safe zone: ' + maxDist.toFixed(1) + ' px from centre');
+  [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].forEach(function (c) {
+    assert.ok(delta(c[0], c[1]) <= tol,
+      'corner must be full-bleed background, not artwork or a gap: ' + c);
+  });
+});
+
+test('the committed icon art is the official ISIMa logo (issue 069)', function () {
+  // Provenance pin: the verbatim download and both compositions share the
+  // official lockup's viewBox, and every shipped PNG is real art (the file
+  // sizes moved from ~1.4-3.0 KB monogram to ~8-28 KB logo bytes).
+  var logo = readSrc('assets/isima-logo.svg');
+  assert.ok(logo.length > 10000, 'the verbatim official logo must be kept');
+  assert.ok(logo.indexOf('301.26 231.42') !== -1, 'official lockup viewBox');
+  ['assets/icon.svg', 'assets/icon-maskable.svg'].forEach(function (f) {
+    var src = readSrc(f);
+    assert.ok(src.indexOf('301.26 231.42') !== -1, f + ' must embed the official lockup');
+  });
+  ['assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
+    'assets/apple-touch-icon.png'].forEach(function (f) {
+    assert.ok(fs.statSync(path.join(ROOT, f)).size > 4096, f + ' must be real logo art, not a stub');
+  });
+});
```

**Not done** (scope discipline): no git operations (main agent owns those);
`js/theme.js`, `styles.css`, `test/theme-boot.test.js`, `data/`, `README.md`,
`Design.md`, other `issues/*.md` and open issues 054/067 untouched (neither
README nor Design references the icon art — `grep`-verified, so no doc went
stale).

**Risks for the reviewer**

1. **Trademark**: no licence found anywhere (see Provenance); this is an
   unofficial utility using the institute's mark to identify the institute.
   If that position is unwanted, reverting the two source SVGs + 4 PNGs
   restores the old monogram with zero structural change.
2. **Renderer differences**: the composed SVGs nest the official `<svg>` with
   its `<style>` classes; verified rendering identically under librsvg (the
   PNG generator) and Chromium (Playwright). Firefox/Safari not exercised.
3. The official artwork bleeds to its own viewBox edges (as published — the
   institute's own icons do the same); this is faithful reproduction, not a
   cropping bug.
4. iOS applies its own icon treatment (mask + possible zoom) to the 180 px
   touch icon; not verifiable without a device.
