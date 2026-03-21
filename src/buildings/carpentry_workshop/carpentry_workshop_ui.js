import { CarpentryWorkshopBuilding } from './carpentry_workshop.js';
import { drawSpriteInRect } from '../../ui/sprite_renderer.js';

export function getCarpentryWorkshopDefinition() {
  return CarpentryWorkshopBuilding.definition;
}

export function drawCarpentryWorkshopTile(deps, workshopOrX, tileYOrOptions, maybeOptions) {
  const { ctx, TILE, fontForTile } = deps;
  const isPlaced = typeof workshopOrX === 'object' && workshopOrX !== null;
  const tx = isPlaced ? workshopOrX.x : workshopOrX;
  const ty = isPlaced ? workshopOrX.y : tileYOrOptions;
  const options = isPlaced ? (tileYOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const footprint = (isPlaced ? workshopOrX.footprint : options.footprint) || { w: 2, h: 2 };
  const fw = Math.max(1, Number(footprint.w || 1));
  const fh = Math.max(1, Number(footprint.h || 1));
  const x = tx * TILE;
  const y = ty * TILE;
  const wPx = fw * TILE;
  const hPx = fh * TILE;

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(150, 112, 62, 0.2)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(246, 216, 171, 0.95)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  const palette = isPlaced && workshopOrX.palette
    ? workshopOrX.palette
    : { frame: '#594132', fill: '#7c5c43', stroke: '#2f2219', text: '#f4dfbf' };

  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, wPx, hPx);
  const inset = Math.max(1, Math.floor(TILE * 0.1));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.08));
  ctx.strokeRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.lineWidth = 1;

  if (isPlaced && workshopOrX.sprite) {
    const spritePad = Math.max(1, Math.floor(TILE * 0.06));
    const spriteDrawn = drawSpriteInRect(
      ctx,
      workshopOrX.sprite,
      x + spritePad,
      y + spritePad,
      wPx - spritePad * 2,
      hPx - spritePad * 2
    );
    if (spriteDrawn) return;
  }

  const beamW = Math.max(2, Math.floor(TILE * 0.14));
  ctx.fillStyle = '#8e6a4d';
  ctx.fillRect(x + inset * 2, y + inset * 2, beamW, hPx - inset * 4);
  ctx.fillRect(x + wPx - inset * 2 - beamW, y + inset * 2, beamW, hPx - inset * 4);
  ctx.fillRect(x + inset * 2, y + inset * 2, wPx - inset * 4, beamW);

  ctx.strokeStyle = 'rgba(59, 34, 20, 0.9)';
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.06));
  ctx.beginPath();
  ctx.moveTo(x + wPx * 0.22, y + hPx * 0.72);
  ctx.lineTo(x + wPx * 0.5, y + hPx * 0.34);
  ctx.lineTo(x + wPx * 0.78, y + hPx * 0.72);
  ctx.stroke();

  ctx.fillStyle = '#d8c8a2';
  ctx.fillRect(x + wPx * 0.26, y + hPx * 0.66, wPx * 0.48, hPx * 0.08);
  ctx.fillStyle = '#cda15f';
  ctx.fillRect(x + wPx * 0.33, y + hPx * 0.43, wPx * 0.34, hPx * 0.08);

  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.62);
  ctx.fillText('SHOP', x + wPx * 0.19, y + hPx * 0.9);
}

export function drawPlacedCarpentryWorkshops(deps, minTileX, maxTileX, minTileY, maxTileY) {
  const {
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  } = deps;

  for (const building of game.buildings) {
    if (building.kind !== 'carpentryWorkshop') continue;
    const fw = building.footprint?.w || 1;
    const fh = building.footprint?.h || 1;
    const right = building.x + fw - 1;
    const bottom = building.y + fh - 1;
    if (right < minTileX || building.x > maxTileX || bottom < minTileY || building.y > maxTileY) continue;

    drawCarpentryWorkshopTile({ ctx, TILE, fontForTile }, building);
    drawConstructionOverlay(building);

    if (hoveredBuilding === building && selectedBuilding !== building) {
      const line = Math.max(1, TILE * 0.08);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = 'rgba(223, 244, 253, 0.9)';
      ctx.lineWidth = line;
      ctx.strokeRect(building.x * TILE + line * 0.5, building.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }

    if (selectedBuilding === building) {
      const line = Math.max(1.5, TILE * 0.11);
      const w = fw * TILE;
      const h = fh * TILE;
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = line;
      ctx.strokeRect(building.x * TILE + line * 0.5, building.y * TILE + line * 0.5, w - line, h - line);
      ctx.lineWidth = 1;
    }
  }
}