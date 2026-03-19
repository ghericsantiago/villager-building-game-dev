import { StorageBuilding } from './storage.js';

export function getStorageDefinition() {
  return StorageBuilding.definition;
}

export function drawStorageTile(deps, storageOrX, tileYOrOptions, maybeOptions) {
  const { ctx, TILE, fontForTile } = deps;
  const isPlacedStorage = typeof storageOrX === 'object' && storageOrX !== null;
  const tx = isPlacedStorage ? storageOrX.x : storageOrX;
  const ty = isPlacedStorage ? storageOrX.y : tileYOrOptions;
  const options = isPlacedStorage ? (tileYOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const footprint = (isPlacedStorage ? storageOrX.footprint : options.footprint) || { w: 1, h: 1 };
  const fw = Math.max(1, Number(footprint.w || 1));
  const fh = Math.max(1, Number(footprint.h || 1));
  const x = tx * TILE;
  const y = ty * TILE;
  const wPx = fw * TILE;
  const hPx = fh * TILE;

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(109, 145, 183, 0.18)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(184, 217, 255, 0.95)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  const palette = isPlacedStorage && storageOrX.palette
    ? storageOrX.palette
    : { frame: '#4f5663', fill: '#707b8a', stroke: '#2f3642', text: '#edf6ff' };
  const symbol = isPlacedStorage && storageOrX.mapSymbol ? storageOrX.mapSymbol : 'S';
  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, wPx, hPx);
  const inset = Math.max(1, Math.floor(TILE * 0.12));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.08));
  ctx.strokeRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.lineWidth = 1;
  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.95);
  ctx.fillText(symbol, x + wPx * 0.43, y + hPx * 0.66);
}

export function drawPlacedStorages(deps, minTileX, maxTileX, minTileY, maxTileY) {
  const {
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  } = deps;

  for (const s of game.storages) {
    const fw = s.footprint?.w || 1;
    const fh = s.footprint?.h || 1;
    const right = s.x + fw - 1;
    const bottom = s.y + fh - 1;
    if (right < minTileX || s.x > maxTileX || bottom < minTileY || s.y > maxTileY) continue;
    drawStorageTile({ ctx, TILE, fontForTile }, s);
    drawConstructionOverlay(s);
    if (hoveredBuilding === s && selectedBuilding !== s) {
      const line = Math.max(1, TILE * 0.08);
      const w = (s.footprint?.w || 1) * TILE;
      const h = (s.footprint?.h || 1) * TILE;
      ctx.strokeStyle = 'rgba(223, 244, 253, 0.9)';
      ctx.lineWidth = line;
      ctx.strokeRect(s.x * TILE + line * 0.5, s.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
    if (selectedBuilding === s) {
      const line = Math.max(1.5, TILE * 0.11);
      const w = (s.footprint?.w || 1) * TILE;
      const h = (s.footprint?.h || 1) * TILE;
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = line;
      ctx.strokeRect(s.x * TILE + line * 0.5, s.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
  }
}
