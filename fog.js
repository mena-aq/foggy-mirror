/**
 * fog.js — Manages the condensation/fog layer.
 *
 * Strategy:
 *  • An offscreen ImageData accumulates fog "density" per-pixel (0-255).
 *  • addFogBlob() stamps a radial gradient of density around a point.
 *  • clearFogStroke() removes density along a fingertip path like scratching.
 *  • Each tick we render the density map as a semi-opaque white/blue-grey layer
 *    with a subtle noise texture to mimic real condensation.
 *  • clearFogSwipe() rapidly decays the whole fog map (swipe gesture).
 */

let ctx;
let W, H;
let densityMap;         // Float32Array – per-pixel density 0..1
let noiseCanvas, noiseCtx;
let erasePrevPrevX = null;
let erasePrevPrevY = null;
let erasePrevX = null;
let erasePrevY = null;

// Fog appearance
const FOG_COLOR  = [220, 228, 238];   // cool blue-white
const MAX_ALPHA  = 0.91;              // near-opaque max
const DECAY      = 0.0008;            // slow natural dissipation per tick
const SWIPE_DECAY = 0.06;             // fast decay on swipe

let isSwiping = false;

export function initFog(context) {
  ctx = context;
  resizeFog();
  window.addEventListener('resize', resizeFog);
  buildNoiseTexture();
}

function resizeFog() {
  W = ctx.canvas.width;
  H = ctx.canvas.height;
  densityMap = new Float32Array(W * H); // all zero initially
}

// Pre-build a static noise canvas for texture overlay
function buildNoiseTexture() {
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 256;
  noiseCanvas.height = 256;
  noiseCtx = noiseCanvas.getContext('2d');
  const id = noiseCtx.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.random() * 80;
    id.data[i]   = v;
    id.data[i+1] = v;
    id.data[i+2] = v + 15;
    id.data[i+3] = Math.random() * 60 + 10;
  }
  noiseCtx.putImageData(id, 0, 0);
}

/**
 * Stamp fog density around (px, py) with a given radius.
 * The blob is filled at a mostly uniform opacity, with an irregular outline.
 */
export function addFogBlob(px, py, radius = 400, strength = 0.13) {
  // Only write within bounds; iterate bounding box
  const r = Math.round(radius);
  const x0 = Math.max(0,   Math.round(px) - r);
  const x1 = Math.min(W-1, Math.round(px) + r);
  const y0 = Math.max(0,   Math.round(py) - r);
  const y1 = Math.min(H-1, Math.round(py) + r);

  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - px, dy = y - py;
      const d2 = dx*dx + dy*dy;
      const localRadius = radius * (0.78 + 0.28 * blobNoise(x, y, px, py));
      if (d2 > localRadius * localRadius) continue;
      const idx = y * W + x;
      densityMap[idx] = Math.min(1, densityMap[idx] + strength);
    }
  }
}

function blobNoise(x, y, px, py) {
  const seed = x * 12.9898 + y * 78.233 + px * 0.013 + py * 0.017;
  const value = Math.sin(seed) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Clear fog along a fingertip path.
 * The stroke is thin and hard-edged so it reads as a sharp scratch.
 */
export function clearFogStroke(px, py, isNew = false, radius = 15) {
  if (isNew || erasePrevX === null || erasePrevY === null) {
    eraseCircle(px, py, radius);
    erasePrevPrevX = null;
    erasePrevPrevY = null;
    erasePrevX = px;
    erasePrevY = py;
    return;
  }

  if (erasePrevPrevX === null || erasePrevPrevY === null) {
    eraseLine(erasePrevX, erasePrevY, px, py, radius);
    erasePrevPrevX = erasePrevX;
    erasePrevPrevY = erasePrevY;
    erasePrevX = px;
    erasePrevY = py;
    return;
  }

  const startX = (erasePrevPrevX + erasePrevX) * 0.5;
  const startY = (erasePrevPrevY + erasePrevY) * 0.5;
  const endX = (erasePrevX + px) * 0.5;
  const endY = (erasePrevY + py) * 0.5;
  const curveDistance = Math.hypot(endX - startX, endY - startY);
  const steps = Math.max(12, Math.ceil(curveDistance / 0.8));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const curveX = inv * inv * startX + 2 * inv * t * erasePrevX + t * t * endX;
    const curveY = inv * inv * startY + 2 * inv * t * erasePrevY + t * t * endY;
    eraseCircle(curveX, curveY, radius);
  }

  erasePrevPrevX = erasePrevX;
  erasePrevPrevY = erasePrevY;
  erasePrevX = px;
  erasePrevY = py;
}

function eraseLine(x0, y0, x1, y1, radius) {
  const distance = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(8, Math.ceil(distance / 0.8));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    eraseCircle(
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t,
      radius
    );
  }
}

function eraseCircle(px, py, radius) {
  const r = Math.round(radius);
  const x0 = Math.max(0,   Math.round(px) - r);
  const x1 = Math.min(W-1, Math.round(px) + r);
  const y0 = Math.max(0,   Math.round(py) - r);
  const y1 = Math.min(H-1, Math.round(py) + r);
  const r2 = radius * radius;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - px, dy = y - py;
      if ((dx * dx + dy * dy) <= r2) {
        densityMap[y * W + x] = 0;
      }
    }
  }
}

/**
 * Signal a swipe-clear event. The decay loop handles the rest.
 */
export function clearFogSwipe() {
  isSwiping = true;
  erasePrevPrevX = null;
  erasePrevPrevY = null;
  erasePrevX = null;
  erasePrevY = null;
  setTimeout(() => { isSwiping = false; }, 800);
}

/**
 * Immediately remove all fog density.
 */
export function clearFogAll() {
  densityMap.fill(0);
  erasePrevPrevX = null;
  erasePrevPrevY = null;
  erasePrevX = null;
  erasePrevY = null;
  isSwiping = false;
  if (ctx) renderFog();
}

/**
 * Called every frame from main render loop.
 */
export function tickFog() {
  // Sync canvas dimensions if resized
  if (ctx.canvas.width !== W || ctx.canvas.height !== H) resizeFog();

  const decay = isSwiping ? SWIPE_DECAY : DECAY;

  // Decay all density
  for (let i = 0; i < densityMap.length; i++) {
    if (densityMap[i] > 0) {
      densityMap[i] = Math.max(0, densityMap[i] - decay);
    }
  }

  renderFog();
}

function renderFog() {
  ctx.clearRect(0, 0, W, H);

  // Build ImageData from density
  const imageData = ctx.createImageData(W, H);
  const data = imageData.data;
  const [r, g, b] = FOG_COLOR;

  for (let i = 0; i < densityMap.length; i++) {
    const d = densityMap[i];
    if (d < 0.005) continue;
    const alpha = Math.pow(d, 0.6) * MAX_ALPHA; // gamma curve for softer edges
    const base = i * 4;
    data[base]   = r;
    data[base+1] = g;
    data[base+2] = b;
    data[base+3] = Math.round(alpha * 255);
  }

  ctx.putImageData(imageData, 0, 0);

  // Overlay noise texture where there is fog (pattern repeat)
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.18;
  const pat = ctx.createPattern(noiseCanvas, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
