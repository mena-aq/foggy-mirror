/**
 * tracking.js — MediaPipe Hands + FaceMesh integration.
 *
 * Detects:
 *  1. Mouth open  → fog blob at mouth position
 *  2. Index finger tip → draw on fog (single extended finger heuristic)
 *  3. Frame gesture  → both hands making an L-shape forming a rectangle
 *
 * All coordinates are normalised [0,1]; x is UN-mirrored to match the
 * mirrored video display (we flip x before passing to callbacks).
 */

import { liftFinger } from './draw.js';
import { setFrameCorners, setFingerTipHighlight } from './fx.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const MOUTH_OPEN_THRESHOLD   = 0.02;   // lip distance in normalised coords
const MOUTH_FOG_INTERVAL     = 60;     // ms between fog blobs while mouth open
const FRAME_HOLD_MS          = 700;    // ms holding frame pose before triggering
const FINGER_STABILITY_PX    = 0.008; // normalised – jitter threshold
const THUMB_INDEX_PINCH_DIST = 0.06;  // max distance between thumb and index to detect pinch

let callbacks = {};

// Frame gesture
let frameHoldStart = null;
let frameFired = false;

// Finger state
let fingerDown = false;
let lastFingerX = null, lastFingerY = null;
let lastActiveFinger = null;

// Mouth fog throttle
let lastFogTime = 0;

// ── Init ──────────────────────────────────────────────────────────────────────
export function initTracking(cbs) {
  callbacks = cbs;
  setupCamera();
}

async function setupCamera() {
  const video = document.getElementById('webcam');

  // ── FaceMesh ────────────────────────────────────────────────────────────────
  const faceMesh = new FaceMesh({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(onFaceResults);

  // ── Hands ───────────────────────────────────────────────────────────────────
  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);

  // ── Camera ──────────────────────────────────────────────────────────────────
  const camera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
      await hands.send({ image: video });
    },
    width: 1280,
    height: 720,
  });
  camera.start();

  callbacks.onTrackingState(false);
}

// ── Face results ─────────────────────────────────────────────────────────────
function onFaceResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  callbacks.onTrackingState(true);
  const lm = results.multiFaceLandmarks[0];

  // Mouth open: compare upper lip (13) and lower lip (14) distance
  const upperLip = lm[13];
  const lowerLip = lm[14];
  const mouthDist = Math.hypot(lowerLip.x - upperLip.x, lowerLip.y - upperLip.y);

  if (mouthDist > MOUTH_OPEN_THRESHOLD) {
    const now = Date.now();
    if (now - lastFogTime > MOUTH_FOG_INTERVAL) {
      lastFogTime = now;
      // Mouth centre from the lip landmarks themselves
      const mouthX = 1 - ((upperLip.x + lowerLip.x) / 2);   // mirror flip
      const mouthY = (upperLip.y + lowerLip.y) / 2;
      callbacks.onMouthOpen(mouthX, mouthY);
    }
  }
}

// ── Hand results ─────────────────────────────────────────────────────────────
function onHandResults(results) {
  const multiLandmarks = results.multiHandLandmarks || [];
  const multiHandedness = results.multiHandedness || [];

  // ── 1. No hands: lift finger, clear frame ─────────────────────────────────
  if (multiLandmarks.length === 0) {
    if (fingerDown) { fingerDown = false; liftFinger(); }
    lastActiveFinger = null;
    setFingerTipHighlight(null);
    setFrameCorners(null);
    frameHoldStart = null;
    frameFired = false;
    return;
  }

  // ── 2. Two-hand frame gesture check ──────────────────────────────────────
  if (multiLandmarks.length === 2) {
    const frameResult = checkFrameGesture(multiLandmarks, multiHandedness);
    if (frameResult) {
      setFrameCorners(frameResult);
      const now = Date.now();
      if (!frameHoldStart) frameHoldStart = now;
      if (!frameFired && now - frameHoldStart >= FRAME_HOLD_MS) {
        frameFired = true;
        setFrameCorners(null);
        callbacks.onFrameGesture();
        setTimeout(() => { frameFired = false; frameHoldStart = null; }, 3500);
      }
      // Frame gesture active – skip finger/swipe
      if (fingerDown) { fingerDown = false; liftFinger(); }
      lastActiveFinger = null;
      setFingerTipHighlight(null);
      return;
    } else {
      setFrameCorners(null);
      frameHoldStart = null;
    }
  } else {
    setFrameCorners(null);
    frameHoldStart = null;
    if (multiLandmarks.length < 2) frameFired = false;
  }

  // ── 3. Single-hand gesture processing ────────────────────────────────────
  const lm = multiLandmarks[0];

  // Finger drawing: detect thumb-index pinch for drawing.
  const pinch = getThumbIndexPinch(lm);
  if (pinch) {
    const { pinchX, pinchY } = pinch;

    setFingerTipHighlight({ x: pinchX * window.innerWidth, y: pinchY * window.innerHeight });

    // Stability filter: ignore sub-threshold jitter
    const moved = lastFingerX === null ||
      Math.hypot(pinchX - lastFingerX, pinchY - lastFingerY) > FINGER_STABILITY_PX;

    if (moved) {
      const isNew = !fingerDown;
      fingerDown = true;
      lastFingerX = pinchX;
      lastFingerY = pinchY;
      callbacks.onFingerDraw(pinchX, pinchY, isNew);
    }
  } else {
    setFingerTipHighlight(null);
    if (fingerDown) { fingerDown = false; liftFinger(); }
    lastActiveFinger = null;
  }
}

// ── Gesture helpers ───────────────────────────────────────────────────────────

/**
 * Detect thumb-index pinch gesture.
 * Returns the midpoint between thumb and index tips when they are close together.
 */
function getThumbIndexPinch(lm) {
  const thumbTip = lm[4];   // thumb tip
  const indexTip = lm[8];   // index finger tip

  // Calculate distance between thumb and index tips
  const distance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

  if (distance > THUMB_INDEX_PINCH_DIST) {
    return null;  // fingers not close enough
  }

  // Calculate midpoint between thumb and index as pinch point
  const pinchX = 1 - ((thumbTip.x + indexTip.x) / 2);  // mirror
  const pinchY = (thumbTip.y + indexTip.y) / 2;

  return { pinchX, pinchY };
}

/**
 * Is the palm open (all fingers extended)?
 */
function isPalmOpen(lm) {
  return (
    lm[8].y  < lm[5].y &&   // index
    lm[12].y < lm[9].y &&   // middle
    lm[16].y < lm[13].y &&  // ring
    lm[20].y < lm[17].y     // pinky
  );
}

/**
 * Check if two hands form a rectangular frame (L-shapes in each corner).
 * Heuristic: each hand has thumb + index finger pointing away from each other
 * and the two hands together make four approximate corners.
 *
 * Returns { tl, tr, bl, br } in canvas px coords, or null.
 */
function checkFrameGesture(multiLandmarks, multiHandedness) {
  // Each hand: check that thumb and index are both extended (L-shape / gun shape)
  const hands = multiLandmarks.map((lm, i) => {
    const label = multiHandedness[i]?.label || 'Left'; // 'Left' or 'Right'
    return { lm, label };
  });

  const framed = hands.every(({ lm }) => isLShape(lm));
  if (!framed) return null;

  // Use the thumb tip and index tip to infer corner positions.
  // The "frame" corners are approximated by the bounding box of all tips.
  const tips = hands.flatMap(({ lm }) => [lm[4], lm[8]]);  // thumb + index tips
  const xs = tips.map(p => 1 - p.x);  // mirrored
  const ys = tips.map(p => p.y);

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;

  // Need a reasonably-sized rectangle
  if (spanX < 0.15 || spanY < 0.1) return null;

  const W = window.innerWidth, H = window.innerHeight;
  return {
    tl: { x: minX * W, y: minY * H },
    tr: { x: maxX * W, y: minY * H },
    bl: { x: minX * W, y: maxY * H },
    br: { x: maxX * W, y: maxY * H },
  };
}

/**
 * L-shape (gun pose): thumb and index both extended, middle/ring/pinky curled.
 */
function isLShape(lm) {
  const indexUp  = lm[8].y  < lm[6].y;
  const thumbOut = lm[4].x !== lm[3].x;  // any thumb position is ok
  const middleCurled = lm[12].y > lm[10].y;
  const ringCurled   = lm[16].y > lm[14].y;
  const pinkyCurled  = lm[20].y > lm[18].y;
  return indexUp && middleCurled && ringCurled && pinkyCurled;
}
