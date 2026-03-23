import { MasonryWorkshopBuilding } from './masonry_workshop.js';
import { drawSpriteInRect } from '../../ui/sprite_renderer.js';

export function getMasonryWorkshopDefinition() {
  return MasonryWorkshopBuilding.definition;
}

export function drawMasonryWorkshopTile(deps, workshopOrX, tileYOrOptions, maybeOptions) {
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
    ctx.fillStyle = valid ? 'rgba(109, 132, 156, 0.2)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(212, 232, 245, 0.95)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  const palette = isPlaced && workshopOrX.palette
    ? workshopOrX.palette
    : { frame: '#505862', fill: '#77828f', stroke: '#293039', text: '#edf6ff' };

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

  const brickH = Math.max(3, Math.floor(TILE * 0.16));
  ctx.fillStyle = '#939fac';
  ctx.fillRect(x + inset * 2, y + hPx * 0.34, wPx - inset * 4, brickH);
  ctx.fillRect(x + inset * 2, y + hPx * 0.52, wPx - inset * 4, brickH);
  ctx.fillRect(x + inset * 2, y + hPx * 0.7, wPx - inset * 4, brickH);
  ctx.strokeStyle = 'rgba(52, 61, 71, 0.95)';
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.05));
  for (const offset of [0.34, 0.52, 0.7]) {
    const rowY = y + hPx * offset;
    ctx.beginPath();
    ctx.moveTo(x + wPx * 0.34, rowY);
    ctx.lineTo(x + wPx * 0.34, rowY + brickH);
    ctx.moveTo(x + wPx * 0.5, rowY);
    ctx.lineTo(x + wPx * 0.5, rowY + brickH);
    ctx.moveTo(x + wPx * 0.66, rowY);
    ctx.lineTo(x + wPx * 0.66, rowY + brickH);
    ctx.stroke();
  }

  ctx.fillStyle = '#c7d3de';
  ctx.fillRect(x + wPx * 0.22, y + hPx * 0.22, wPx * 0.56, hPx * 0.08);
  ctx.fillStyle = '#31c8b6';
  ctx.fillRect(x + wPx * 0.28, y + hPx * 0.18, wPx * 0.1, hPx * 0.07);
  ctx.fillRect(x + wPx * 0.62, y + hPx * 0.18, wPx * 0.1, hPx * 0.07);

  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.58);
  ctx.fillText('MASON', x + wPx * 0.14, y + hPx * 0.9);
}

export function drawPlacedMasonryWorkshops(deps, minTileX, maxTileX, minTileY, maxTileY) {
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
    if (building.kind !== 'masonryWorkshop') continue;
    const fw = building.footprint?.w || 1;
    const fh = building.footprint?.h || 1;
    const right = building.x + fw - 1;
    const bottom = building.y + fh - 1;
    if (right < minTileX || building.x > maxTileX || bottom < minTileY || building.y > maxTileY) continue;

    drawMasonryWorkshopTile({ ctx, TILE, fontForTile }, building);
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