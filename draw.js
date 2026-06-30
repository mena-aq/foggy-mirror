/**
 * draw.js — Handles finger drawing on the condensation layer.
 *
 * Uses a persistent canvas. Lines are drawn with a wide, soft eraser-style
 * composite mode so they "wipe" through the fog revealing the camera below.
 * We keep an internal path and smooth it with a Catmull-Rom spline to avoid
 * jitter from imprecise hand tracking.
 */

let ctx;
const LINE_WIDTH   = 28;    // px — generous to forgive tracking jitter
const SMOOTH_STEPS = 8;     // sub-steps between tracked points for smoothing

// Track previous point for stroke continuation
let prevX = null, prevY = null;
let pointBuffer = [];        // recent points for smoothing

export function initDraw(context) {
  ctx = context;
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
}

/**
 * Called each frame when a finger is detected.
 * isNew = true when the finger just appeared (pen-up → pen-down).
 */
export function drawAtPoint(x, y, isNew) {
  if (isNew || prevX === null) {
    // Start a fresh stroke
    pointBuffer = [{ x, y }];
    prevX = x;
    prevY = y;
    return;
  }

  pointBuffer.push({ x, y });
  if (pointBuffer.length > 4) pointBuffer.shift(); // rolling window

  // Smooth using a simple Catmull-Rom approximation over last 3-4 points
  const pts = pointBuffer;
  if (pts.length >= 3) {
    const p0 = pts[pts.length - 3];
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    // Quadratic bezier through p0→p1→p2, mid-point as control
    const cpX = p1.x;
    const cpY = p1.y;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = LINE_WIDTH;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(cpX, cpY, p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  } else {
    // Fallback: straight line for the first couple of points
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth   = LINE_WIDTH;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.restore();
  }

  prevX = x;
  prevY = y;
}

/**
 * Clear all drawings.
 */
export function clearDraw() {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  prevX = null;
  prevY = null;
  pointBuffer = [];
}

/**
 * Signal that the finger is lifted (so next point starts a new stroke).
 */
export function liftFinger() {
  prevX = null;
  prevY = null;
  pointBuffer = [];
}
