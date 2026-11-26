// Images are made smaller in the browser before they are uploaded, so they take less space on the server
// (and upload faster on a phone). installUploadCompression() does it for every FormData upload in the app,
// whichever page sends it: at most MAX_SIDE px on the long side, saved as JPEG.
// PDFs and other files, GIFs, small images, and images the browser cannot read (e.g. HEIC) go as they are.
// A transparent PNG becomes WebP (keeps the transparency) where the browser can write WebP, else stays PNG.

const MAX_SIDE = 2000;                // px, long side: still sharp for a full-page document scan
const QUALITY = 0.82;
const MIN_BYTES = 200 * 1024;         // smaller images are left alone
const COMPRESSIBLE = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'];

const toBlob = (canvas, type) => new Promise(resolve => canvas.toBlob(resolve, type, QUALITY));

function hasTransparency(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return { image: await createImageBitmap(file, { imageOrientation: 'from-image' }), url: '' }; } catch { /* use <img> */ }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  return { image, url };
}

// A smaller copy of an image File, or the same File when it cannot be made smaller
export async function compressImageFile(file) {
  if (typeof File === 'undefined' || !(file instanceof File)) return file;
  if (!COMPRESSIBLE.includes(file.type) || file.size < MIN_BYTES) return file;
  let decoded = null;
  try {
    decoded = await decodeImage(file);
    const { image } = decoded;
    const w0 = image.naturalWidth || image.width;
    const h0 = image.naturalHeight || image.height;
    if (!w0 || !h0) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, w, h);

    let type = 'image/jpeg';
    let ext = 'jpg';
    if (file.type !== 'image/jpeg' && file.type !== 'image/jpg' && hasTransparency(ctx, w, h)) {
      type = 'image/webp';
      ext = 'webp';
    }
    const blob = await toBlob(canvas, type);
    // no WebP writer (older Safari gives PNG back), or not smaller: keep the original
    if (!blob || blob.type !== type || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.${ext}`, { type, lastModified: file.lastModified });
  } catch {
    return file;   // anything unexpected: upload the original
  } finally {
    if (decoded?.image?.close) decoded.image.close();
    if (decoded?.url) URL.revokeObjectURL(decoded.url);
  }
}

// The same form with its images made smaller (field order and names kept); the same object if nothing changed
export async function compressFormData(form) {
  const entries = [...form.entries()];
  const out = new FormData();
  let changed = false;
  for (const [key, value] of entries) {
    if (typeof File !== 'undefined' && value instanceof File) {
      const small = await compressImageFile(value);
      if (small !== value) changed = true;
      out.append(key, small, small.name);
    } else {
      out.append(key, value);
    }
  }
  return changed ? out : form;
}

// Every fetch() that sends a FormData body has its images compressed first
let installed = false;
export function installUploadCompression() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (init && typeof FormData !== 'undefined' && init.body instanceof FormData) {
      init = { ...init, body: await compressFormData(init.body) };
    }
    return originalFetch(input, init);
  };
}
