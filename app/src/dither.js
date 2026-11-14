// Invisible dithering against banding in dark gradients and blurred glass.
// A random texture with one texel per physical pixel is blended over the window in overlay mode: around
// mid-grey it changes each pixel by about one 8-bit step, which breaks visible bands without reading as
// grain. Regenerated when the pixel ratio changes, so it never gets scaled into visible noise.
const SIZE = 128;

// Pure: grey levels centred on 128 with a triangular distribution of ±amplitude.
export function ditherLevels(count, amplitude = 12, random = Math.random) {
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) out[i] = Math.round(128 + (random() - random()) * amplitude);
  return out;
}

function texture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(SIZE, SIZE);
  const levels = ditherLevels(SIZE * SIZE);
  for (let i = 0; i < levels.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = levels[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function installDither(root = document.documentElement) {
  let query = null;
  const apply = () => {
    const ratio = window.devicePixelRatio || 1;
    const url = texture();
    if (!url) return;
    root.style.setProperty('--dither-image', `url(${url})`);
    root.style.setProperty('--dither-size', `${SIZE / ratio}px`);
    query?.removeEventListener('change', apply);
    query = window.matchMedia?.(`(resolution: ${ratio}dppx)`) || null;
    query?.addEventListener('change', apply);
  };
  apply();
  return () => query?.removeEventListener('change', apply);
}
