/**
 * fx.js — Visual effects layer: vignette, frame-gesture indicator,
 *          finger-tip highlight, and the frame overlay drawn when the user
 *          makes the photo-frame gesture.
 */

let ctx;
let W, H;

// Frame gesture state
let frameActive = false;   // are we currently detecting a frame?
let frameCorners = null;   // { tl, tr, bl, br } each { x, y } in canvas px

// Finger highlight state
let fingerTip = null;      // { x, y } in canvas px

export function initFX(context) {
  ctx = context;
  resize();
  window.addEventListener('resize', resize);
  //drawStaticVignette();
}

function resize() {
  W = ctx.canvas.width;
  H = ctx.canvas.height;
  drawStaticVignette();
}

function drawStaticVignette() {
  ctx.clearRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.78);
  grad.addColorStop(0,   'rgba(0,0,0,0)');
  grad.addColorStop(1,   'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Update the frame gesture corners so we can draw the viewfinder overlay.
 * Pass null to hide it.
 */
export function setFrameCorners(corners) {
  frameActive  = !!corners;
  frameCorners = corners;
  drawStaticVignette();
  if (fingerTip) drawFingerTipHighlight();
  if (frameActive) drawFrameOverlay();
}

/**
 * Show a fingertip marker so the tracked finger is easy to follow.
 * Pass null to hide it.
 */
export function setFingerTipHighlight(tip) {
  fingerTip = tip;
  drawStaticVignette();
  if (frameActive) drawFrameOverlay();
  if (fingerTip) drawFingerTipHighlight();
}

function drawFrameOverlay() {
  if (!frameCorners) return;
  const { tl, tr, bl, br } = frameCorners;

  const tickLen = 30;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur  = 8;

  function corner(a, b, c) {
    // Draw two ticks from point a, towards b and c
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * tickLen / dist(a,b),
               a.y + (b.y - a.y) * tickLen / dist(a,b));
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(a.x + (c.x - a.x) * tickLen / dist(a,c),
               a.y + (c.y - a.y) * tickLen / dist(a,c));
    ctx.stroke();
  }

  corner(tl, tr, bl);
  corner(tr, tl, br);
  corner(bl, tl, br);
  corner(br, tr, bl);

  ctx.restore();
}

function drawFingerTipHighlight() {
  if (!fingerTip) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const outer = ctx.createRadialGradient(fingerTip.x, fingerTip.y, 2, fingerTip.x, fingerTip.y, 26);
  outer.addColorStop(0, 'rgba(255,255,255,0.95)');
  outer.addColorStop(0.25, 'rgba(120,220,255,0.9)');
  outer.addColorStop(1, 'rgba(120,220,255,0)');

  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(fingerTip.x, fingerTip.y, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(120,220,255,0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(fingerTip.x, fingerTip.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function dist(a, b) {
  return Math.sqrt((b.x-a.x)**2 + (b.y-a.y)**2) || 1;
}
