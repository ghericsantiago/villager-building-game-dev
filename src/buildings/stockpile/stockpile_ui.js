import { StockpileBuilding } from './stockpile.js';
import { drawSpriteInRect } from '../../ui/sprite_renderer.js';

export function getStockpileDefinition() {
  return StockpileBuilding.definition;
}

export function drawStockpileTile(deps, stockpileOrX, tileYOrOptions, maybeOptions) {
  const { ctx, TILE, fontForTile } = deps;
  const isPlacedStockpile = typeof stockpileOrX === 'object' && stockpileOrX !== null;
  const tx = isPlacedStockpile ? stockpileOrX.x : stockpileOrX;
  const ty = isPlacedStockpile ? stockpileOrX.y : tileYOrOptions;
  const options = isPlacedStockpile ? (tileYOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const footprint = (isPlacedStockpile ? stockpileOrX.footprint : options.footprint) || { w: 1, h: 1 };
  const fw = Math.max(1, Number(footprint.w || 1));
  const fh = Math.max(1, Number(footprint.h || 1));
  const x = tx * TILE;
  const y = ty * TILE;
  const wPx = fw * TILE;
  const hPx = fh * TILE;

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(84, 181, 165, 0.18)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(150, 247, 225, 0.9)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  const palette = isPlacedStockpile && stockpileOrX.palette
    ? stockpileOrX.palette
    : { frame: '#6d4d30', fill: '#8c6642', stroke: '#4a311f', text: '#f0dfbf' };
  const mapSymbol = isPlacedStockpile && stockpileOrX.mapSymbol ? stockpileOrX.mapSymbol : 'P';

  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, wPx, hPx);
  const inset = Math.max(1, Math.floor(TILE * 0.12));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.07));
  ctx.strokeRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.lineWidth = 1;

  if (isPlacedStockpile && stockpileOrX.sprite) {
    const spritePad = Math.max(1, Math.floor(TILE * 0.1));
    const spriteDrawn = drawSpriteInRect(
      ctx,
      stockpileOrX.sprite,
      x + spritePad,
      y + spritePad,
      wPx - spritePad * 2,
      hPx - spritePad * 2
    );
    if (spriteDrawn) return;
  }

  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.7);
  ctx.fillText(mapSymbol, x + wPx * 0.42, y + hPx * 0.64);
}

export function drawPlacedStockpiles(deps, minTileX, maxTileX, minTileY, maxTileY) {
  const {
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  } = deps;

  for (const s of game.stockpiles) {
    const fw = s.footprint?.w || 1;
    const fh = s.footprint?.h || 1;
    const right = s.x + fw - 1;
    const bottom = s.y + fh - 1;
    if (right < minTileX || s.x > maxTileX || bottom < minTileY || s.y > maxTileY) continue;
    drawStockpileTile({ ctx, TILE, fontForTile }, s);
    drawConstructionOverlay(s);
    if (hoveredBuilding === s && selectedBuilding !== s) {
      const line = Math.max(1, TILE * 0.08);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = 'rgba(223, 244, 253, 0.9)';
      ctx.lineWidth = line;
      ctx.strokeRect(s.x * TILE + line * 0.5, s.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
    if (selectedBuilding === s) {
      const line = Math.max(1.5, TILE * 0.11);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = line;
      ctx.strokeRect(s.x * TILE + line * 0.5, s.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
  }
}
