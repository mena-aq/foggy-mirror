/**
 * main.js — Entry point. Initialises all modules and connects the pipeline.
 */

import { initFog, addFogBlob, clearFogStroke, clearFogAll, tickFog } from './fog.js';
import { initDraw, drawAtPoint, clearDraw } from './draw.js';
import { initFX } from './fx.js';
import { initCapture, triggerCapture } from './capture.js';
import { initTracking } from './tracking.js';

// ── Canvas setup ──────────────────────────────────────────────────────────────
const W = () => window.innerWidth;
const H = () => window.innerHeight;

function resizeAll() {
  for (const id of ['fogCanvas', 'drawCanvas', 'fxCanvas']) {
    const c = document.getElementById(id);
    c.width  = W();
    c.height = H();
  }
}
resizeAll();
window.addEventListener('resize', resizeAll);

// ── Init modules ──────────────────────────────────────────────────────────────
const fogCtx  = document.getElementById('fogCanvas').getContext('2d');
const drawCtx = document.getElementById('drawCanvas').getContext('2d');
const fxCtx   = document.getElementById('fxCanvas').getContext('2d');

initFog(fogCtx);
initDraw(drawCtx);
initFX(fxCtx);
initCapture();

document.getElementById('clearFogButton').addEventListener('click', () => {
  clearFogAll();
});

// ── Event bus from tracking ───────────────────────────────────────────────────
const statusDot = document.getElementById('statusDot');

initTracking({
  onMouthOpen(cx, cy) {
    // cx/cy in [0,1] normalised — convert to canvas px
    addFogBlob(cx * W(), cy * H());
  },
  onFingerDraw(x, y, isNew) {
    clearFogStroke(x * W(), y * H(), isNew);
    drawAtPoint(x * W(), y * H(), isNew);
  },
  onFrameGesture() {
    triggerCapture();
  },
  onTrackingState(active) {
    statusDot.classList.toggle('active', active);
  },
});

// ── Render loop ───────────────────────────────────────────────────────────────
function loop() {
  tickFog();           // evolve fog particles / diffuse
  requestAnimationFrame(loop);
}
loop();
