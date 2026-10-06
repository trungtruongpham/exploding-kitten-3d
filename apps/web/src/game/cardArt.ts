import * as THREE from 'three';
import type { CardType } from '@meobom/engine';
import { CARD_NAMES, CARD_TEXT } from '../i18n';

/** Card faces are painted on a canvas from text, so a new language never needs new art. */

type Ctx = CanvasRenderingContext2D;

export const CARD_COLORS: Record<CardType, string> = {
  fuse: '#2a2231',
  snip: '#3a9a62',
  hiss: '#cf4232',
  pounce: '#e9822a',
  catnap: '#3c73c8',
  bribe: '#c29a22',
  scramble: '#7d52c4',
  peek: '#23a09e',
  toast: '#d99456',
  disco: '#cc5fa6',
  potato: '#a78a52',
  wizard: '#5b62c9',
  ninja: '#454b5a',
};

const DISPLAY = '"Baloo 2", "Trebuchet MS", sans-serif';
const BODY = 'Nunito, "Segoe UI", sans-serif';

export function rr(x: Ctx, X: number, Y: number, W: number, H: number, r: number) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

function star(x: Ctx, cx: number, cy: number, R: number, r: number, col: string, n = 8) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rad = i % 2 ? r : R;
    x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  x.closePath();
  x.fillStyle = col;
  x.fill();
}

function wrap(x: Ctx, text: string, cx: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  const y0 = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => x.fillText(l, cx, y0 + i * lh));
}

export function catHead(x: Ctx, cx: number, cy: number, fill: string, line: string, shape: 'round' | 'square' | 'potato') {
  x.fillStyle = fill;
  x.strokeStyle = line;
  x.lineWidth = 6;
  x.lineJoin = 'round';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + s * 70, cy - 26);
    x.lineTo(cx + s * 58, cy - 108);
    x.lineTo(cx + s * 14, cy - 70);
    x.closePath();
    x.fill();
    x.stroke();
    x.beginPath();
    x.moveTo(cx + s * 58, cy - 40);
    x.lineTo(cx + s * 54, cy - 88);
    x.lineTo(cx + s * 28, cy - 64);
    x.closePath();
    x.fillStyle = '#f2a0a8';
    x.fill();
    x.fillStyle = fill;
  }
  x.beginPath();
  if (shape === 'square') rr(x, cx - 80, cy - 78, 160, 150, 34);
  else if (shape === 'potato') x.ellipse(cx, cy + 4, 92, 70, 0.12, 0, Math.PI * 2);
  else x.arc(cx, cy, 80, 0, Math.PI * 2);
  x.fill();
  x.stroke();
}

function eyes(x: Ctx, cx: number, cy: number, kind: 'closed' | 'big' | 'angry' | 'dot', ink: string) {
  x.fillStyle = ink;
  x.strokeStyle = ink;
  x.lineWidth = 6;
  x.lineCap = 'round';
  if (kind === 'closed') {
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(cx + s * 30, cy - 6, 13, 0.15 * Math.PI, 0.85 * Math.PI);
      x.stroke();
    }
  } else if (kind === 'big') {
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(cx + s * 30, cy - 8, 22, 0, Math.PI * 2);
      x.fillStyle = '#fff';
      x.fill();
      x.stroke();
      x.beginPath();
      x.arc(cx + s * 30 + 4, cy - 6, 10, 0, Math.PI * 2);
      x.fillStyle = ink;
      x.fill();
    }
  } else if (kind === 'angry') {
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + s * 48, cy - 34);
      x.lineTo(cx + s * 16, cy - 20);
      x.stroke();
      x.beginPath();
      x.arc(cx + s * 30, cy - 6, 8, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(cx + s * 30, cy - 6, 9, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.arc(cx + s * 30 + 3, cy - 9, 3, 0, Math.PI * 2);
      x.fillStyle = '#fff';
      x.fill();
      x.fillStyle = ink;
    }
  }
  x.fillStyle = '#e8838f';
  x.beginPath();
  x.moveTo(cx - 8, cy + 14);
  x.lineTo(cx + 8, cy + 14);
  x.lineTo(cx, cy + 22);
  x.closePath();
  x.fill();
  x.strokeStyle = ink;
  x.lineWidth = 4;
  if (kind === 'angry') {
    x.beginPath();
    x.ellipse(cx, cy + 40, 20, 14, 0, 0, Math.PI * 2);
    x.fillStyle = '#5a1a1a';
    x.fill();
    x.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + s * 12, cy + 28);
      x.lineTo(cx + s * 6, cy + 40);
      x.lineTo(cx + s * 16, cy + 30);
      x.fill();
    }
  } else {
    x.beginPath();
    x.arc(cx - 8, cy + 24, 8, 0.1 * Math.PI, 0.9 * Math.PI);
    x.arc(cx + 8, cy + 24, 8, 0.1 * Math.PI, 0.9 * Math.PI);
    x.stroke();
  }
  x.lineWidth = 3;
  for (const s of [-1, 1])
    for (const d of [-8, 6]) {
      x.beginPath();
      x.moveTo(cx + s * 44, cy + 18 + d * 0.3);
      x.lineTo(cx + s * 96, cy + 12 + d);
      x.stroke();
    }
}

function art(x: Ctx, type: CardType, cx: number, cy: number) {
  const ink = '#2a1f2c';
  const cream = '#fff4e2';
  if (type === 'fuse') {
    x.strokeStyle = '#d9c3a0';
    x.lineWidth = 7;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx + 20, cy - 74);
    x.quadraticCurveTo(cx + 70, cy - 120, cx + 56, cy - 146);
    x.stroke();
    star(x, cx + 56, cy - 150, 26, 10, '#ffb547', 9);
    star(x, cx + 56, cy - 150, 13, 6, '#fff3b0', 7);
    catHead(x, cx, cy, '#15111a', '#ffb547', 'round');
    for (const s of [-1, 1]) {
      x.fillStyle = '#ffb547';
      x.beginPath();
      x.arc(cx + s * 30, cy - 6, 13, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#15111a';
      x.fillRect(cx + s * 30 - 3, cy - 17, 6, 22);
    }
    x.strokeStyle = '#ffb547';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(cx - 24, cy + 34);
    for (let i = 0; i <= 6; i++) x.lineTo(cx - 24 + i * 8, cy + 34 + (i % 2 ? 8 : 0));
    x.stroke();
    return;
  }
  if (type === 'pounce') {
    x.strokeStyle = 'rgba(255,255,255,.55)';
    x.lineWidth = 7;
    x.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(cx - 140, cy - 40 + i * 28);
      x.lineTo(cx - 96 + (i % 2) * 14, cy - 40 + i * 28);
      x.stroke();
    }
  }
  if (type === 'scramble') {
    x.strokeStyle = 'rgba(255,255,255,.6)';
    x.lineWidth = 8;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(cx, cy, 108, -0.2 * Math.PI, 0.55 * Math.PI);
    x.stroke();
    x.beginPath();
    x.arc(cx, cy, 108, 0.8 * Math.PI, 1.55 * Math.PI);
    x.stroke();
  }
  if (type === 'hiss') star(x, cx, cy, 124, 92, 'rgba(255,255,255,.25)', 14);
  if (type === 'disco') {
    star(x, cx - 96, cy - 80, 18, 6, '#fff3b0', 4);
    star(x, cx + 100, cy + 40, 14, 5, '#fff3b0', 4);
    star(x, cx + 88, cy - 96, 10, 4, '#fff', 4);
  }
  const kind = type === 'catnap' ? 'closed' : type === 'peek' ? 'big' : type === 'hiss' ? 'angry' : 'dot';
  const shape = type === 'toast' ? 'square' : type === 'potato' ? 'potato' : 'round';
  catHead(x, cx, cy, type === 'toast' ? '#f3d29a' : type === 'potato' ? '#d9b77a' : cream, ink, shape);
  if (type === 'toast') {
    x.strokeStyle = '#9a5a26';
    x.lineWidth = 10;
    rr(x, cx - 80, cy - 78, 160, 150, 34);
    x.stroke();
  }
  eyes(x, cx, cy, kind, ink);
  if (type === 'ninja') {
    x.fillStyle = '#20232b';
    x.fillRect(cx - 84, cy - 26, 168, 34);
    x.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(cx + s * 30, cy - 9, 12, 5, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#d0453a';
    x.fillRect(cx + 78, cy - 24, 34, 10);
  }
  if (type === 'wizard') {
    x.fillStyle = '#2f2f86';
    x.beginPath();
    x.moveTo(cx - 60, cy - 60);
    x.lineTo(cx + 10, cy - 160);
    x.lineTo(cx + 60, cy - 60);
    x.closePath();
    x.fill();
    star(x, cx + 8, cy - 100, 12, 5, '#ffd86b', 5);
  }
  if (type === 'catnap') {
    x.fillStyle = '#fff';
    x.font = `700 34px ${DISPLAY}`;
    x.fillText('z', cx + 86, cy - 60);
    x.font = `700 24px ${DISPLAY}`;
    x.fillText('z', cx + 108, cy - 88);
  }
  if (type === 'snip') {
    x.save();
    x.translate(cx + 56, cy + 58);
    x.rotate(-0.6);
    x.strokeStyle = '#2a1f2c';
    x.lineWidth = 7;
    x.fillStyle = '#cfd6dc';
    for (const s of [-1, 1]) {
      x.save();
      x.rotate(s * 0.28);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(70, -6 * s);
      x.lineTo(70, 4 * s);
      x.closePath();
      x.fill();
      x.stroke();
      x.restore();
    }
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(-26, s * 18, 15, 0, Math.PI * 2);
      x.fillStyle = '#e44d3a';
      x.fill();
      x.stroke();
    }
    x.restore();
  }
  if (type === 'bribe') {
    x.save();
    x.translate(cx - 6, cy + 84);
    x.fillStyle = '#9fd3ea';
    x.strokeStyle = ink;
    x.lineWidth = 5;
    x.beginPath();
    x.ellipse(0, 0, 48, 20, 0, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.beginPath();
    x.moveTo(44, 0);
    x.lineTo(72, -18);
    x.lineTo(72, 18);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = ink;
    x.beginPath();
    x.arc(-28, -4, 4, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
}

function canvasTexture(draw: (x: Ctx) => void, aniso: number) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 448;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

const faceCache = new Map<CardType, THREE.Texture>();

export function faceTexture(type: CardType, aniso: number): THREE.Texture {
  const hit = faceCache.get(type);
  if (hit) return hit;
  const t = canvasTexture((x) => {
    rr(x, 0, 0, 320, 448, 30);
    x.fillStyle = '#f7ecd8';
    x.fill();
    rr(x, 14, 14, 292, 420, 20);
    x.fillStyle = CARD_COLORS[type];
    x.fill();
    x.save();
    rr(x, 14, 14, 292, 420, 20);
    x.clip();
    x.globalAlpha = 0.07;
    x.fillStyle = '#fff';
    for (let i = -460; i < 330; i += 34) {
      x.beginPath();
      x.moveTo(i, 14);
      x.lineTo(i + 16, 14);
      x.lineTo(i + 16 + 420, 434);
      x.lineTo(i + 420, 434);
      x.fill();
    }
    x.restore();
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff8ec';
    let fs = 40;
    do {
      x.font = `700 ${fs}px ${DISPLAY}`;
      fs -= 2;
    } while (x.measureText(CARD_NAMES[type]).width > 270 && fs > 20);
    x.fillText(CARD_NAMES[type], 160, 60);
    art(x, type, 160, 200);
    rr(x, 28, 320, 264, 96, 14);
    x.fillStyle = 'rgba(0,0,0,.24)';
    x.fill();
    x.fillStyle = '#fff8ec';
    x.font = `700 19px ${BODY}`;
    wrap(x, CARD_TEXT[type], 160, 368, 240, 24);
  }, aniso);
  faceCache.set(type, t);
  return t;
}

let backCache: THREE.Texture | null = null;
export function backTexture(aniso: number): THREE.Texture {
  if (backCache) return backCache;
  backCache = canvasTexture((x) => {
    rr(x, 0, 0, 320, 448, 30);
    x.fillStyle = '#f7ecd8';
    x.fill();
    rr(x, 14, 14, 292, 420, 20);
    x.fillStyle = '#2d2136';
    x.fill();
    x.save();
    rr(x, 14, 14, 292, 420, 20);
    x.clip();
    x.fillStyle = 'rgba(255,181,71,.10)';
    for (let r = 0; r < 9; r++)
      for (let k = 0; k < 5; k++) {
        const px = 30 + k * 66 + (r % 2) * 33;
        const py = 30 + r * 52;
        x.beginPath();
        x.ellipse(px, py, 10, 8, 0, 0, Math.PI * 2);
        x.fill();
        for (let t = 0; t < 4; t++) {
          x.beginPath();
          x.arc(px - 12 + t * 8, py - 12 - (t === 1 || t === 2 ? 3 : 0), 4, 0, Math.PI * 2);
          x.fill();
        }
      }
    x.restore();
    x.strokeStyle = '#ffb547';
    x.lineWidth = 5;
    rr(x, 34, 34, 252, 380, 14);
    x.stroke();
    x.save();
    x.translate(160, 214);
    x.scale(0.62, 0.62);
    catHead(x, 0, 0, '#ffb547', '#2d2136', 'round');
    x.restore();
    x.fillStyle = '#2d2136';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.arc(160 + s * 19, 210, 7, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = '#d9c3a0';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(170, 168);
    x.quadraticCurveTo(200, 140, 192, 122);
    x.stroke();
    star(x, 192, 118, 15, 6, '#fff3b0', 8);
    x.fillStyle = '#ffb547';
    x.textAlign = 'center';
    x.font = `800 46px ${DISPLAY}`;
    x.fillText('MÈO BOM', 160, 344);
  }, aniso);
  return backCache;
}

/** Waits for the card fonts so the first textures aren't painted with a fallback face. */
export async function loadCardFonts() {
  try {
    await Promise.race([
      Promise.all([document.fonts.load(`700 40px ${DISPLAY}`, 'Mèo Bom'), document.fonts.load(`700 20px ${BODY}`, 'Mèo Bom')]),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}
