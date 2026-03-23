const spriteCache = new Map();

function normalizeSprite(sprite) {
  if (!sprite) return null;
  if (typeof sprite === 'string') {
    return { src: sprite, sx: null, sy: null, sw: null, sh: null };
  }
  if (typeof sprite === 'object') {
    const src = String(sprite.src || '').trim();
    if (!src) return null;
    return {
      src,
      sx: Number.isFinite(sprite.sx) ? Number(sprite.sx) : null,
      sy: Number.isFinite(sprite.sy) ? Number(sprite.sy) : null,
      sw: Number.isFinite(sprite.sw) ? Number(sprite.sw) : null,
      sh: Number.isFinite(sprite.sh) ? Number(sprite.sh) : null
    };
  }
  return null;
}

function getSpriteEntry(spriteSrc) {
  const key = String(spriteSrc || '').trim();
  if (!key) return null;
  let entry = spriteCache.get(key);
  if (!entry) {
    const img = new Image();
    entry = { image: img, loaded: false, failed: false };
    img.onload = () => {
      entry.loaded = true;
      entry.failed = false;
    };
    img.onerror = () => {
      entry.loaded = false;
      entry.failed = true;
    };
    img.src = key;
    spriteCache.set(key, entry);
  }
  return entry;
}

export function drawSpriteInRect(ctx, spriteSrc, x, y, width, height) {
  const sprite = normalizeSprite(spriteSrc);
  if (!sprite) return false;
  const entry = getSpriteEntry(sprite.src);
  if (!entry || !entry.loaded || entry.failed) return false;
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const hasCrop = Number.isFinite(sprite.sx) && Number.isFinite(sprite.sy) && Number.isFinite(sprite.sw) && Number.isFinite(sprite.sh);
  if (hasCrop) {
    ctx.drawImage(entry.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, x, y, width, height);
    ctx.imageSmoothingEnabled = prevSmoothing;
    return true;
  }
  ctx.drawImage(entry.image, x, y, width, height);
  ctx.imageSmoothingEnabled = prevSmoothing;
  return true;
}
