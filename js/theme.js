/* js/theme.js — Layer: Material You (Material Design 3) color engine.
 *
 * Dependency-free, ES5-safe port of the HCT color space plus the
 * SchemeTonalSpot (spec 2021) role tables. From a primary key color
 * (optionally secondary / tertiary / error keys) it derives every M3 role
 * and exposes them as CSS custom properties on <html>.
 *
 * HCT math is a validated port of material-foundation/material-color-utilities.
 *
 * Public API (global `TT.theme`, also `module.exports` under Node):
 *   Theme.PRESETS           named presets [{name, primary, secondary, tertiary}]
 *   Theme.createTheme(opts) -> { role: '#RRGGBB', ... }   (pure, no DOM)
 *   Theme.apply(opts)       -> createTheme + write CSS vars on <html>
 *   Theme.init()            -> wire the #themeCycle button, restore/persist state
 *   Theme.current           -> last applied options
 *   Theme.hexToArgb / argbToHex / hctFromArgb / argbFromHct / ratioOfTones
 *
 * The light/dark scheme is inherited from `prefers-color-scheme`; when the
 * platform exposes a theme color (an author <meta name="theme-color"> or the OS
 * `AccentColor` system color) it is inherited as a leading "System" preset.
 */
var TT = TT || {};
TT.theme = (function () {
  'use strict';

  /* ============================================================= *
   * 1. math + color utilities                                     *
   * ============================================================= */

  function signum(num) { return num < 0 ? -1 : num === 0 ? 0 : 1; }
  function lerp(a, b, t) { return (1 - t) * a + t * b; }
  function clampDouble(min, max, input) {
    return input < min ? min : input > max ? max : input;
  }
  function sanitizeDegreesDouble(d) { d = d % 360; if (d < 0) d += 360; return d; }
  function matrixMultiply(row, m) {
    return [
      row[0] * m[0][0] + row[1] * m[0][1] + row[2] * m[0][2],
      row[0] * m[1][0] + row[1] * m[1][1] + row[2] * m[1][2],
      row[0] * m[2][0] + row[1] * m[2][1] + row[2] * m[2][2]
    ];
  }

  // Math.cbrt is ES2015; polyfill it for old engines.
  if (typeof Math.cbrt !== 'function') {
    Math.cbrt = function (x) {
      return signum(x) * Math.pow(Math.abs(x), 1 / 3);
    };
  }

  var SRGB_TO_XYZ = [
    [0.41233895, 0.35762064, 0.18051042],
    [0.2126, 0.7152, 0.0722],
    [0.01932141, 0.11916382, 0.95034478]
  ];
  var XYZ_TO_SRGB = [
    [3.2413774792388685, -1.5376652402851851, -0.49885366846268053],
    [-0.9691452513005321, 1.8758853451067872, 0.04156585616912061],
    [0.05562093689691305, -0.20395524564742123, 1.0571799111220335]
  ];
  var WHITE_POINT_D65 = [95.047, 100.0, 108.883];

  function labF(t) {
    var e = 216 / 24389, k = 24389 / 27;
    return t > e ? Math.pow(t, 1 / 3) : (k * t + 16) / 116;
  }
  function labInvf(ft) {
    var e = 216 / 24389, k = 24389 / 27, ft3 = ft * ft * ft;
    return ft3 > e ? ft3 : (116 * ft - 16) / k;
  }
  function linearized(c) {
    var n = c / 255;
    return n <= 0.040449936 ? n / 12.92 * 100 : Math.pow((n + 0.055) / 1.055, 2.4) * 100;
  }
  function delinearized(c) {
    var n = c / 100, d;
    if (n <= 0.0031308) d = n * 12.92; else d = 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return clampDouble(0, 255, Math.round(d * 255));
  }
  function trueDelinearized(c) {
    var n = c / 100, d;
    if (n <= 0.0031308) d = n * 12.92; else d = 1.055 * Math.pow(n, 1 / 2.4) - 0.055;
    return d * 255;
  }
  function argbFromRgb(r, g, b) {
    return (255 << 24 | (r & 255) << 16 | (g & 255) << 8 | b & 255) >>> 0;
  }
  function argbFromLinrgb(l) {
    return argbFromRgb(delinearized(l[0]), delinearized(l[1]), delinearized(l[2]));
  }
  function xyzFromArgb(argb) {
    var r = linearized(argb >> 16 & 255), g = linearized(argb >> 8 & 255), b = linearized(argb & 255);
    return matrixMultiply([r, g, b], SRGB_TO_XYZ);
  }
  function yFromLstar(l) { return 100 * labInvf((l + 16) / 116); }
  function lstarFromY(y) { return labF(y / 100) * 116 - 16; }
  function lstarFromArgb(argb) { return 116 * labF(xyzFromArgb(argb)[1] / 100) - 16; }
  function argbFromLstar(l) {
    var y = yFromLstar(l), c = delinearized(y);
    return argbFromRgb(c, c, c);
  }

  // '#rrggbb' -> 0xFFRRGGBB. Also tolerates '#rgb' and 'rrggbb'.
  function hexToArgb(hex) {
    if (typeof hex !== 'string') return 0;
    var s = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    if (s.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(s)) return 0;
    return (255 << 24 | parseInt(s, 16)) >>> 0;
  }
  function pad2(hex) { return hex.length === 1 ? '0' + hex : hex; }
  function argbToHex(argb) {
    var r = argb >> 16 & 255, g = argb >> 8 & 255, b = argb & 255;
    return ('#' + pad2(r.toString(16)) + pad2(g.toString(16)) + pad2(b.toString(16))).toUpperCase();
  }

  /* ============================================================= *
   * 2. contrast helpers (tone based)                              *
   * ============================================================= */

  function ratioOfYs(y1, y2) {
    var l = y1 > y2 ? y1 : y2;
    var d = l === y2 ? y1 : y2;
    return (l + 5) / (d + 5);
  }
  function ratioOfTones(t1, t2) {
    t1 = clampDouble(0, 100, t1); t2 = clampDouble(0, 100, t2);
    return ratioOfYs(yFromLstar(t1), yFromLstar(t2));
  }
  function lighter(tone, ratio) {
    var lightY = ratio * (yFromLstar(tone) + 5) - 5;
    if (lightY < 0 || lightY > 100) return -1;
    return lstarFromY(lightY) + 0.4;
  }
  function darker(tone, ratio) {
    var darkY = (yFromLstar(tone) + 5) / ratio - 5;
    if (darkY < 0 || darkY > 100) return -1;
    return lstarFromY(darkY) - 0.4;
  }
  function lighterUnsafe(tone, ratio) { var t = lighter(tone, ratio); return t === -1 ? 100 : t; }
  function darkerUnsafe(tone, ratio) { var t = darker(tone, ratio); return t === -1 ? 0 : t; }
  function tonePrefersLightForeground(tone) { return Math.round(tone) < 60; }

  // DynamicColor.foregroundTone: pick the tone that reaches `ratio` against
  // `bgTone`, preferring the polarity of the background.
  function foregroundTone(bgTone, ratio) {
    var lighterTone = lighterUnsafe(bgTone, ratio);
    var darkerTone = darkerUnsafe(bgTone, ratio);
    var lighterRatio = ratioOfTones(lighterTone, bgTone);
    var darkerRatio = ratioOfTones(darkerTone, bgTone);
    if (tonePrefersLightForeground(bgTone)) {
      var negligible = Math.abs(lighterRatio - darkerRatio) < 0.1;
      if (lighterRatio >= ratio || lighterRatio >= darkerRatio || negligible) return lighterTone;
      return darkerTone;
    }
    var negligible2 = Math.abs(lighterRatio - darkerRatio) < 0.1;
    if (darkerRatio >= ratio || darkerRatio >= lighterRatio || negligible2) return darkerTone;
    return lighterTone;
  }

  /* ============================================================= *
   * 3. CAM16 viewing conditions (ViewingConditions.DEFAULT)       *
   * ============================================================= */

  function makeViewingConditions() {
    var xyz = WHITE_POINT_D65;
    var rW = xyz[0] * 0.401288 + xyz[1] * 0.650173 + xyz[2] * -0.051461;
    var gW = xyz[0] * -0.250268 + xyz[1] * 1.204414 + xyz[2] * 0.045854;
    var bW = xyz[0] * -0.002079 + xyz[1] * 0.048952 + xyz[2] * 0.953127;
    var surround = 2.0;
    var f = 0.8 + surround / 10;
    var c = f >= 0.9 ? lerp(0.59, 0.69, (f - 0.9) * 10) : lerp(0.525, 0.59, (f - 0.8) * 10);
    var adaptingLuminance = (200 / Math.PI) * yFromLstar(50) / 100;
    var d = f * (1 - (1 / 3.6) * Math.exp((-adaptingLuminance - 42) / 92));
    d = d > 1 ? 1 : d < 0 ? 0 : d;
    var nc = f;
    var rgbD = [d * (100 / rW) + 1 - d, d * (100 / gW) + 1 - d, d * (100 / bW) + 1 - d];
    var k = 1 / (5 * adaptingLuminance + 1);
    var k4 = k * k * k * k;
    var k4F = 1 - k4;
    var fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5 * adaptingLuminance);
    var n = yFromLstar(50) / WHITE_POINT_D65[1];
    var z = 1.48 + Math.sqrt(n);
    var nbb = 0.725 / Math.pow(n, 0.2);
    var ncb = nbb;
    var rAF = Math.pow((fl * rgbD[0] * rW) / 100, 0.42);
    var gAF = Math.pow((fl * rgbD[1] * gW) / 100, 0.42);
    var bAF = Math.pow((fl * rgbD[2] * bW) / 100, 0.42);
    var rA = (400 * rAF) / (rAF + 27.13);
    var gA = (400 * gAF) / (gAF + 27.13);
    var bA = (400 * bAF) / (bAF + 27.13);
    var aw = (2 * rA + gA + 0.05 * bA) * nbb;
    return {
      n: n, aw: aw, nbb: nbb, ncb: ncb, c: c, nc: nc, rgbD: rgbD,
      fl: fl, fLRoot: Math.pow(fl, 0.25), z: z
    };
  }
  var VC = makeViewingConditions();

  /* ============================================================= *
   * 4. CAM16 forward (sRGB -> hue + chroma)                       *
   * ============================================================= */

  function cam16FromArgb(argb) {
    var red = argb >> 16 & 255, green = argb >> 8 & 255, blue = argb & 255;
    var rL = linearized(red), gL = linearized(green), bL = linearized(blue);
    var x = 0.41233895 * rL + 0.35762064 * gL + 0.18051042 * bL;
    var y = 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
    var z = 0.01932141 * rL + 0.11916382 * gL + 0.95034478 * bL;
    var rC = 0.401288 * x + 0.650173 * y - 0.051461 * z;
    var gC = -0.250268 * x + 1.204414 * y + 0.045854 * z;
    var bC = -0.002079 * x + 0.048952 * y + 0.953127 * z;
    var rD = VC.rgbD[0] * rC, gD = VC.rgbD[1] * gC, bD = VC.rgbD[2] * bC;
    var rAF = Math.pow(VC.fl * Math.abs(rD) / 100, 0.42);
    var gAF = Math.pow(VC.fl * Math.abs(gD) / 100, 0.42);
    var bAF = Math.pow(VC.fl * Math.abs(bD) / 100, 0.42);
    var rA = signum(rD) * 400 * rAF / (rAF + 27.13);
    var gA = signum(gD) * 400 * gAF / (gAF + 27.13);
    var bA = signum(bD) * 400 * bAF / (bAF + 27.13);
    var a = (11 * rA + -12 * gA + bA) / 11;
    var b = (rA + gA - 2 * bA) / 9;
    var u = (20 * rA + 20 * gA + 21 * bA) / 20;
    var p2 = (40 * rA + 20 * gA + bA) / 20;
    var atanDegrees = Math.atan2(b, a) * 180 / Math.PI;
    var hue = sanitizeDegreesDouble(atanDegrees);
    var ac = p2 * VC.nbb;
    var j = 100 * Math.pow(ac / VC.aw, VC.c * VC.z);
    var huePrime = hue < 20.14 ? hue + 360 : hue;
    var eHue = 0.25 * (Math.cos(huePrime * Math.PI / 180 + 2) + 3.8);
    var p1 = (50000 / 13) * eHue * VC.nc * VC.ncb;
    var t = (p1 * Math.sqrt(a * a + b * b)) / (u + 0.305);
    var alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
    var chroma = alpha * Math.sqrt(j / 100);
    return { h: hue, c: chroma };
  }

  // Accepts a hex string or a 0xAARRGGBB integer. Returns {h, c, t}.
  function hctFromArgb(input) {
    var argb = typeof input === 'string' ? hexToArgb(input) : input;
    var cam = cam16FromArgb(argb);
    return { h: cam.h, c: cam.c, t: lstarFromArgb(argb) };
  }

  /* ============================================================= *
   * 5. HCT solver (HCT -> sRGB)                                   *
   * ============================================================= */

  var SCALED_DISCOUNT_FROM_LINRGB = [
    [0.001200833568784504, 0.002389694492170889, 0.0002795742885861124],
    [0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398],
    [0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076]
  ];
  var LINRGB_FROM_SCALED_DISCOUNT = [
    [1373.2198709594231, -1100.4251190754821, -7.278681089101213],
    [-271.815969077903, 559.6580465940733, -32.46047482791194],
    [1.9622899599665666, -57.173814538844006, 308.7233197812385]
  ];
  var Y_FROM_LINRGB = [0.2126, 0.7152, 0.0722];
  var CRITICAL_PLANES = [0.015176349177441876, 0.045529047532325624, 0.07588174588720938, 0.10623444424209313, 0.13658714259697685, 0.16693984095186062,
    0.19729253930674434, 0.2276452376616281, 0.2579979360165119, 0.28835063437139563, 0.3188300904430532, 0.350925934958123,
    0.3848314933096426, 0.42057480301049466, 0.458183274052838, 0.4976837250274023, 0.5391024159806381, 0.5824650784040898,
    0.6277969426914107, 0.6751227633498623, 0.7244668422128921, 0.775853049866786, 0.829304845476233, 0.8848452951698498,
    0.942497089126609, 1.0022825574869039, 1.0642236851973577, 1.1283421258858297, 1.1946592148522128, 1.2631959812511864,
    1.3339731595349034, 1.407011200216447, 1.4823302800086415, 1.5599503113873272, 1.6398909516233677, 1.7221716113234105,
    1.8068114625156377, 1.8938294463134073, 1.9832442801866852, 2.075074464868551, 2.1693382909216234, 2.2660538449872063,
    2.36523901573795, 2.4669114995532007, 2.5710888059345764, 2.6777882626779785, 2.7870270208169257, 2.898822059350997,
    3.0131901897720907, 3.1301480604002863, 3.2497121605402226, 3.3718988244681087, 3.4967242352587946, 3.624204428461639,
    3.754355295633311, 3.887192587735158, 4.022731918402185, 4.160988767090289, 4.301978482107941, 4.445716283538092,
    4.592217266055746, 4.741496401646282, 4.893568542229298, 5.048448422192488, 5.20615066083972, 5.3666897647573375,
    5.5300801301023865, 5.696336044816294, 5.865471690767354, 6.037501145825082, 6.212438385869475, 6.390297286737924,
    6.571091626112461, 6.7548350853498045, 6.941541251256611, 7.131223617812143, 7.323895587840543, 7.5195704746346665,
    7.7182615035334345, 7.919981813454504, 8.124744458384042, 8.332562408825165, 8.543448553206703, 8.757415699253682,
    8.974476575321063, 9.194643831691977, 9.417930041841839, 9.644347703669503, 9.873909240696694, 10.106627003236781,
    10.342513269534024, 10.58158024687427, 10.8238400726681, 11.069304815507364, 11.317986476196008, 11.569896988756009,
    11.825048221409341, 12.083451977536606, 12.345119996613247, 12.610063955123938, 12.878295467455942, 13.149826086772048,
    13.42466730586372, 13.702830557985108, 13.984327217668513, 14.269168601521828, 14.55736596900856, 14.848930523210871,
    15.143873411576273, 15.44220572664832, 15.743938506781891, 16.04908273684337, 16.35764934889634, 16.66964922287304,
    16.985093187232053, 17.30399201960269, 17.62635644741625, 17.95219714852476, 18.281524751807332, 18.614349837764564,
    18.95068293910138, 19.290534541298456, 19.633915083172692, 19.98083495742689, 20.331304511189067, 20.685334046541502,
    21.042933821039977, 21.404114048223256, 21.76888489811322, 22.137256497705877, 22.50923893145328, 22.884842241736916,
    23.264076429332462, 23.6469514538663, 24.033477234264016, 24.42366364919083, 24.817520537484558, 25.21505769858089,
    25.61628489293138, 26.021211842414342, 26.429848230738664, 26.842203703840827, 27.258287870275353, 27.678110301598522,
    28.10168053274597, 28.529008062403893, 28.96010235337422, 29.39497283293396, 29.83362889318845, 30.276079891419332,
    30.722335150426627, 31.172403958865512, 31.62629557157785, 32.08401920991837, 32.54558406207592, 33.010999283389665,
    33.4802739966603, 33.953417292456834, 34.430438229418264, 34.911345834551085, 35.39614910352207, 35.88485700094671,
    36.37747846067349, 36.87402238606382, 37.37449765026789, 37.87891309649659, 38.38727753828926, 38.89959975977785,
    39.41588851594697, 39.93615253289054, 40.460400508064545, 40.98864111053629, 41.520882981230194, 42.05713473317016,
    42.597404951718396, 43.141702194811224, 43.6900349931913, 44.24241185063697, 44.798841244188324, 45.35933162437017,
    45.92389141541209, 46.49252901546552, 47.065252796817916, 47.64207110610409, 48.22299226451468, 48.808024568002054,
    49.3971762874833, 49.9904556690408, 50.587870934119984, 51.189430279724725, 51.79514187861014, 52.40501387947288,
    53.0190544071392, 53.637271562750364, 54.259673423945976, 54.88626804504493, 55.517063457223934, 56.15206766869424,
    56.79128866487574, 57.43473440856916, 58.08241284012621, 58.734331877617365, 59.39049941699807, 60.05092333227251,
    60.715611475655585, 61.38457167773311, 62.057811747619894, 62.7353394731159, 63.417162620860914, 64.10328893648692,
    64.79372614476921, 65.48848194977529, 66.18756403501224, 66.89098006357258, 67.59873767827808, 68.31084450182222,
    69.02730813691093, 69.74813616640164, 70.47333615344107, 71.20291564160104, 71.93688215501312, 72.67524319850172,
    73.41800625771542, 74.16517879925733, 74.9167682708136, 75.67278210128072, 76.43322770089146, 77.1981124613393,
    77.96744375590167, 78.74122893956174, 79.51947534912904, 80.30219030335869, 81.08938110306934, 81.88105503125999,
    82.67721935322541, 83.4778813166706, 84.28304815182372, 85.09272707154808, 85.90692527145302, 86.72564993000343,
    87.54890820862819, 88.3767072518277, 89.2090541872801, 90.04595612594655, 90.88742016217518, 91.73345337380438,
    92.58406282226491, 93.43925555268066, 94.29903859396902, 95.16341895893969, 96.03240364439274, 96.9059996312159,
    97.78421388448044, 98.6670533535366, 99.55452497210776];

  function chromaticAdaptation(component) {
    var af = Math.pow(Math.abs(component), 0.42);
    return signum(component) * 400 * af / (af + 27.13);
  }
  function hueOf(linrgb) {
    var sd = matrixMultiply(linrgb, SCALED_DISCOUNT_FROM_LINRGB);
    var rA = chromaticAdaptation(sd[0]), gA = chromaticAdaptation(sd[1]), bA = chromaticAdaptation(sd[2]);
    var a = (11 * rA + -12 * gA + bA) / 11;
    var b = (rA + gA - 2 * bA) / 9;
    return Math.atan2(b, a);
  }
  function sanitizeRadians(a) { return (a + Math.PI * 8) % (Math.PI * 2); }
  function areInCyclicOrder(a, b, c) {
    var dAB = sanitizeRadians(b - a), dAC = sanitizeRadians(c - a);
    return dAB < dAC;
  }
  function intercept(s, m, t) { return (m - s) / (t - s); }
  function lerpPoint(s, t, tg) {
    return [s[0] + (tg[0] - s[0]) * t, s[1] + (tg[1] - s[1]) * t, s[2] + (tg[2] - s[2]) * t];
  }
  function setCoordinate(s, c, tg, axis) {
    var t = intercept(s[axis], c, tg[axis]);
    return lerpPoint(s, t, tg);
  }
  function isBounded(x) { return 0 <= x && x <= 100; }

  function nthVertex(y, n) {
    var kR = Y_FROM_LINRGB[0], kG = Y_FROM_LINRGB[1], kB = Y_FROM_LINRGB[2];
    var coordA = n % 4 <= 1 ? 0 : 100, coordB = n % 2 === 0 ? 0 : 100;
    if (n < 4) {
      var g = coordA, b = coordB, r = (y - g * kG - b * kB) / kR;
      return isBounded(r) ? [r, g, b] : [-1, -1, -1];
    } else if (n < 8) {
      var b2 = coordA, r2 = coordB, g2 = (y - r2 * kR - b2 * kB) / kG;
      return isBounded(g2) ? [r2, g2, b2] : [-1, -1, -1];
    }
    var r3 = coordA, g3 = coordB, b3 = (y - r3 * kR - g3 * kG) / kB;
    return isBounded(b3) ? [r3, g3, b3] : [-1, -1, -1];
  }
  function bisectToSegment(y, targetHue) {
    var left = [-1, -1, -1], right = left, leftHue = 0, rightHue = 0, initialized = false, uncut = true;
    for (var n = 0; n < 12; n++) {
      var mid = nthVertex(y, n);
      if (mid[0] < 0) continue;
      var midHue = hueOf(mid);
      if (!initialized) {
        left = mid; right = mid; leftHue = midHue; rightHue = midHue; initialized = true; continue;
      }
      if (uncut || areInCyclicOrder(leftHue, midHue, rightHue)) {
        uncut = false;
        if (areInCyclicOrder(leftHue, targetHue, midHue)) { right = mid; rightHue = midHue; }
        else { left = mid; leftHue = midHue; }
      }
    }
    return [left, right];
  }
  function midpoint(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
  function criticalPlaneBelow(x) { return Math.floor(x - 0.5); }
  function criticalPlaneAbove(x) { return Math.ceil(x - 0.5); }
  function bisectToLimit(y, targetHue) {
    var segment = bisectToSegment(y, targetHue);
    var left = segment[0], leftHue = hueOf(left), right = segment[1];
    for (var axis = 0; axis < 3; axis++) {
      if (left[axis] !== right[axis]) {
        var lPlane = -1, rPlane = 255;
        if (left[axis] < right[axis]) {
          lPlane = criticalPlaneBelow(trueDelinearized(left[axis]));
          rPlane = criticalPlaneAbove(trueDelinearized(right[axis]));
        } else {
          lPlane = criticalPlaneAbove(trueDelinearized(left[axis]));
          rPlane = criticalPlaneBelow(trueDelinearized(right[axis]));
        }
        for (var i = 0; i < 8; i++) {
          if (Math.abs(rPlane - lPlane) <= 1) break;
          var mPlane = Math.floor((lPlane + rPlane) / 2);
          var midPlaneCoordinate = CRITICAL_PLANES[mPlane];
          var mid = setCoordinate(left, midPlaneCoordinate, right, axis);
          var midHue = hueOf(mid);
          if (areInCyclicOrder(leftHue, targetHue, midHue)) { right = mid; rPlane = mPlane; }
          else { left = mid; leftHue = midHue; lPlane = mPlane; }
        }
      }
    }
    return midpoint(left, right);
  }
  function inverseChromaticAdaptation(a) {
    var aa = Math.abs(a);
    var base = Math.max(0, 27.13 * aa / (400 - aa));
    return signum(a) * Math.pow(base, 1 / 0.42);
  }
  function findResultByJ(hueRadians, chroma, y) {
    var j = Math.sqrt(y) * 11;
    var tInnerCoeff = 1 / Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
    var eHue = 0.25 * (Math.cos(hueRadians + 2) + 3.8);
    var p1 = eHue * (50000 / 13) * VC.nc * VC.ncb;
    var hSin = Math.sin(hueRadians), hCos = Math.cos(hueRadians);
    for (var iterationRound = 0; iterationRound < 5; iterationRound++) {
      var jNormalized = j / 100;
      var alpha = chroma === 0 || j === 0 ? 0 : chroma / Math.sqrt(jNormalized);
      var t = Math.pow(alpha * tInnerCoeff, 1 / 0.9);
      var ac = VC.aw * Math.pow(jNormalized, 1 / VC.c / VC.z);
      var p2 = ac / VC.nbb;
      var gamma = 23 * (p2 + 0.305) * t / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
      var a = gamma * hCos, b = gamma * hSin;
      var rA = (460 * p2 + 451 * a + 288 * b) / 1403;
      var gA = (460 * p2 - 891 * a - 261 * b) / 1403;
      var bA = (460 * p2 - 220 * a - 6300 * b) / 1403;
      var rCScaled = inverseChromaticAdaptation(rA);
      var gCScaled = inverseChromaticAdaptation(gA);
      var bCScaled = inverseChromaticAdaptation(bA);
      var linrgb = matrixMultiply([rCScaled, gCScaled, bCScaled], LINRGB_FROM_SCALED_DISCOUNT);
      if (linrgb[0] < 0 || linrgb[1] < 0 || linrgb[2] < 0) return 0;
      var kR = Y_FROM_LINRGB[0], kG = Y_FROM_LINRGB[1], kB = Y_FROM_LINRGB[2];
      var fnj = kR * linrgb[0] + kG * linrgb[1] + kB * linrgb[2];
      if (fnj <= 0) return 0;
      if (iterationRound === 4 || Math.abs(fnj - y) < 0.002) {
        if (linrgb[0] > 100.01 || linrgb[1] > 100.01 || linrgb[2] > 100.01) return 0;
        return argbFromLinrgb(linrgb);
      }
      j = j - (fnj - y) * j / (2 * fnj);
    }
    return 0;
  }
  function solveToInt(hueDegrees, chroma, lstar) {
    if (chroma < 0.0001 || lstar < 0.0001 || lstar > 99.9999) return argbFromLstar(lstar);
    hueDegrees = sanitizeDegreesDouble(hueDegrees);
    var hueRadians = hueDegrees / 180 * Math.PI;
    var y = yFromLstar(lstar);
    var exactAnswer = findResultByJ(hueRadians, chroma, y);
    if (exactAnswer !== 0) return exactAnswer;
    var linrgb = bisectToLimit(y, hueRadians);
    return argbFromLinrgb(linrgb);
  }
  function argbFromHct(h, c, t) { return solveToInt(h, c, t); }

  // A tonal palette: fixed hue + chroma, one tone(t) lookup per palette.
  // tone(t) is cached because the HCT solver is the expensive part.
  function tonalPalette(hue, chroma) {
    var cache = {};
    return {
      hue: hue,
      chroma: chroma,
      tone: function (t) {
        if (!cache.hasOwnProperty(t)) cache[t] = solveToInt(hue, chroma, t);
        return cache[t];
      },
      hex: function (t) { return argbToHex(this.tone(t)); }
    };
  }

  /* ============================================================= *
   * 6. SchemeTonalSpot palettes + role tables (spec 2021)         *
   * ============================================================= */

  // Scheme variants (Material Color Utilities): each maps a seed hue to the
  // (hue, chroma) of the five tonal palettes plus the error palette. Adopted
  // from the Minus / Mihon Android app research.
  // `monochrome` pins every chroma to 0 — a grey *seed* alone is not enough,
  // because a tonal-spot scheme would still colour secondary/tertiary.
  var VARIANTS = {
    tonalSpot: function (h) {
      return { P: [h, 36], S: [h, 16], T: [h + 60, 24], N: [h, 6], NV: [h, 8], E: [25, 84] };
    },
    neutral: function (h) {
      return { P: [h, 12], S: [h, 8], T: [h, 16], N: [h, 2], NV: [h, 2], E: [25, 84] };
    },
    monochrome: function (h) {
      return { P: [h, 0], S: [h, 0], T: [h, 0], N: [h, 0], NV: [h, 0], E: [h, 0] };
    },
    expressive: function (h) {
      return { P: [h + 240, 40], S: [h + 30, 24], T: [h + 180, 32], N: [h + 15, 8], NV: [h + 15, 12], E: [25, 84] };
    },
    vibrant: function (h) {
      return { P: [h, 200], S: [h + 30, 24], T: [h + 60, 32], N: [h, 10], NV: [h, 12], E: [25, 84] };
    }
  };

  function buildPalettes(opts) {
    var pHct = hctFromArgb(opts.primary);
    // Default variant: a chroma-less seed reads as monochrome, else tonal spot.
    var variant = opts.variant || (pHct.c < 0.5 ? 'monochrome' : 'tonalSpot');
    var spec = (VARIANTS[variant] || VARIANTS.tonalSpot)(pHct.h);
    var out = {};
    for (var k in spec) if (spec.hasOwnProperty(k)) out[k] = tonalPalette(spec[k][0], spec[k][1]);
    // Explicit keys still override the seed's hue (kept for API compatibility).
    if (opts.secondary) out.S = tonalPalette(hctFromArgb(opts.secondary).h, spec.S[1]);
    if (opts.tertiary) out.T = tonalPalette(hctFromArgb(opts.tertiary).h, spec.T[1]);
    if (opts.error) out.E = tonalPalette(hctFromArgb(opts.error).h, spec.E[1]);
    return out;
  }

  // Every role, and the palette each reads its tone from.
  var ROLE_ORDER = [
    'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
    'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
    'error', 'onError', 'errorContainer', 'onErrorContainer',
    'background', 'onBackground',
    'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
    'surfaceDim', 'surfaceBright',
    'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
    'surfaceContainerHigh', 'surfaceContainerHighest',
    'outline', 'outlineVariant',
    'inverseSurface', 'inverseOnSurface', 'inversePrimary',
    'shadow', 'scrim', 'surfaceTint'
  ];

  var ROLE_PALETTE = {
    primary: 'P', onPrimary: 'P', primaryContainer: 'P', onPrimaryContainer: 'P',
    secondary: 'S', onSecondary: 'S', secondaryContainer: 'S', onSecondaryContainer: 'S',
    tertiary: 'T', onTertiary: 'T', tertiaryContainer: 'T', onTertiaryContainer: 'T',
    error: 'E', onError: 'E', errorContainer: 'E', onErrorContainer: 'E',
    background: 'N', onBackground: 'N',
    surface: 'N', onSurface: 'N', surfaceVariant: 'NV', onSurfaceVariant: 'NV',
    surfaceDim: 'N', surfaceBright: 'N',
    surfaceContainerLowest: 'N', surfaceContainerLow: 'N', surfaceContainer: 'N',
    surfaceContainerHigh: 'N', surfaceContainerHighest: 'N',
    outline: 'NV', outlineVariant: 'NV',
    inverseSurface: 'N', inverseOnSurface: 'N', inversePrimary: 'P',
    shadow: 'N', scrim: 'N', surfaceTint: 'P'
  };

  function lightTones() {
    return {
      primary: 40, onPrimary: 100, primaryContainer: 90, onPrimaryContainer: 10,
      secondary: 40, onSecondary: 100, secondaryContainer: 90, onSecondaryContainer: 10,
      tertiary: 40, onTertiary: 100, tertiaryContainer: 90, onTertiaryContainer: 10,
      error: 40, onError: 100, errorContainer: 90, onErrorContainer: 10,
      background: 98, onBackground: 10,
      surface: 98, onSurface: 10, surfaceVariant: 90, onSurfaceVariant: 30,
      surfaceDim: 87, surfaceBright: 98,
      surfaceContainerLowest: 100, surfaceContainerLow: 96, surfaceContainer: 94,
      surfaceContainerHigh: 92, surfaceContainerHighest: 90,
      outline: 50, outlineVariant: 80,
      inverseSurface: 20, inverseOnSurface: 95, inversePrimary: 80,
      shadow: 0, scrim: 0, surfaceTint: 40
    };
  }
  function darkTones() {
    return {
      primary: 80, onPrimary: 20, primaryContainer: 30, onPrimaryContainer: 90,
      secondary: 80, onSecondary: 20, secondaryContainer: 30, onSecondaryContainer: 90,
      tertiary: 80, onTertiary: 20, tertiaryContainer: 30, onTertiaryContainer: 90,
      error: 80, onError: 20, errorContainer: 30, onErrorContainer: 90,
      background: 6, onBackground: 90,
      surface: 6, onSurface: 90, surfaceVariant: 30, onSurfaceVariant: 80,
      surfaceDim: 6, surfaceBright: 24,
      surfaceContainerLowest: 4, surfaceContainerLow: 10, surfaceContainer: 12,
      surfaceContainerHigh: 17, surfaceContainerHighest: 22,
      outline: 60, outlineVariant: 30,
      inverseSurface: 90, inverseOnSurface: 20, inversePrimary: 40,
      shadow: 0, scrim: 0, surfaceTint: 80
    };
  }

  // Surface containers are the only roles defined by contrast curves.
  // Values at contrast levels [-1, 0, 0.5, 1]; level 0 equals the literal table.
  var SURFACE_CURVES = {
    light: {
      surfaceDim: [87, 87, 80, 75],
      surfaceBright: [98, 98, 98, 98],
      surfaceContainerLowest: [100, 100, 100, 100],
      surfaceContainerLow: [96, 96, 96, 95],
      surfaceContainer: [94, 94, 92, 90],
      surfaceContainerHigh: [92, 92, 88, 85],
      surfaceContainerHighest: [90, 90, 84, 80]
    },
    dark: {
      surfaceDim: [6, 6, 6, 6],
      surfaceBright: [24, 24, 29, 34],
      surfaceContainerLowest: [4, 4, 2, 0],
      surfaceContainerLow: [10, 10, 11, 12],
      surfaceContainer: [12, 12, 16, 20],
      surfaceContainerHigh: [17, 17, 21, 25],
      surfaceContainerHighest: [22, 22, 26, 30]
    }
  };

  // Foreground contrast curves (low, normal, medium, high) at [-1, 0, .5, 1].
  var ON_CURVES = {
    onPrimary: [4.5, 7, 11, 21],
    onPrimaryContainer: [3, 4.5, 7, 11],
    onSecondary: [4.5, 7, 11, 21],
    onSecondaryContainer: [3, 4.5, 7, 11],
    onTertiary: [4.5, 7, 11, 21],
    onTertiaryContainer: [3, 4.5, 7, 11],
    onError: [4.5, 7, 11, 21],
    onErrorContainer: [3, 4.5, 7, 11],
    onBackground: [3, 3, 4.5, 7],
    onSurface: [4.5, 7, 11, 21],
    onSurfaceVariant: [3, 4.5, 7, 11],
    inverseOnSurface: [4.5, 7, 11, 21]
  };
  // Which role each on-color sits on.
  var ON_BG = {
    onPrimary: 'primary',
    onPrimaryContainer: 'primaryContainer',
    onSecondary: 'secondary',
    onSecondaryContainer: 'secondaryContainer',
    onTertiary: 'tertiary',
    onTertiaryContainer: 'tertiaryContainer',
    onError: 'error',
    onErrorContainer: 'errorContainer',
    onBackground: 'background',
    onSurface: 'surface',
    onSurfaceVariant: 'surface',
    inverseOnSurface: 'inverseSurface'
  };

  function curveGet(c, level) {
    if (level <= -1) return c[0];
    if (level < 0) return lerp(c[0], c[1], level + 1);
    if (level < 0.5) return lerp(c[1], c[2], level / 0.5);
    if (level < 1) return lerp(c[2], c[3], (level - 0.5) / 0.5);
    return c[3];
  }

  function applyContrast(tones, dark, level) {
    var i, role, sc = SURFACE_CURVES[dark ? 'dark' : 'light'];
    for (role in sc) {
      if (sc.hasOwnProperty(role)) tones[role] = curveGet(sc[role], level);
    }
    for (role in ON_CURVES) {
      if (!ON_CURVES.hasOwnProperty(role)) continue;
      var target = curveGet(ON_CURVES[role], level);
      var bg = tones[ON_BG[role]];
      if (ratioOfTones(bg, tones[role]) < target) {
        tones[role] = foregroundTone(bg, target);
      }
    }
  }

  // Monochrome special case: at chroma 0 every container resolves to the same
  // grey as the surfaces (primaryContainer == tertiaryContainer ==
  // surfaceContainer), so now/next rows and cards would collapse into one
  // another. Spread the containers into distinct grey steps and harden the
  // outlines, as Mihon's MonochromeColorScheme does.
  function applyMonoTones(tones, dark) {
    if (!dark) {
      tones.primaryContainer = 84;
      tones.secondaryContainer = 92;
      tones.tertiaryContainer = 72;
      tones.errorContainer = 84;
      tones.outline = 0;
      tones.outlineVariant = 55;
    } else {
      tones.primaryContainer = 34;
      tones.secondaryContainer = 22;
      tones.tertiaryContainer = 46;
      tones.errorContainer = 34;
      tones.outline = 100;
      tones.outlineVariant = 45;
    }
  }

  function createTheme(opts) {
    opts = opts || {};
    var primary = opts.primary || PRESETS[0].primary;
    var dark = !!opts.dark;
    var contrast = typeof opts.contrast === 'number' ? clampDouble(-1, 1, opts.contrast) : 0;
    var variant = opts.variant || (hctFromArgb(primary).c < 0.5 ? 'monochrome' : 'tonalSpot');
    var pals = buildPalettes({
      primary: primary,
      secondary: opts.secondary,
      tertiary: opts.tertiary,
      error: opts.error,
      variant: variant
    });
    var tones = dark ? darkTones() : lightTones();
    if (variant === 'monochrome') applyMonoTones(tones, dark);
    if (contrast !== 0) applyContrast(tones, dark, contrast);
    var out = {};
    for (var i = 0; i < ROLE_ORDER.length; i++) {
      var role = ROLE_ORDER[i];
      out[role] = pals[ROLE_PALETTE[role]].hex(tones[role]);
    }
    return out;
  }

  /* ============================================================= *
   * 7. presets                                                    *
   * ============================================================= */

  // Named presets. Monochrome is first in the cycle order; the fresh-visitor
  // default is DEFAULT_PRESET below (ISIM Blue). The rest keep the site's
  // original palettes and add seeds/variants extracted from the Minus and
  // Mihon Android apps.
  var DEFAULT_PRESET = 'ISIM Blue';
  var PRESETS = [
    { name: 'Monochrome', primary: '#000000', variant: 'monochrome' },
    { name: 'ISIM Blue', primary: '#0b4da2', secondary: '#4b5f7d', tertiary: '#7c5260' },
    { name: 'Indigo', primary: '#6750A4', secondary: '#625B71', tertiary: '#7D5260' },
    { name: 'Green', primary: '#2E7D32', secondary: '#52634F', tertiary: '#386A20' },
    { name: 'Ember', primary: '#C0392B', secondary: '#775652', tertiary: '#6D5D2E' },
    { name: 'Teal', primary: '#006A6A', secondary: '#4A6363', tertiary: '#4B607C' },
    { name: 'Tachiyomi Blue', primary: '#2979FF' },
    { name: 'Minus Purple', primary: '#9700FF' },
    { name: 'Minus Pink', primary: '#FF00BC' },
    { name: 'Strawberry', primary: '#ED4A65' },
    { name: 'Green Apple', primary: '#188140' },
    { name: 'Minus Orange', primary: '#FF7400' },
    { name: 'Minus Cyan', primary: '#00C9FF' },
    { name: 'Minus Yellow', primary: '#FFF100' },
    { name: 'Neutral Blue', primary: '#0B4DA2', variant: 'neutral' }
  ];

  /* ============================================================= *
   * 7b. swatch palette (display only)                             *
   * ============================================================= */

  // Curated solid colors the palette square's sectors snap to, so it reads as
  // a tidy picker of distinct solids rather than the live (often muted) tonal
  // roles. Covers the hue wheel plus a neutral ramp (#000000 -> greys ->
  // #ffffff) so the Monochrome preset and the `neutral` variant snap to
  // sensible neutrals, never an arbitrary hue. Kept in theme.js (not
  // color.js) because color.js loads after us. Display only: these values
  // never touch the applied --md-* roles.
  var SOLID_PALETTE = [
    '#000000', '#303030', '#606060', '#909090', '#c0c0c0', '#e0e0e0', '#ffffff',
    '#c0392b', '#d35400', '#b8860b', '#6b8e23', '#2e7d32', '#00897b',
    '#00838f', '#1565c0', '#3949ab', '#6a4c93', '#a64d79'
  ];

  // Nearest curated solid to `hex` by squared per-channel RGB distance.
  // Deterministic: iterating in order with a strict `<` comparison keeps the
  // lowest-index entry on ties. Uses hexToArgb + bit shifts (ES5); no HCT and
  // no dependency on js/color.js.
  function snapPalette(hex, list) {
    var src = hexToArgb(hex);
    var r = src >>> 16 & 255, g = src >>> 8 & 255, b = src & 255;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < list.length; i++) {
      var c = hexToArgb(list[i]);
      var dr = (c >>> 16 & 255) - r;
      var dg = (c >>> 8 & 255) - g;
      var db = (c & 255) - b;
      var dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return list.length ? list[best] : (hex || '#000000');
  }

  /* ============================================================= *
   * 8. DOM: apply + init                                          *
   * ============================================================= */

  var STORAGE_KEY = 'emplois-theme';

  var current = {
    primary: null, secondary: null, tertiary: null, error: null,
    dark: false, contrast: 0, variant: null, preset: DEFAULT_PRESET
  };

  function kebab(role) { return role.replace(/([A-Z])/g, '-$1').toLowerCase(); }

  // Compute the roles and write them as CSS custom properties on <html>.
  function apply(opts) {
    opts = opts || {};
    var theme = createTheme(opts);
    current.primary = opts.primary || null;
    current.secondary = opts.secondary || null;
    current.tertiary = opts.tertiary || null;
    current.error = opts.error || null;
    current.dark = !!opts.dark;
    current.contrast = typeof opts.contrast === 'number' ? opts.contrast : 0;
    current.variant = opts.variant || null;
    if (typeof document !== 'undefined' && document && document.documentElement) {
      var style = document.documentElement.style;
      for (var i = 0; i < ROLE_ORDER.length; i++) {
        var role = ROLE_ORDER[i];
        style.setProperty('--md-' + kebab(role), theme[role]);
      }
      // Display-only swatch colors for #themeCycle, mirroring AOSP ThemePicker's
      // quadrant-circle preview: secondary/tertiary at AOSP's bright preview tones
      // (L*85 light / L*35 dark, L*70), primary as the snapped identity seed.
      // --md-* above is left untouched.
      var seedPrimary = opts.primary || PRESETS[0].primary;
      var pals = buildPalettes({
        primary: seedPrimary,
        secondary: opts.secondary,
        tertiary: opts.tertiary,
        error: opts.error,
        variant: opts.variant
      });
      var palDark = !!opts.dark;
      style.setProperty('--pal-secondary', pals.S.hex(palDark ? 35 : 85));
      style.setProperty('--pal-primary', snapPalette(seedPrimary, SOLID_PALETTE));
      style.setProperty('--pal-tertiary', pals.T.hex(70));
      style.setProperty('color-scheme', current.dark ? 'dark' : 'light');
    }
    return theme;
  }

  // ---- system scheme + inherited theme color ------------------------------

  // Which scheme the OS/browser asks for (light when it exposes nothing).
  function darkMedia() {
    if (typeof window === 'undefined' || !window.matchMedia) return null;
    try { return window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return null; }
  }
  function systemDark() {
    var m = darkMedia();
    return m ? !!m.matches : false;
  }

  // Parse '#rgb' / '#rrggbb' / 'rgb(r, g, b)' into '#rrggbb', else null.
  function normalizeHex(value) {
    if (!value) return null;
    value = String(value).trim();
    var m = /^#([0-9a-f]{3})$/i.exec(value);
    if (m) {
      var c = m[1];
      return ('#' + c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) +
        c.charAt(2) + c.charAt(2)).toLowerCase();
    }
    m = /^#([0-9a-f]{6})$/i.exec(value);
    if (m) return ('#' + m[1]).toLowerCase();
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
    if (m) {
      return '#' + pad2(Number(m[1]).toString(16)) + pad2(Number(m[2]).toString(16)) +
        pad2(Number(m[3]).toString(16));
    }
    return null;
  }

  // Inherit a platform theme color when one is exposed: an author
  // <meta name="theme-color"> (ours is marked and skipped) or the OS accent via
  // the CSS `AccentColor` system color. Returns a hex seed or null.
  function detectSystemSeed() {
    if (typeof document === 'undefined' || !document) return null;
    try {
      if (document.querySelectorAll) {
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < metas.length; i++) {
          if (metas[i].getAttribute('data-theme-engine')) continue;
          var c = normalizeHex(metas[i].getAttribute('content'));
          if (c) return c;
        }
      }
    } catch (e) { /* no query support */ }
    try {
      if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('color', 'AccentColor') &&
          typeof window !== 'undefined' && window.getComputedStyle) {
        var probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;top:-9999px;color:AccentColor';
        (document.body || document.documentElement).appendChild(probe);
        var rgb = window.getComputedStyle(probe).color;
        if (probe.parentNode) probe.parentNode.removeChild(probe);
        var c2 = normalizeHex(rgb);
        if (c2) return c2;
      }
    } catch (e2) { /* system colors unsupported */ }
    return null;
  }

  // Cycle order: an inherited "System" preset first (when available), then the
  // named presets. Built at init because detection needs the DOM.
  function buildCycleList() {
    var list = [];
    var seed = detectSystemSeed();
    if (seed) list.push({ name: 'System', primary: seed });
    for (var i = 0; i < PRESETS.length; i++) list.push(PRESETS[i]);
    return list;
  }

  // Reflect the applied surface as the browser chrome color (Material You).
  function syncMeta(surface) {
    if (typeof document === 'undefined' || !document) return;
    try {
      var head = document.head || document.documentElement;
      var mine = document.querySelector('meta[name="theme-color"][data-theme-engine]');
      if (!mine) {
        mine = document.createElement('meta');
        mine.setAttribute('name', 'theme-color');
        mine.setAttribute('data-theme-engine', '1');
        head.appendChild(mine);
      }
      if (surface) mine.setAttribute('content', surface);
    } catch (e) { /* no head */ }
  }

  // ---- persisted state (only the chosen preset; scheme comes from the system)

  function readState() {
    var s = { preset: null };
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return s;
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return s;
      var p = JSON.parse(raw);
      if (p && typeof p === 'object' && p.preset) s.preset = p.preset;
    } catch (e) { /* corrupt storage: fall back to defaults */ }
    return s;
  }

  function writeState(s) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) { /* storage unavailable (private mode) */ }
  }

  function indexOfPreset(list, name) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === name) return i;
    }
    return -1;
  }

  var state = { preset: null };
  var cycleList = null;
  var cycleIndex = 0;
  var btnEl = null;
  var inited = false;

  function applyState() {
    if (!cycleList || !cycleList.length) return null;
    if (cycleIndex < 0 || cycleIndex >= cycleList.length) cycleIndex = 0;
    var p = cycleList[cycleIndex];
    state.preset = p.name;
    var opts = { primary: p.primary, dark: systemDark(), contrast: 0 };
    if (p.secondary) opts.secondary = p.secondary;
    if (p.tertiary) opts.tertiary = p.tertiary;
    if (p.error) opts.error = p.error;
    if (p.variant) opts.variant = p.variant;
    var theme = apply(opts);
    current.preset = p.name;
    // The visible control is just the palette square: the description feeds the
    // aria-label and the CSS tooltip (data-tip); the native title is retired
    // after init, so the styled ::after bubble is the only tooltip.
    if (btnEl) {
      var desc = 'Theme: ' + p.name + ' — click to change';
      btnEl.setAttribute('aria-label', desc);
      btnEl.setAttribute('data-tip', desc);
    }
    syncMeta(theme.surface);
    writeState(state);
    return theme;
  }

  function init() {
    if (inited) return state;
    if (typeof document === 'undefined' || !document || !document.getElementById) return null;
    var btn = document.getElementById('themeCycle');
    if (!btn) return null;
    inited = true;
    btnEl = btn;
    // The ::after tooltip owns hover after init; `title` survives only in the
    // static markup, as the honest no-JS fallback.
    btn.removeAttribute('title');
    cycleList = buildCycleList();

    // One button cycles the presets.
    btn.addEventListener('click', function () {
      cycleIndex = (cycleIndex + 1) % cycleList.length;
      applyState();
    });

    state = readState();
    cycleIndex = indexOfPreset(cycleList, state.preset);
    // A fresh visitor starts on the ISIM Blue default, even though an
    // inherited "System" accent may be prepended to the cycle list.
    if (cycleIndex < 0) cycleIndex = Math.max(0, indexOfPreset(cycleList, DEFAULT_PRESET));

    // The scheme follows the system and re-applies when it changes.
    var m = darkMedia();
    if (m) {
      var onScheme = function () { applyState(); };
      if (m.addEventListener) m.addEventListener('change', onScheme);
      else if (m.addListener) m.addListener(onScheme);
    }

    applyState();
    return state;
  }

  // Auto-init after the DOM is ready; harmless (no-op) without a DOM.
  (function autoInit() {
    if (typeof document === 'undefined' || !document) return;
    if (document.readyState === 'loading' && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      init();
    }
  })();

  return {
    PRESETS: PRESETS,
    PALETTES: PRESETS,        // legacy alias
    VARIANTS: VARIANTS,
    ROLE_ORDER: ROLE_ORDER,
    createTheme: createTheme,
    apply: apply,
    SOLID_PALETTE: SOLID_PALETTE,
    snapPalette: snapPalette,
    init: init,
    current: current,
    hexToArgb: hexToArgb,
    argbToHex: argbToHex,
    hctFromArgb: hctFromArgb,
    argbFromHct: argbFromHct,
    ratioOfTones: ratioOfTones,
    foregroundTone: foregroundTone,
    tonalPalette: tonalPalette,
    buildPalettes: buildPalettes,
    normalizeHex: normalizeHex,
    detectSystemSeed: detectSystemSeed
  };
})();

// Expose the module for Node (headless tests; no browser APIs used here).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TT.theme;
}
if (typeof global !== 'undefined') {
  global.Theme = TT.theme;
}
