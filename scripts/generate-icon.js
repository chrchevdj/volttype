/**
 * Generate app icon PNGs from the SVG for electron-builder.
 * Uses the built-in Electron/Node canvas-like approach.
 *
 * Run: node scripts/generate-icon.js
 * Outputs: build/icon.png (256x256)
 *
 * For .ico conversion, use an online tool or install sharp/png2ico.
 */
const fs = require('fs');
const path = require('path');

// We'll create the icon using our existing PNG encoder
const { createPNG } = require('../src/png-utils');

const SIZE = 256;
const rgba = Buffer.alloc(SIZE * SIZE * 4);

// Helper: set pixel with alpha blending
function setPixel(x, y, r, g, b, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  const srcA = a / 255;
  rgba[idx] = Math.round(r * srcA + rgba[idx] * (1 - srcA));
  rgba[idx + 1] = Math.round(g * srcA + rgba[idx + 1] * (1 - srcA));
  rgba[idx + 2] = Math.round(b * srcA + rgba[idx + 2] * (1 - srcA));
  rgba[idx + 3] = Math.min(255, rgba[idx + 3] + a);
}

// Draw filled rounded rectangle
function fillRoundRect(x, y, w, h, r, cr, cg, cb) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      // Check corners
      let inside = true;
      if (px < x + r && py < y + r) {
        inside = Math.sqrt((px - x - r) ** 2 + (py - y - r) ** 2) <= r;
      } else if (px > x + w - r && py < y + r) {
        inside = Math.sqrt((px - x - w + r) ** 2 + (py - y - r) ** 2) <= r;
      } else if (px < x + r && py > y + h - r) {
        inside = Math.sqrt((px - x - r) ** 2 + (py - y - h + r) ** 2) <= r;
      } else if (px > x + w - r && py > y + h - r) {
        inside = Math.sqrt((px - x - w + r) ** 2 + (py - y - h + r) ** 2) <= r;
      }
      if (inside) setPixel(px, py, cr, cg, cb);
    }
  }
}

// Draw thick line
function drawLine(x1, y1, x2, y2, thickness, r, g, b, a = 255) {
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const steps = Math.ceil(len * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    for (let dy = -thickness / 2; dy <= thickness / 2; dy++) {
      for (let dx = -thickness / 2; dx <= thickness / 2; dx++) {
        if (dx * dx + dy * dy <= (thickness / 2) ** 2) {
          setPixel(cx + dx, cy + dy, r, g, b, a);
        }
      }
    }
  }
}

// Draw sine wave
function drawWave(cx, cy, width, amplitude, freq, thickness, r, g, b, a = 255) {
  for (let i = -width / 2; i <= width / 2; i += 0.5) {
    const x = cx + i;
    const y = cy + Math.sin(i / width * Math.PI * freq) * amplitude;
    for (let dy = -thickness / 2; dy <= thickness / 2; dy++) {
      for (let dx = -0.5; dx <= 0.5; dx++) {
        if (dx * dx + dy * dy <= (thickness / 2) ** 2) {
          setPixel(x + dx, y + dy, r, g, b, a);
        }
      }
    }
  }
}

// 1. Background - dark navy rounded rect
fillRoundRect(0, 0, SIZE, SIZE, 48, 15, 23, 42);

// 2. Sound waves (top half) - teal gradient
drawWave(128, 75, 120, 25, 4, 5, 56, 189, 156, 255);   // Main wave
drawWave(128, 50, 100, 15, 4, 3, 56, 189, 156, 150);    // Upper wave
drawWave(128, 100, 100, 15, 4, 3, 59, 130, 246, 150);    // Lower wave

// 3. Keyboard outline (bottom half) - dim gray
const kbX = 48, kbY = 148, kbW = 160, kbH = 72;
// Keyboard border
for (let i = 0; i < 3; i++) {
  drawLine(kbX + 10, kbY + i, kbX + kbW - 10, kbY + i, 1, 74, 85, 104, 100);
  drawLine(kbX + 10, kbY + kbH - i, kbX + kbW - 10, kbY + kbH - i, 1, 74, 85, 104, 100);
  drawLine(kbX + i, kbY + 10, kbX + i, kbY + kbH - 10, 1, 74, 85, 104, 100);
  drawLine(kbX + kbW - i, kbY + 10, kbX + kbW - i, kbY + kbH - 10, 1, 74, 85, 104, 100);
}

// Keyboard keys - small rectangles
for (let row = 0; row < 3; row++) {
  const ky = 158 + row * 18;
  const keys = row === 2 ? 1 : 6;
  const kw = row === 2 ? 96 : 18;
  const startX = row === 2 ? 80 : 58 + (row === 1 ? 6 : 0);
  for (let k = 0; k < keys; k++) {
    const kx = startX + k * 22;
    fillRoundRect(kx, ky, kw, 12, 2, 74, 85, 104);
    // Make them semi-transparent by reducing alpha
    for (let py = ky; py < ky + 12; py++) {
      for (let px = kx; px < kx + kw; px++) {
        const idx = (py * SIZE + px) * 4;
        rgba[idx + 3] = Math.min(rgba[idx + 3], 90);
      }
    }
  }
}

// 4. Strike-through line (red, diagonal across keyboard)
drawLine(38, 228, 218, 142, 6, 248, 113, 113, 220);

// 5. Bolt/volt symbol (small, top right area)
const boltPoints = [
  [140, 28], [128, 52], [138, 52], [126, 76]
];
// Simple bolt - draw as lines
drawLine(140, 28, 128, 52, 4, 56, 189, 156, 230);
drawLine(128, 52, 140, 52, 3, 56, 189, 156, 230);
drawLine(140, 52, 126, 76, 4, 56, 189, 156, 230);

// Save
const pngBuffer = createPNG(SIZE, SIZE, rgba);
const outPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(outPath, pngBuffer);
console.log(`Icon saved to ${outPath} (${SIZE}x${SIZE})`);
