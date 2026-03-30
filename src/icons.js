/**
 * Generates tray icons at runtime using the minimal PNG encoder.
 * No external image dependencies needed.
 */
const { nativeImage } = require('electron');
const { createPNG } = require('./png-utils');

const SIZE = 32;

function drawCircle(rgba, cx, cy, r, red, green, blue) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dist = Math.sqrt((x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2);
      const idx = (y * SIZE + x) * 4;
      if (dist <= r - 0.5) {
        rgba[idx] = red; rgba[idx + 1] = green; rgba[idx + 2] = blue; rgba[idx + 3] = 255;
      } else if (dist <= r + 0.5) {
        const alpha = Math.round(Math.max(0, (r + 0.5 - dist)) * 255);
        if (alpha > rgba[idx + 3]) {
          rgba[idx] = red; rgba[idx + 1] = green; rgba[idx + 2] = blue; rgba[idx + 3] = alpha;
        }
      }
    }
  }
}

function drawMicShape(rgba) {
  const cx = SIZE / 2;
  // Mic body (rounded rect approximated as oval)
  for (let y = 7; y <= 18; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const idx = (y * SIZE + Math.round(x)) * 4;
      const distX = Math.abs(x - cx) / 3;
      const ry = y < 10 ? (10 - y) / 3 : y > 15 ? (y - 15) / 3 : 0;
      if (distX <= 1 && ry <= 1) {
        rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; rgba[idx + 3] = 255;
      }
    }
  }
  // Stand arc
  for (let angle = 0; angle <= Math.PI; angle += 0.05) {
    const x = Math.round(cx + Math.cos(angle) * 5);
    const y = Math.round(19 + Math.sin(angle) * 3);
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
      const idx = (y * SIZE + x) * 4;
      rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; rgba[idx + 3] = 200;
    }
  }
  // Stand line
  for (let y = 22; y <= 25; y++) {
    const idx = (y * SIZE + Math.round(cx)) * 4;
    rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; rgba[idx + 3] = 220;
  }
  // Base
  for (let x = Math.round(cx - 3); x <= Math.round(cx + 3); x++) {
    const idx = (25 * SIZE + x) * 4;
    rgba[idx] = 255; rgba[idx + 1] = 255; rgba[idx + 2] = 255; rgba[idx + 3] = 200;
  }
}

function createIdleIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  drawCircle(rgba, SIZE / 2, SIZE / 2, SIZE / 2 - 1, 124, 58, 237); // Purple brand color
  drawMicShape(rgba);
  return nativeImage.createFromBuffer(createPNG(SIZE, SIZE, rgba), { width: SIZE, height: SIZE });
}

function createRecordingIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  drawCircle(rgba, SIZE / 2, SIZE / 2, SIZE / 2 - 1, 220, 50, 50);
  drawMicShape(rgba);
  return nativeImage.createFromBuffer(createPNG(SIZE, SIZE, rgba), { width: SIZE, height: SIZE });
}

function createProcessingIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  drawCircle(rgba, SIZE / 2, SIZE / 2, SIZE / 2 - 1, 50, 130, 220);
  drawMicShape(rgba);
  return nativeImage.createFromBuffer(createPNG(SIZE, SIZE, rgba), { width: SIZE, height: SIZE });
}

module.exports = { createIdleIcon, createRecordingIcon, createProcessingIcon };
