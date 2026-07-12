/*
 * Pixel-Pic
 *
 * NOTE ON FIX: the original main.js did `import { Camera } from '@capacitor/camera'`
 * etc. directly inside a `<script type="module">`. That only works if a bundler
 * (Vite/Webpack/Rollup) resolves those bare package specifiers at build time —
 * this project had no bundler configured (package.json's "build" script just
 * printed "Built"), so the app threw a module-resolution error and never ran.
 *
 * Fix: talk to Capacitor's native bridge via the `window.Capacitor` global that
 * Capacitor injects automatically at runtime (no bundler needed), and fall back
 * to plain Web APIs (<input type=file>, <a download>, navigator.share) when
 * running in a normal browser/PWA. This means the app now works both as a
 * static web preview *and* inside a native Capacitor shell.
 */

const cap = () => window.Capacitor;
const plugin = (name) => cap()?.Plugins?.[name] ?? null;

// Register the offline cache. Harmless no-op inside the native Capacitor
// shell (assets are already bundled there); needed for the installed-PWA /
// plain-browser case so the app keeps working with no connection at all.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

let originalImage = null; // untouched source image, so edits are always non-destructive
let cropShape = 'square';

const fileInput   = document.getElementById('fileInput');
const pickBtn     = document.getElementById('pickBtn');
const resetBtn    = document.getElementById('resetBtn');
const autoBtn     = document.getElementById('autoBtn');
const saveBtn     = document.getElementById('saveBtn');
const shareBtn    = document.getElementById('shareBtn');
const controls    = document.getElementById('controls');
const statusEl    = document.getElementById('status');
const canvas      = document.getElementById('preview');
const ctx         = canvas.getContext('2d');

const shapeButtons = document.querySelectorAll('.shape-btn');
const brightnessSlider = document.getElementById('brightness');
const contrastSlider   = document.getElementById('contrast');
const saturationSlider = document.getElementById('saturation');
const sharpenSlider    = document.getElementById('sharpen');

const CANVAS_SIZE = 512; // output resolution for the profile pic

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function loadImageFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    resetSliders();
    controls.hidden = false;
    resetBtn.disabled = false;
    render();
    setStatus('Image loaded — adjust and enhance below.');
  };
  img.onerror = () => setStatus('That file could not be read as an image.', true);
  img.src = dataUrl;
}

function resetSliders() {
  brightnessSlider.value = 100;
  contrastSlider.value = 100;
  saturationSlider.value = 100;
  sharpenSlider.value = 0;
  cropShape = 'square';
  shapeButtons.forEach(b => b.classList.toggle('active', b.dataset.shape === 'square'));
}

/* ---------- Image acquisition ---------- */

pickBtn.onclick = async () => {
  const CameraPlugin = plugin('Camera');
  if (CameraPlugin) {
    // Running inside the native Capacitor shell.
    try {
      const photo = await CameraPlugin.getPhoto({
        quality: 95,
        resultType: 'dataUrl',
        source: 'PHOTOS',
      });
      loadImageFromDataUrl(photo.dataUrl);
    } catch (err) {
      // User cancelling the picker is not an error worth surfacing.
      if (err?.message && !/cancel/i.test(err.message)) {
        setStatus('Could not open the photo picker.', true);
      }
    }
    return;
  }
  // Browser / PWA fallback.
  fileInput.click();
};

fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadImageFromDataUrl(reader.result);
  reader.onerror = () => setStatus('Could not read that file.', true);
  reader.readAsDataURL(file);
  fileInput.value = ''; // allow re-picking the same file later
};

resetBtn.onclick = () => {
  if (!originalImage) return;
  resetSliders();
  render();
  setStatus('Reset to original.');
};

/* ---------- Crop shape ---------- */

shapeButtons.forEach(btn => {
  btn.onclick = () => {
    cropShape = btn.dataset.shape;
    shapeButtons.forEach(b => b.classList.toggle('active', b === btn));
    render();
  };
});

/* ---------- Enhancement controls ---------- */

[brightnessSlider, contrastSlider, saturationSlider, sharpenSlider].forEach(el => {
  el.addEventListener('input', () => render());
});

autoBtn.onclick = () => {
  if (!originalImage) return;
  const suggestion = computeAutoEnhance(originalImage);
  brightnessSlider.value = suggestion.brightness;
  contrastSlider.value = suggestion.contrast;
  saturationSlider.value = suggestion.saturation;
  sharpenSlider.value = suggestion.sharpen;
  render();
  setStatus('Auto-enhanced based on this photo\u2019s histogram.');
};

// Real auto-levels: stretches the luminance histogram of a downsampled copy of
// the image to figure out how far brightness/contrast should be pushed, rather
// than just applying a fixed "boost" blindly.
function computeAutoEnhance(img) {
  const sample = document.createElement('canvas');
  const sSize = 100;
  sample.width = sSize;
  sample.height = sSize;
  const sctx = sample.getContext('2d');
  sctx.drawImage(img, 0, 0, sSize, sSize);
  const data = sctx.getImageData(0, 0, sSize, sSize).data;

  let min = 255, max = 0, sum = 0, satSum = 0;
  const n = sSize * sSize;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    min = Math.min(min, lum);
    max = Math.max(max, lum);
    sum += lum;
    const cmax = Math.max(r, g, b), cmin = Math.min(r, g, b);
    satSum += cmax === 0 ? 0 : (cmax - cmin) / cmax;
  }
  const avgLum = sum / n;
  const avgSat = satSum / n;
  const range = Math.max(max - min, 1);

  // Narrow tonal range -> boost contrast to fill it out.
  const contrast = clamp(100 + (255 - range) / 3, 100, 145);
  // Dark photo -> brighten; bright photo -> pull back slightly.
  const brightness = clamp(100 + (128 - avgLum) / 4, 85, 130);
  // Washed-out colors -> add saturation.
  const saturation = clamp(100 + (0.5 - avgSat) * 100, 100, 150);

  return { brightness: Math.round(brightness), contrast: Math.round(contrast), saturation: Math.round(saturation), sharpen: 35 };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ---------- Rendering pipeline ---------- */

function render() {
  if (!originalImage) return;

  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  const img = originalImage;
  const s = Math.min(img.width, img.height);
  const sx = (img.width - s) / 2;
  const sy = (img.height - s) / 2;

  ctx.save();
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  if (cropShape === 'circle') {
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }

  ctx.filter = `brightness(${brightnessSlider.value}%) contrast(${contrastSlider.value}%) saturate(${saturationSlider.value}%)`;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.filter = 'none';
  ctx.restore();

  const sharpenAmount = Number(sharpenSlider.value);
  if (sharpenAmount > 0) {
    applySharpen(ctx, CANVAS_SIZE, CANVAS_SIZE, sharpenAmount / 100);
  }

  saveBtn.disabled = false;
  shareBtn.disabled = false;
}

// 3x3 unsharp-mask convolution. `amount` (0-1) blends between the original
// pixels and the sharpened result so the effect stays subtle at low values.
function applySharpen(context, w, h, amount) {
  const src = context.getImageData(0, 0, w, h);
  const dst = context.createImageData(w, h);
  const s = src.data, d = dst.data;
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = s[i + 3];
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let acc = 0, k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
            acc += s[idx] * kernel[k++];
          }
        }
        const sharpened = clamp(acc, 0, 255);
        d[i + c] = s[i + c] * (1 - amount) + sharpened * amount;
      }
      d[i + 3] = s[i + 3];
    }
  }
  context.putImageData(dst, 0, 0);
}

/* ---------- Save / Share ---------- */

saveBtn.onclick = async () => {
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const FilesystemPlugin = plugin('Filesystem');
  const fileName = `pixel-pic-${Date.now()}.png`;

  if (FilesystemPlugin) {
    try {
      const base64 = dataUrl.split(',')[1];
      await FilesystemPlugin.writeFile({ path: fileName, data: base64, directory: 'DOCUMENTS' });
      setStatus('Saved to Documents!');
    } catch (err) {
      setStatus('Save failed: ' + (err?.message || 'unknown error'), true);
    }
    return;
  }

  // Browser fallback: trigger a normal download.
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    setStatus('Downloaded ' + fileName);
  } catch (err) {
    setStatus('Save failed: ' + (err?.message || 'unknown error'), true);
  }
};

shareBtn.onclick = async () => {
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const SharePlugin = plugin('Share');

  if (SharePlugin) {
    try {
      await SharePlugin.share({ title: 'Pixel-Pic', text: 'My new profile pic!', url: dataUrl });
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) setStatus('Share failed.', true);
    }
    return;
  }

  // Browser fallback: Web Share API with a real file if supported, else copy/download.
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'pixel-pic.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'Pixel-Pic', text: 'My new profile pic!', files: [file] });
    } else {
      setStatus('Sharing isn\u2019t supported in this browser — use Save instead.', true);
    }
  } catch (err) {
    if (err?.name !== 'AbortError') setStatus('Share failed.', true);
  }
};
