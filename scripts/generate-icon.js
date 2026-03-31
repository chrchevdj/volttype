/**
 * Generate VoltType app icon — minimal, smooth, premium.
 *
 * Concept: A clean circle with a stylized voice wave + bolt.
 * Dark background, teal accent. No keyboard, no clutter.
 */
const fs = require('fs');
const path = require('path');
const { createPNG } = require('../src/png-utils');

const SIZE = 256;
const rgba = Buffer.alloc(SIZE * SIZE * 4);
const CX = SIZE / 2;
const CY = SIZE / 2;

function setPixel(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  const srcA = a / 255;
  rgba[idx] = Math.round(r * srcA + rgba[idx] * (1 - srcA));
  rgba[idx + 1] = Math.round(g * srcA + rgba[idx + 1] * (1 - srcA));
  rgba[idx + 2] = Math.round(b * srcA + rgba[idx + 2] * (1 - srcA));
  rgba[idx + 3] = Math.min(255, Math.max(rgba[idx + 3], a));
}

// Anti-aliased filled circle
function fillCircle(cx, cy, r, cr, cg, cb, ca = 255) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r - 0.5) {
        setPixel(x, y, cr, cg, cb, ca);
      } else if (dist <= r + 0.5) {
        const aa = Math.round((r + 0.5 - dist) * ca);
        setPixel(x, y, cr, cg, cb, aa);
      }
    }
  }
}

// Draw thick smooth line
function drawThickLine(x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(len * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    fillCircle(cx, cy, thickness / 2, r, g, b, a);
  }
}

// Draw smooth wave path
function drawWave(cx, cy, width, amplitude, periods, thickness, r, g, b, a = 255) {
  let prevX = null, prevY = null;
  for (let i = -width / 2; i <= width / 2; i += 0.8) {
    const x = cx + i;
    const progress = (i + width / 2) / width;
    // Fade amplitude at edges for smooth taper
    const envelope = Math.sin(progress * Math.PI);
    const y = cy + Math.sin(i / width * Math.PI * 2 * periods) * amplitude * envelope;
    if (prevX !== null) {
      drawThickLine(prevX, prevY, x, y, thickness, r, g, b, a);
    }
    prevX = x;
    prevY = y;
  }
}

// 1. Background — smooth dark circle (not a square)
fillCircle(CX, CY, 120, 12, 20, 38);       // Dark navy base
fillCircle(CX, CY, 118, 15, 25, 45);       // Slightly lighter inner

// 2. Subtle gradient glow in center
fillCircle(CX, CY - 10, 60, 30, 80, 70, 30);  // Subtle teal glow center

// 3. Main voice wave — bold, centered
drawWave(CX, CY - 5, 140, 30, 2.5, 7, 56, 189, 156, 255);

// 4. Secondary waves (thinner, more transparent)
drawWave(CX, CY - 5, 120, 18, 2.5, 3.5, 56, 189, 156, 120);
drawWave(CX, CY - 5, 100, 42, 2.5, 3.5, 59, 130, 246, 100);

// 5. Bolt symbol — clean, integrated into the wave
// Small bolt in the center-right area
const boltCX = CX + 5;
const boltCY = CY - 5;
drawThickLine(boltCX + 2, boltCY - 22, boltCX - 8, boltCY + 2, 5, 255, 255, 255, 220);
drawThickLine(boltCX - 8, boltCY + 2, boltCX + 2, boltCY + 2, 4, 255, 255, 255, 220);
drawThickLine(boltCX + 2, boltCY + 2, boltCX - 6, boltCY + 24, 5, 255, 255, 255, 220);

// Save
const pngBuffer = createPNG(SIZE, SIZE, rgba);
const outPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(outPath, pngBuffer);
console.log(`Icon saved to ${outPath} (${SIZE}x${SIZE})`);
