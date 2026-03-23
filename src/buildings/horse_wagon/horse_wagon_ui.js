import { HorseWagonBuilding } from './horse_wagon.js';
import { drawSpriteInRect } from '../../ui/sprite_renderer.js';

export function getHorseWagonDefinition() {
  return HorseWagonBuilding.definition;
}

export function drawHorseWagonTile(deps, wagonOrX, tileYOrOptions, maybeOptions) {
  const { ctx, TILE, fontForTile } = deps;
  const isPlaced = typeof wagonOrX === 'object' && wagonOrX !== null;
  const tx = isPlaced ? wagonOrX.x : wagonOrX;
  const ty = isPlaced ? wagonOrX.y : tileYOrOptions;
  const options = isPlaced ? (tileYOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const footprint = (isPlaced ? wagonOrX.footprint : options.footprint) || { w: 1, h: 1 };
  const fw = Math.max(1, Number(footprint.w || 1));
  const fh = Math.max(1, Number(footprint.h || 1));
  const x = tx * TILE;
  const y = ty * TILE;
  const wPx = fw * TILE;
  const hPx = fh * TILE;

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(164, 135, 95, 0.2)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(236, 208, 164, 0.95)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  const palette = isPlaced && wagonOrX.palette
    ? wagonOrX.palette
    : { frame: '#5b4635', fill: '#725944', stroke: '#35271d', text: '#ead7be' };
  const symbol = isPlaced && wagonOrX.mapSymbol ? wagonOrX.mapSymbol : 'W';

  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, wPx, hPx);
  const inset = Math.max(1, Math.floor(TILE * 0.12));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.08));
  ctx.strokeRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.lineWidth = 1;

  if (isPlaced && wagonOrX.sprite) {
    const spritePad = Math.max(1, Math.floor(TILE * 0.1));
    const spriteDrawn = drawSpriteInRect(
      ctx,
      wagonOrX.sprite,
      x + spritePad,
      y + spritePad,
      wPx - spritePad * 2,
      hPx - spritePad * 2
    );
    if (spriteDrawn) return;
  }

  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.75);
  ctx.fillText(symbol, x + wPx * 0.38, y + hPx * 0.56);
}

export function drawPlacedHorseWagons(deps, minTileX, maxTileX, minTileY, maxTileY) {
  const {
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  } = deps;

  for (const wagon of game.storages) {
    if (wagon.kind !== 'horseWagon') continue;
    const fw = wagon.footprint?.w || 1;
    const fh = wagon.footprint?.h || 1;
    const right = wagon.x + fw - 1;
    const bottom = wagon.y + fh - 1;
    if (right < minTileX || wagon.x > maxTileX || bottom < minTileY || wagon.y > maxTileY) continue;

    drawHorseWagonTile({ ctx, TILE, fontForTile }, wagon);
    drawConstructionOverlay(wagon);

    if (hoveredBuilding === wagon && selectedBuilding !== wagon) {
      const line = Math.max(1, TILE * 0.08);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = 'rgba(223, 244, 253, 0.9)';
      ctx.lineWidth = line;
      ctx.strokeRect(wagon.x * TILE + line * 0.5, wagon.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }

    if (selectedBuilding === wagon) {
      const line = Math.max(1.5, TILE * 0.11);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = line;
      ctx.strokeRect(wagon.x * TILE + line * 0.5, wagon.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
  }
}
