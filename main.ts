// The World Today — one image that sums up the world news of Wednesday 25 November 2026.
//
// Entry for make.fun's "Sum up 25 November's world news in one image" bounty.
// This program draws the whole front page itself: a software rasteriser renders
// panels, pictograms and text (glyph coverage baked from the Noto fonts, SIL OFL
// 1.1, lives in ./fonts.ts) onto a 2x-supersampled canvas, downsamples it, and
// writes a PNG to /output/entry.png (or $MAKEFUN_OUTPUT_DIR). No network, no
// external assets, no clock or randomness: two runs write identical bytes.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { FONT_BLOB } from './fonts.ts';

// ---------------------------------------------------------------- canvas ----
const W = 1024;
const H = 1024;
const SS = 2; // supersampling factor
const CW = W * SS;
const CH = H * SS;
const px = new Uint8Array(CW * CH * 3);

type RGB = [number, number, number];
const PAPER: RGB = [250, 246, 236];
const CARD: RGB = [255, 254, 248];
const INK: RGB = [23, 25, 31];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [190, 18, 44];
const MUTED: RGB = [96, 100, 108];
const DARKTXT: RGB = [52, 55, 62];

function blend(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= CW || y >= CH || a <= 0) return;
  const i = (y * CW + x) * 3;
  if (a >= 1) {
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  } else {
    px[i] = Math.round(px[i] * (1 - a) + c[0] * a);
    px[i + 1] = Math.round(px[i + 1] * (1 - a) + c[1] * a);
    px[i + 2] = Math.round(px[i + 2] * (1 - a) + c[2] * a);
  }
}

function fillAll(c: RGB): void {
  for (let i = 0; i < CW * CH; i++) {
    px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2];
  }
}

// All drawing calls below take design coordinates (1024x1024) and scale by SS.
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.round(x * SS), y0 = Math.round(y * SS);
  const x1 = Math.round((x + w) * SS), y1 = Math.round((y + h) * SS);
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) blend(xx, yy, c, 1);
}

function frame(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  rect(x, y, w, t, c); rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c); rect(x + w - t, y, t, h, c);
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  const R = r * SS, CX = cx * SS, CY = cy * SS;
  const x0 = Math.floor(CX - R - 1), x1 = Math.ceil(CX + R + 1);
  const y0 = Math.floor(CY - R - 1), y1 = Math.ceil(CY + R + 1);
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const d = Math.sqrt((xx - CX) ** 2 + (yy - CY) ** 2);
      blend(xx, yy, c, Math.max(0, Math.min(1, R - d + 0.5)));
    }
}

function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  const R = r * SS, T = t * SS, CX = cx * SS, CY = cy * SS;
  const x0 = Math.floor(CX - R - T), x1 = Math.ceil(CX + R + T);
  const y0 = Math.floor(CY - R - T), y1 = Math.ceil(CY + R + T);
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const d = Math.sqrt((xx - CX) ** 2 + (yy - CY) ** 2);
      blend(xx, yy, c, Math.max(0, Math.min(1, T / 2 - Math.abs(d - R) + 0.5)));
    }
}

function line(x1: number, y1: number, x2: number, y2: number, t: number, c: RGB): void {
  const ax = x1 * SS, ay = y1 * SS, bx = x2 * SS, by = y2 * SS, T = (t * SS) / 2;
  const minx = Math.floor(Math.min(ax, bx) - T - 1), maxx = Math.ceil(Math.max(ax, bx) + T + 1);
  const miny = Math.floor(Math.min(ay, by) - T - 1), maxy = Math.ceil(Math.max(ay, by) + T + 1);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  for (let yy = miny; yy <= maxy; yy++)
    for (let xx = minx; xx <= maxx; xx++) {
      let s = ((xx - ax) * dx + (yy - ay) * dy) / len2;
      s = Math.max(0, Math.min(1, s));
      const d = Math.sqrt((xx - (ax + s * dx)) ** 2 + (yy - (ay + s * dy)) ** 2);
      blend(xx, yy, c, Math.max(0, Math.min(1, T - d + 0.5)));
    }
}

function poly(pts: [number, number][], c: RGB): void {
  const P = pts.map(([x, y]) => [x * SS, y * SS] as [number, number]);
  const ys = P.map((p) => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(CH - 1, Math.ceil(Math.max(...ys)));
  for (let yy = y0; yy <= y1; yy++) {
    const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [xa, ya] = P[i], [xb, yb] = P[(i + 1) % P.length];
      if ((ya <= yy && yb > yy) || (yb <= yy && ya > yy)) xs.push(xa + ((yy - ya) / (yb - ya)) * (xb - xa));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let xx = Math.round(xs[k]); xx <= Math.round(xs[k + 1]); xx++) blend(xx, yy, c, 1);
  }
}

function tri(a: [number, number], b: [number, number], c2: [number, number], c: RGB): void {
  poly([a, b, c2], c);
}

// ----------------------------------------------------------------- fonts ----
interface Glyph { adv: number; xoff: number; yoff: number; w: number; h: number; data: Uint8Array }
interface Font { em: number; ascent: number; descent: number; glyphs: Map<number, Glyph> }

function loadFonts(): Font[] {
  const buf = inflateSync(Buffer.from(FONT_BLOB, 'base64'));
  let o = 0;
  const u8 = () => buf[o++];
  const u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; };
  const i16 = () => { const v = buf.readInt16LE(o); o += 2; return v; };
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  if (u8() !== 1) throw new Error('bad font blob');
  const count = u8();
  const fonts: Font[] = [];
  for (let f = 0; f < count; f++) {
    const em = u16(), ascent = u16(); u16();
    const n = u16();
    const glyphs = new Map<number, Glyph>();
    for (let g = 0; g < n; g++) {
      const cp = u16(), adv = u16(), xoff = i16(), yoff = i16(), w = u16(), h = u16(), len = u32();
      const data = new Uint8Array(buf.subarray(o, o + len)); o += len;
      glyphs.set(cp, { adv, xoff, yoff, w, h, data });
    }
    fonts.push({ em, ascent, descent: 0, glyphs });
  }
  return fonts;
}
const FONTS = loadFonts();
const SERIF = 0, SANS = 1, BODY = 2;

interface ScaledGlyph { alpha: Uint8Array; w: number; h: number; dx: number; dy: number; adv: number }
const glyphCache = new Map<string, Map<number, ScaledGlyph>>();

function scaledGlyphs(fontIdx: number, sizePx: number): Map<number, ScaledGlyph> {
  const key = fontIdx + ':' + sizePx;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  const font = FONTS[fontIdx];
  const scale = sizePx / font.em;
  const out = new Map<number, ScaledGlyph>();
  for (const [cp, g] of font.glyphs) {
    const w = Math.max(1, Math.round(g.w * scale));
    const h = Math.max(1, Math.round(g.h * scale));
    const alpha = new Uint8Array(w * h);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        // average the master coverage over the source rect this pixel maps to
        const sx0 = xx / scale, sx1 = (xx + 1) / scale;
        const sy0 = yy / scale, sy1 = (yy + 1) / scale;
        const ix0 = Math.floor(sx0), ix1 = Math.min(g.w - 1, Math.ceil(sx1) - 1);
        const iy0 = Math.floor(sy0), iy1 = Math.min(g.h - 1, Math.ceil(sy1) - 1);
        let sum = 0, cnt = 0;
        for (let sy = iy0; sy <= iy1; sy++)
          for (let sx = ix0; sx <= ix1; sx++) {
            const idx = sy * g.w + sx;
            const nib = (g.data[idx >> 1] >> (idx % 2 === 0 ? 4 : 0)) & 15;
            sum += nib; cnt++;
          }
        alpha[yy * w + xx] = cnt ? Math.round((sum / cnt) * 17) : 0; // back to 0..255
      }
    out.set(cp, {
      alpha, w, h,
      dx: Math.round(g.xoff * scale),
      dy: Math.round((g.yoff - font.ascent) * scale),
      adv: g.adv * scale,
    });
  }
  glyphCache.set(key, out);
  return out;
}

function textWidth(fontIdx: number, size: number, text: string, spacing = 0): number {
  const sizePx = Math.round(size * SS);
  const glyphs = scaledGlyphs(fontIdx, sizePx);
  let w = 0;
  for (const ch of text) {
    const g = glyphs.get(ch.codePointAt(0)!) ?? glyphs.get(63)!;
    w += g.adv + spacing * SS;
  }
  return w / SS;
}

// Draw text with the baseline at (x, yBaseline) in design coords.
// Returns the pen width in design px. align: 'left' | 'center' | 'right'.
function text(
  fontIdx: number, size: number, str: string, x: number, yBaseline: number,
  c: RGB, opts: { spacing?: number; align?: 'left' | 'center' | 'right' } = {},
): number {
  const spacing = opts.spacing ?? 0;
  const width = textWidth(fontIdx, size, str, spacing);
  let penX = x;
  if (opts.align === 'center') penX = x - width / 2;
  if (opts.align === 'right') penX = x - width;
  const sizePx = Math.round(size * SS);
  const glyphs = scaledGlyphs(fontIdx, sizePx);
  const baseY = Math.round(yBaseline * SS);
  let pen = penX * SS;
  for (const ch of str) {
    const g = glyphs.get(ch.codePointAt(0)!) ?? glyphs.get(63)!;
    const gx = Math.round(pen) + g.dx;
    const gy = baseY + g.dy;
    for (let yy = 0; yy < g.h; yy++)
      for (let xx = 0; xx < g.w; xx++) {
        const a = g.alpha[yy * g.w + xx];
        if (a) blend(gx + xx, gy + yy, c, a / 255);
      }
    pen += g.adv + spacing * SS;
  }
  return width;
}

function wrap(fontIdx: number, size: number, str: string, maxWidth: number, spacing = 0): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (textWidth(fontIdx, size, trial, spacing) <= maxWidth || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw wrapped text; returns the y of the last baseline.
function block(
  fontIdx: number, size: number, str: string, x: number, yBaseline: number,
  maxWidth: number, lineHeight: number, c: RGB, maxLines = 99,
): number {
  const lines = wrap(fontIdx, size, str, maxWidth).slice(0, maxLines);
  let y = yBaseline;
  for (const ln of lines) { text(fontIdx, size, ln, x, y, c); y += lineHeight; }
  return y - lineHeight;
}

// Largest size <= startSize at which str fits maxWidth (for one-line bands).
function fitSize(fontIdx: number, str: string, maxWidth: number, startSize: number, spacing = 0): number {
  let s = startSize;
  while (s > 6 && textWidth(fontIdx, s, str, spacing) > maxWidth) s -= 0.5;
  return s;
}

// Truncate str (word-wise where possible) so it fits maxWidth at the given size.
function truncateToWidth(fontIdx: number, size: number, str: string, maxWidth: number): string {
  if (textWidth(fontIdx, size, str) <= maxWidth) return str;
  let out = str;
  while (out.length > 0 && textWidth(fontIdx, size, out + '..') > maxWidth) {
    const cut = out.lastIndexOf(' ');
    out = cut > 8 ? out.slice(0, cut) : out.slice(0, out.length - 1);
  }
  return out + '..';
}

// ------------------------------------------------------------ PNG output ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(): Buffer {
  // downsample SSxSS -> final RGB rows
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * CW + (x * SS + sx)) * 3;
          r += px[i]; g += px[i + 1]; b += px[i + 2];
        }
      const o = y * (1 + W * 3) + 1 + x * 3, n = SS * SS;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- helpers ----
function waves(x: number, y: number, w: number, rows: number, c: RGB, t = 2.4): void {
  for (let r = 0; r < rows; r++) {
    const yy = y + r * 9;
    for (let xx = 0; xx < w - 8; xx += 8)
      line(x + xx, yy + Math.sin((xx / w) * Math.PI * 2 + r) * 2, x + xx + 8, yy + Math.sin(((xx + 8) / w) * Math.PI * 2 + r) * 2, t, c);
  }
}

function star(cx: number, cy: number, ro: number, ri: number, n: number, c: RGB): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? ro : ri;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(pts, c);
}

// A small quadcopter silhouette with a red eye, centred near (cx, cy).
function droneAt(cx: number, cy: number, fg: RGB): void {
  line(cx - 9, cy - 5, cx + 9, cy + 5, 2.2, fg);
  line(cx + 9, cy - 5, cx - 9, cy + 5, 2.2, fg);
  rect(cx - 6, cy - 3.5, 12, 7, fg);
  for (const [rx, ry] of [[-11, -7], [11, -7], [-11, 7], [11, 7]] as const)
    ring(cx + rx, cy + ry, 3.6, 1.5, fg);
  circle(cx, cy, 1.7, RED);
}

// Layered flame: red outer, orange mid, yellow core triangles + glow circles.
function flame(cx: number, baseY: number, w: number, h: number): void {
  tri([cx - w / 2, baseY], [cx + w / 2, baseY], [cx, baseY - h], [208, 52, 30]);
  tri([cx - w / 3, baseY], [cx + w / 3, baseY], [cx + w * 0.08, baseY - h * 0.72], [242, 128, 32]);
  tri([cx - w / 6, baseY], [cx + w / 6, baseY], [cx, baseY - h * 0.45], [250, 196, 74]);
  circle(cx, baseY - h * 0.12, w * 0.16, [242, 128, 32]);
}

// Drifting smoke: a rising column of grey puffs.
function smoke(cx: number, topY: number, baseY: number, r0: number, r1: number): void {
  const shades: RGB[] = [[128, 128, 134], [110, 110, 116], [94, 94, 100], [80, 80, 86]];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const yy = baseY + (topY - baseY) * t;
    const xx = cx + t * 16 - 4;
    circle(xx, yy, r0 + (r1 - r0) * t, shades[i]);
  }
}

// ---------------------------------------------------------------- scenes ----
// HERO scene, box (x, y, 396, 200): a tanker ablaze in a narrow strait.
function sceneHormuz(x: number, y: number): void {
  rect(x, y, 396, 200, [203, 219, 229]); // sky
  circle(x + 350, y + 28, 15, [245, 213, 116]); // sun
  // rocky coasts closing in from both sides
  poly([[x, y + 62], [x + 92, y + 94], [x + 74, y + 126], [x, y + 126]], [112, 98, 84]);
  poly([[x + 396, y + 58], [x + 300, y + 92], [x + 320, y + 126], [x + 396, y + 126]], [104, 90, 78]);
  poly([[x, y + 62], [x + 92, y + 94], [x + 60, y + 100], [x, y + 88]], [128, 114, 98]);
  // the strait water
  rect(x, y + 118, 396, 82, [35, 95, 138]);
  waves(x + 14, y + 156, 110, 2, [214, 232, 244], 2);
  waves(x + 268, y + 182, 112, 2, [214, 232, 244], 2);
  // tanker, centre
  const cx = x + 198;
  poly([[cx - 120, y + 126], [cx + 120, y + 126], [cx + 99, y + 147], [cx - 99, y + 147]], INK); // hull
  rect(cx - 106, y + 122, 212, 4, RED); // hull stripe
  rect(cx - 98, y + 112, 148, 10, [72, 76, 84]); // deck
  rect(cx - 94, y + 96, 34, 16, [176, 84, 60]); // container stacks
  rect(cx - 56, y + 96, 34, 16, [64, 110, 150]);
  rect(cx - 94, y + 80, 34, 16, [90, 130, 90]);
  rect(cx + 62, y + 88, 27, 34, [236, 236, 231]); // bridge
  rect(cx + 66, y + 94, 19, 5, [35, 95, 138]);
  rect(cx + 42, y + 96, 12, 26, [40, 42, 48]); // funnel
  // fire amidships + smoke column
  flame(cx - 30, y + 98, 52, 46);
  flame(cx + 2, y + 98, 34, 32);
  smoke(cx - 16, y + 8, y + 58, 11, 24);
  // naval mines bobbing in the strait
  for (const [mx, my, mr] of [[x + 330, y + 166, 13], [x + 54, y + 174, 8.5]] as const) {
    circle(mx, my, mr, [29, 31, 37]);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * i) / 4;
      line(mx, my, mx + Math.cos(a) * (mr + 5), my + Math.sin(a) * (mr + 5), 2.4, [29, 31, 37]);
    }
    circle(mx - mr * 0.3, my - mr * 0.3, mr * 0.24, [130, 136, 146]);
  }
}

// Grid scene, box (x, y, 92, 80): Shenzhou-24 rocket + station, night sky.
function sceneRocket(x: number, y: number): void {
  rect(x, y, 92, 80, [17, 25, 55]);
  for (const [sx, sy] of [[10, 10], [26, 6], [70, 22], [84, 8], [6, 34], [86, 40], [50, 6]] as const)
    circle(x + sx, y + sy, 1.2, WHITE);
  // space station, top right
  rect(x + 60, y + 10, 18, 7, [205, 210, 218]);
  rect(x + 52, y + 11.5, 8, 4.5, [70, 110, 190]);
  rect(x + 78, y + 11.5, 8, 4.5, [70, 110, 190]);
  line(x + 69, y + 17, x + 69, y + 24, 1.6, [205, 210, 218]);
  // rocket on its pad
  tri([x + 29, y + 16], [x + 41, y + 16], [x + 35, y + 5], RED); // nose
  rect(x + 29, y + 16, 12, 29, [241, 241, 238]); // body
  circle(x + 35, y + 25, 3, [70, 110, 190]); // window
  rect(x + 31.5, y + 31, 7, 5.5, [18, 118, 58]); // Pakistan flag patch
  circle(x + 34.2, y + 33.7, 1.3, WHITE);
  tri([x + 29, y + 45], [x + 22, y + 55], [x + 29, y + 55], RED); // fins
  tri([x + 41, y + 45], [x + 48, y + 55], [x + 41, y + 55], RED);
  tri([x + 30, y + 55], [x + 40, y + 55], [x + 35, y + 70], [245, 150, 40]); // exhaust flame
  tri([x + 32.5, y + 55], [x + 37.5, y + 55], [x + 35, y + 63], [250, 205, 90]);
  circle(x + 24, y + 70, 6, [150, 152, 160]); // launch smoke
  circle(x + 46, y + 71, 7, [138, 140, 148]);
  rect(x + 18, y + 66, 34, 4, [120, 126, 136]); // pad
}

// Grid scene, box (x, y, 92, 80): Kyiv tower block ablaze at night.
function sceneKyiv(x: number, y: number): void {
  rect(x, y, 92, 80, [23, 27, 43]);
  circle(x + 82, y + 10, 5, [226, 228, 210]); // moon
  // tower block
  rect(x + 16, y + 16, 46, 58, [54, 58, 70]);
  rect(x + 14, y + 12, 50, 5, [40, 43, 54]);
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++) {
      const wx = x + 20 + c * 8.4, wy = y + 21 + r * 8.6;
      const burning = r === 0 && c >= 3;
      const lit = (r * 5 + c * 3) % 4 !== 0;
      rect(wx, wy, 4.6, 5.4, burning ? [245, 140, 40] : lit ? [250, 206, 110] : [31, 34, 45]);
    }
  flame(x + 52, y + 14, 20, 15); // roof fire
  smoke(x + 56, y + 0, y + 8, 4, 8);
  // drone overhead, left
  droneAt(x + 14, y + 10, [205, 210, 218]);
  // fire engine + hose arc, bottom right
  rect(x + 70, y + 64, 15, 8, RED);
  circle(x + 74, y + 73, 2.4, INK); circle(x + 82, y + 73, 2.4, INK);
  line(x + 72, y + 64, x + 58, y + 34, 1.7, [150, 192, 232]);
  line(x + 74, y + 64, x + 61, y + 33, 1.4, [190, 218, 244]);
  rect(x + 2, y + 74, 88, 3, [62, 66, 78]); // ground
}

// Grid scene, box (x, y, 92, 80): container port + 20% tariff stamp.
function scenePort(x: number, y: number): void {
  rect(x, y, 92, 80, [206, 223, 233]);
  // container stacks
  const cols: RGB[] = [[176, 84, 60], [64, 110, 150], [90, 130, 90], [198, 148, 58]];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      rect(x + 6 + c * 17, y + 32 + r * 10, 15, 8.6, cols[(r + c) % 4]);
  // gantry crane
  line(x + 74, y + 8, x + 74, y + 62, 2.4, INK);
  line(x + 38, y + 8, x + 88, y + 8, 2.4, INK);
  line(x + 74, y + 8, x + 60, y + 26, 1.6, INK);
  line(x + 52, y + 8, x + 52, y + 22, 1.6, INK);
  rect(x + 46, y + 22, 12, 8, [176, 84, 60]);
  // ship in the water
  rect(x, y + 63, 92, 17, [40, 100, 145]);
  poly([[x + 10, y + 63], [x + 82, y + 63], [x + 74, y + 70], [x + 18, y + 70]], INK);
  // tariff stamp
  frame(x + 56, y + 36, 33, 21, 2.2, RED);
  text(SANS, 13.5, '20%', x + 72.5, y + 51.5, RED, { align: 'center' });
}

// Grid scene, box (x, y, 92, 80): Sudan desert town under a drone.
function sceneSudan(x: number, y: number): void {
  rect(x, y, 92, 80, [233, 206, 150]);
  circle(x + 79, y + 13, 8, [246, 190, 80]); // sun
  rect(x, y + 52, 92, 28, [198, 162, 106]); // sand
  // town: flat-roofed houses + a minaret
  rect(x + 7, y + 41, 16, 12, [150, 105, 70]);
  tri([x + 6, y + 41], [x + 24, y + 41], [x + 15, y + 35], [128, 88, 58]);
  rect(x + 27, y + 45, 13, 9, [160, 115, 75]);
  rect(x + 57, y + 43, 18, 11, [150, 105, 70]);
  tri([x + 56, y + 43], [x + 76, y + 43], [x + 66, y + 37], [128, 88, 58]);
  rect(x + 45, y + 28, 6, 25, [172, 132, 86]);
  circle(x + 48, y + 26, 4.4, [172, 132, 86]);
  // smoke from the struck house
  smoke(x + 66, y + 12, y + 36, 4.5, 9.5);
  // drone overhead
  droneAt(x + 30, y + 14, INK);
  // displaced families: small figures with bundles, bottom left
  for (const fx of [12, 22, 32]) {
    circle(x + fx, y + 62, 2.2, [90, 70, 50]);
    line(x + fx, y + 64, x + fx, y + 71, 2.2, [90, 70, 50]);
    circle(x + fx + 3.4, y + 60, 2.6, [176, 84, 60]);
  }
}

// Grid scene, box (x, y, 92, 80): the Pope before a crowd + climate thermometer.
function scenePope(x: number, y: number): void {
  rect(x, y, 92, 80, [238, 231, 206]);
  circle(x + 44, y + 40, 31, [226, 214, 178]); // halo backdrop
  ring(x + 44, y + 40, 31, 2.4, [206, 190, 148]);
  // the Pope in white
  poly([[x + 34, y + 72], [x + 54, y + 72], [x + 49, y + 34], [x + 39, y + 34]], WHITE); // robe
  line(x + 51, y + 40, x + 63, y + 29, 4.4, WHITE); // raised arm
  circle(x + 64.5, y + 28, 2.6, [233, 191, 156]); // hand
  circle(x + 44, y + 26, 6.6, [233, 191, 156]); // head
  poly([[x + 38, y + 22], [x + 50, y + 22], [x + 44, y + 9]], WHITE); // mitre
  line(x + 44, y + 13, x + 44, y + 19, 1.6, RED);
  line(x + 41.8, y + 16, x + 46.2, y + 16, 1.6, RED);
  line(x + 40, y + 46, x + 48, y + 46, 2, RED); // sash hint
  // crowd of heads along the bottom
  for (let i = 0; i < 9; i++) circle(x + 6 + i * 10, y + 76 - (i % 2) * 3, 3.1, [70, 72, 80]);
  // globe + thermometer of a warming world, right side
  ring(x + 78, y + 58, 7.5, 2, [14, 124, 91]);
  circle(x + 75.5, y + 55, 2.4, [14, 124, 91]); circle(x + 80.5, y + 61, 2.8, [14, 124, 91]);
  rect(x + 84, y + 8, 4, 24, [90, 95, 105]);
  circle(x + 86, y + 37, 6.4, [90, 95, 105]);
  rect(x + 85.2, y + 20, 1.8, 14, RED);
  circle(x + 86, y + 37, 3.6, RED);
}

// Grid scene, box (x, y, 92, 80): Ras Tanura refinery, drone overhead.
function sceneRefinery(x: number, y: number): void {
  rect(x, y, 92, 80, [241, 207, 171]); // dusk sky
  // storage tanks
  rect(x + 5, y + 47, 21, 21, [212, 216, 222]);
  rect(x + 5, y + 47, 21, 3.4, [170, 176, 184]);
  rect(x + 29, y + 52, 16, 16, [200, 205, 212]);
  rect(x + 29, y + 52, 16, 3, [160, 166, 174]);
  // distillation towers + chimney
  rect(x + 50, y + 20, 9, 48, [122, 128, 138]);
  rect(x + 62, y + 28, 7, 40, [132, 138, 148]);
  rect(x + 74, y + 13, 6, 55, [106, 112, 122]);
  line(x + 54, y + 34, x + 65, y + 34, 2, [106, 112, 122]); // pipework
  line(x + 65, y + 46, x + 77, y + 46, 2, [106, 112, 122]);
  flame(x + 54.5, y + 20, 15, 14); // flare stack burning
  smoke(x + 77, y + 0, y + 10, 3.6, 7.5); // chimney smoke
  // drone overhead, top left
  droneAt(x + 17, y + 12, INK);
  // the Red Sea shore
  rect(x, y + 68, 92, 12, [50, 110, 150]);
  waves(x + 8, y + 71, 76, 1, [214, 232, 244], 1.8);
}

// Wide-panel scene, box (x, y, 76, 34): Australia & Solomon Islands flags + palm.
function sceneFlags(x: number, y: number): void {
  line(x + 12, y + 3, x + 12, y + 32, 1.8, INK);
  line(x + 42, y + 3, x + 42, y + 32, 1.8, INK);
  rect(x, y + 32, 76, 2, [120, 126, 110]);
  // Australia (simplified): blue field, canton crosses, white stars
  rect(x + 12, y + 3, 25, 14, [30, 60, 140]);
  rect(x + 12, y + 3, 12, 7, [24, 44, 108]);
  line(x + 12, y + 6.5, x + 24, y + 6.5, 2.6, WHITE);
  line(x + 18, y + 3, x + 18, y + 10, 2.6, WHITE);
  line(x + 12, y + 6.5, x + 24, y + 6.5, 1.2, RED);
  line(x + 18, y + 3, x + 18, y + 10, 1.2, RED);
  circle(x + 18, y + 14, 1.4, WHITE);
  circle(x + 30, y + 7, 1.2, WHITE); circle(x + 33, y + 12, 1.2, WHITE); circle(x + 27, y + 11, 1, WHITE);
  // Solomon Islands: green/blue diagonal divided by a yellow stripe, white stars
  rect(x + 42, y + 3, 25, 14, [40, 90, 170]);
  poly([[x + 42, y + 3], [x + 67, y + 3], [x + 42, y + 17]], [28, 138, 68]);
  line(x + 42, y + 17, x + 67, y + 3, 2.6, [245, 200, 40]);
  for (const [sx, sy] of [[47, 7], [52, 6], [49, 11]] as const) circle(x + sx, y + sy, 1, WHITE);
  // palm at the right
  line(x + 71, y + 32, x + 73, y + 15, 2, [110, 84, 55]);
  for (const a of [-0.5, -0.1, 0.35, 0.8]) {
    line(x + 73, y + 15, x + 73 + Math.cos(a - 1.2) * 8, y + 15 + Math.sin(a - 1.2) * 6 - 2, 1.6, [28, 138, 68]);
  }
}

// ------------------------------------------------------------------ page ----
fillAll(PAPER);
const M = 36; // page margin
const RIGHT = W - M;

// masthead
rect(M, 10, W - 2 * M, 3, INK);
text(SANS, 12, "THE DAY'S WORLD NEWS IN ONE IMAGE", M, 32, INK, { spacing: 2.2 });
text(SANS, 12, 'GLOBAL EDITION', RIGHT, 32, MUTED, { spacing: 2.2, align: 'right' });
const titleSize = fitSize(SERIF, 'THE WORLD TODAY', 920, 84);
text(SERIF, titleSize, 'THE WORLD TODAY', W / 2, 98, INK, { align: 'center' });
rect(M, 108, W - 2 * M, 4, INK);
rect(M, 115, W - 2 * M, 1.6, RED);

// date band — the day, named unmissably
rect(M, 122, W - 2 * M, 44, INK);
rect(M, 122, 6, 44, RED); rect(RIGHT - 6, 122, 6, 44, RED);
const dateStr = 'WEDNESDAY 25 NOVEMBER 2026';
text(SANS, fitSize(SANS, dateStr, 900, 36, 1.2), dateStr, W / 2, 154, WHITE, { spacing: 1.2, align: 'center' });
text(BODY, 14.5, 'Eight lead stories and 27 more from around the world — one day of news, in one picture.', W / 2, 186, DARKTXT, { align: 'center' });

// HERO — lead story: tankers hit mines in the Strait of Hormuz
const HY = 198, HH = 240;
rect(M, HY, W - 2 * M, HH, CARD);
frame(M, HY, W - 2 * M, HH, 2, INK);
sceneHormuz(M + 16, HY + 16);
frame(M + 16, HY + 16, 396, 200, 1.6, INK);
const HX = M + 436; // 472
text(SANS, 14, 'MIDDLE EAST · STRAIT OF HORMUZ', HX, HY + 40, RED, { spacing: 1.4 });
block(SERIF, 41, 'Tankers hit mines in the Strait of Hormuz', HX, HY + 86, RIGHT - HX - 16, 47, INK, 2);
block(BODY, 16.5, "Iran says two oil tankers struck naval mines, exploded and caught fire in the strait, and warns ships to coordinate passage with Tehran — a claim no authority has confirmed.", HX, HY + 168, RIGHT - HX - 16, 21.5, INK, 3);
text(SANS, 14, 'OIL JUMPS: BRENT $94.61, UP 3.5% ON THE DAY', HX, HY + 232, RED, { spacing: 0.6 });

// lead-story grid: six more illustrated panels, 2 columns x 3 rows
interface Story {
  tag: string; accent: RGB; headline: string; summary: string;
  scene: (x: number, y: number) => void;
}
const leads: Story[] = [
  {
    tag: 'EAST ASIA · SPACE', accent: [30, 90, 160],
    headline: "CHINA FLIES PAKISTAN'S FIRST ASTRONAUT",
    summary: "Shenzhou-24 docks at China's space station with a Pakistani aboard — the first foreign astronaut to fly there.",
    scene: sceneRocket,
  },
  {
    tag: 'EUROPE · WAR IN UKRAINE', accent: [47, 93, 138],
    headline: 'RUSSIAN STRIKES BATTER KYIV AND ODESA',
    summary: 'Two killed, three wounded in Odesa; a Kyiv tower block set ablaze; Ukrainian drones hit refineries in Samara.',
    scene: sceneKyiv,
  },
  {
    tag: 'NORTH AMERICA · TRADE', accent: RED,
    headline: 'US PROPOSES TARIFFS ON 14 PARTNERS',
    summary: "After an 8-month probe, new 'excess capacity' duties; the top rate, 20%, aims at China. Japan and EU listed.",
    scene: scenePort,
  },
  {
    tag: 'AFRICA · SUDAN', accent: [170, 110, 40],
    headline: 'SUDAN DRONE STRIKES KILL 19 CIVILIANS',
    summary: 'Emergency Lawyers say RSF drone strikes killed 19 civilians and wounded 20 others in two cities.',
    scene: sceneSudan,
  },
  {
    tag: 'VATICAN · CLIMATE', accent: [14, 124, 91],
    headline: 'POPE LAMENTS COP31 CLIMATE FAILURE',
    summary: 'Pope Leo XIV laments the failed COP31 talks, warning extreme climate events grow more frequent.',
    scene: scenePope,
  },
  {
    tag: 'MIDDLE EAST · YEMEN', accent: [150, 60, 40],
    headline: 'HOUTHIS CLAIM ATTACK ON SAUDI REFINERY',
    summary: "Houthis say they struck Ras Tanura, the kingdom's largest refinery, as coalition operations near Hodeidah step up.",
    scene: sceneRefinery,
  },
];

const GY = 446, PH = 102, PGAP = 6, COLW = (W - 2 * M - 14) / 2; // 469
leads.forEach((st, i) => {
  const cx = M + (i % 2) * (COLW + 14);
  const cy = GY + Math.floor(i / 2) * (PH + PGAP);
  rect(cx, cy, COLW, PH, CARD);
  frame(cx, cy, COLW, PH, 1.4, INK);
  st.scene(cx + 12, cy + 11);
  frame(cx + 12, cy + 11, 92, 80, 1.2, INK);
  const tx = cx + 118, tw = COLW - 118 - 12;
  text(SANS, 10.5, st.tag, tx, cy + 21, st.accent, { spacing: 1 });
  const hl = wrap(SANS, 18.5, st.headline, tw).slice(0, 2);
  hl.forEach((ln, k) => text(SANS, 18.5, ln, tx, cy + 42 + k * 20, INK));
  block(BODY, 12, st.summary, tx, cy + 80, tw, 14, DARKTXT, 2);
});

// eighth lead, wide slim panel: Australia–Solomons treaty
const SY = 772, SH = 44;
rect(M, SY, W - 2 * M, SH, CARD);
frame(M, SY, W - 2 * M, SH, 1.4, INK);
sceneFlags(M + 10, SY + 5);
text(SANS, 15.5, 'AUSTRALIA & SOLOMONS SIGN SECURITY TREATY', M + 98, SY + 20, INK);
text(SANS, 10.5, 'OCEANIA · PACIFIC', RIGHT - 12, SY + 20, [14, 124, 91], { spacing: 1, align: 'right' });
text(BODY, 11.5, "Canberra is named Honiara's primary security partner, and the Solomons commit to hosting no foreign military or security base.", M + 98, SY + 37, DARKTXT);

// dense world strip: 27 rapid-fire stories in three columns
const WY = 824;
rect(M, WY, W - 2 * M, 24, INK);
text(SANS, 14.5, 'AROUND THE WORLD IN 25 NOVEMBER', M + 12, WY + 17, WHITE, { spacing: 1.2 });
text(SANS, 12, '27 MORE STORIES', RIGHT - 12, WY + 17, [208, 208, 208], { spacing: 1.2, align: 'right' });

const rapid: [string, string][] = [
  ['GAZA', 'Hamas security chief killed in Israeli strike'],
  ['SYRIA', 'Islamic State attack kills two in Hasaka'],
  ['ISRAEL', 'Judges urge dropping one Netanyahu bribery case'],
  ['UAE', "'Union 55' security drill spans all 7 emirates"],
  ['NIGERIA', 'Militants kill at least 30 in Niger State'],
  ['EGYPT', 'Fuel-truck blaze kills 21 on ring road'],
  ['DR CONGO', 'Ebola workers evacuated from Ituri fighting'],
  ['SPAIN', 'Record 2,100 migrants reach Canaries in a day'],
  ['BULGARIA', 'First migrant boat in months intercepted'],
  ['FRANCE', 'Decathlon cyberattack exposes 130,000 customers'],
  ['POLAND', 'No-fly zone planned along eastern border'],
  ['SPAIN', 'Puigdemont vows to return on 12 December'],
  ['USA', 'Nvidia slides 8% amid questions over Huang'],
  ['USA', 'No China spy link found in Nvidia case'],
  ['USA', 'CIA and spy agency suffer unclassified breach'],
  ['USA', 'Rodgers says he will not return to Steelers'],
  ['USA', "O'Hare ground stops snarl holiday travel"],
  ['MEXICO', "Cartel chief 'El Chapo Isidro' captured"],
  ['ARGENTINA', "Thousands join 'March of Anger' in capital"],
  ['BANGLADESH', 'Garment wage up 36% to $139 a month'],
  ['INDIA', 'Protest leader told not to use his passport'],
  ['INDONESIA', 'Mine flood kills 8, with 18 still trapped'],
  ['JAPAN', 'PM defends the ICC in a break with the US'],
  ['TAIWAN', 'Comedian performs with a security detail'],
  ['ITALY', 'Sinner sidelined after knee surgery'],
  ['UK', 'Museum of London opens in market venue'],
  ['SINGAPORE', '2026 growth forecast raised to about 6%'],
];
const stripCols = [M, M + 323, M + 646];
rapid.forEach(([tag, item], i) => {
  const cx = stripCols[i % 3];
  const baseY = WY + 42 + Math.floor(i / 3) * 12.2;
  const tagW = text(SANS, 10.6, tag, cx, baseY, RED, { spacing: 0.4 });
  const avail = 306 - tagW - 5;
  text(BODY, 10.6, truncateToWidth(BODY, 10.6, item, avail), cx + tagW + 5, baseY, INK);
});

// numbers strip: markets + Champions League
const NY = 974;
rect(M, NY, W - 2 * M, 44, INK);
const num1 = 'MARKETS · DOW 50,182.95 +0.33% · S&P 500 7,182.78 -0.25% · NASDAQ 23,585.80 -0.62% · BRENT $94.61 +3.5% · WTI $83.68 +2.0% · GOLD OVER $3,600';
text(SANS, fitSize(SANS, num1, 920, 13), num1, W / 2, NY + 17, WHITE, { align: 'center' });
const num2 = 'CHAMPIONS LEAGUE · BRUGGE 0-3 LIVERPOOL · PSG 2-2 ROMA · SPORTING 2-2 MAN UTD · LILLE 2-1 BAYERN · SABA 1-4 BARCELONA · INTER 2-0 STUTTGART · ATLETICO 2-0 VIKING · SHAKHTAR 0-1 FENERBAHCE · SLAVIA 0-1 VILLARREAL';
text(BODY, fitSize(BODY, num2, 920, 10.8), num2, W / 2, NY + 34, [226, 226, 226], { align: 'center' });

// ------------------------------------------------------------------- run ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePng());
