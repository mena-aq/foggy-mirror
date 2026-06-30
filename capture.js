/**
 * capture.js — Handles the 3-second countdown, flash, and screenshot.
 *
 * The screenshot composites: webcam (mirrored) + fog + drawing layers.
 */

let countdownEl, flashEl, previewWrap, previewImg, previewDownload;
let isCounting = false;

export function initCapture() {
  countdownEl      = document.getElementById('countdown');
  flashEl          = document.getElementById('flashOverlay');
  previewWrap      = document.getElementById('previewWrap');
  previewImg       = document.getElementById('previewImg');
  previewDownload  = document.getElementById('previewDownload');

  document.getElementById('previewClose').addEventListener('click', closePreview);
}

/**
 * Begin a 3-second countdown then take the screenshot.
 * Safe to call even if already counting (debounced).
 */
export function triggerCapture() {
  if (isCounting) return;
  isCounting = true;

  let t = 3;
  showCountdown(t);

  const interval = setInterval(() => {
    t--;
    if (t > 0) {
      showCountdown(t);
    } else {
      clearInterval(interval);
      hideCountdown();
      doFlashAndCapture();
    }
  }, 1000);
}

function showCountdown(n) {
  countdownEl.textContent = n;
  countdownEl.classList.remove('hidden');
  // Restart pulse animation
  countdownEl.style.animation = 'none';
  void countdownEl.offsetWidth;   // reflow
  countdownEl.style.animation = '';
}

function hideCountdown() {
  countdownEl.classList.add('hidden');
}

function doFlashAndCapture() {
  // Flash
  flashEl.classList.remove('hidden');
  flashEl.classList.add('flash');
  setTimeout(() => {
    flashEl.classList.remove('flash');
    setTimeout(() => flashEl.classList.add('hidden'), 300);
  }, 80);

  // Composite screenshot
  const dataURL = compositeScreenshot();
  showPreview(dataURL);
  isCounting = false;
}

function compositeScreenshot() {
  const video  = document.getElementById('webcam');
  const fogC   = document.getElementById('fogCanvas');
  const drawC  = document.getElementById('drawCanvas');

  const W = window.innerWidth;
  const H = window.innerHeight;

  const out = document.createElement('canvas');
  out.width  = W;
  out.height = H;
  const octx = out.getContext('2d');

  // Draw mirrored video
  octx.save();
  octx.translate(W, 0);
  octx.scale(-1, 1);
  octx.drawImage(video, 0, 0, W, H);
  octx.restore();

  // Fog on top
  octx.drawImage(fogC, 0, 0, W, H);

  // Drawing on top
  octx.drawImage(drawC, 0, 0, W, H);

  return out.toDataURL('image/png');
}

function showPreview(dataURL) {
  previewImg.src      = dataURL;
  previewDownload.href = dataURL;
  previewWrap.classList.remove('hidden');
}

function closePreview() {
  previewWrap.classList.add('hidden');
  previewImg.src = '';
}
