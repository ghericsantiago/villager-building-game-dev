import {
  getConstructionObjectDefinition,
  getConstructionObjectDefinitions
} from './construction_object.js';
import { drawSpriteInRect } from '../../ui/sprite_renderer.js';

const CONSTRUCTION_KIND_SET = new Set(getConstructionObjectDefinitions().map((definition) => definition.kind));

export function drawConstructionObjectTile(deps, kindOrBuilding, tileXOrOptions, tileYOrOptions, maybeOptions) {
  const { ctx, TILE, fontForTile } = deps;
  const isPlacedBuilding = typeof kindOrBuilding === 'object' && kindOrBuilding !== null;
  const kind = isPlacedBuilding ? kindOrBuilding.kind : String(kindOrBuilding || '').trim();
  const definition = getConstructionObjectDefinition(kind);
  if (!definition) return;

  const tx = isPlacedBuilding ? kindOrBuilding.x : tileXOrOptions;
  const ty = isPlacedBuilding ? kindOrBuilding.y : tileYOrOptions;
  const options = isPlacedBuilding ? (tileXOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const footprint = (isPlacedBuilding ? kindOrBuilding.footprint : options.footprint) || definition.footprint || { w: 1, h: 1 };
  const fw = Math.max(1, Number(footprint.w || 1));
  const fh = Math.max(1, Number(footprint.h || 1));
  const x = tx * TILE;
  const y = ty * TILE;
  const wPx = fw * TILE;
  const hPx = fh * TILE;
  const palette = (isPlacedBuilding && kindOrBuilding.palette)
    ? kindOrBuilding.palette
    : (definition.palette || { frame: '#55606f', fill: '#7d8a9a', stroke: '#28313b', text: '#eff7ff' });

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(125, 215, 196, 0.18)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, wPx, hPx);
    ctx.strokeStyle = valid ? 'rgba(184, 247, 231, 0.95)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, wPx - 1, hPx - 1);
    ctx.lineWidth = 1;
    return;
  }

  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, wPx, hPx);
  const inset = Math.max(1, Math.floor(TILE * 0.1));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.08));
  ctx.strokeRect(x + inset, y + inset, wPx - inset * 2, hPx - inset * 2);
  ctx.lineWidth = 1;

  const spriteSource = (isPlacedBuilding ? kindOrBuilding.sprite : options.sprite) || definition.sprite;
  if (spriteSource) {
    const spritePad = Math.max(1, Math.floor(TILE * 0.08));
    const spriteDrawn = drawSpriteInRect(ctx, spriteSource, x + spritePad, y + spritePad, wPx - spritePad * 2, hPx - spritePad * 2);
    if (spriteDrawn) return;
  }

  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(Math.max(0.6, 0.95 / Math.max(fw, fh)));
  ctx.fillText(definition.mapSymbol || '?', x + wPx * 0.38, y + hPx * 0.64);
}

export function drawPlacedConstructionObjects(deps, minTileX, maxTileX, minTileY, maxTileY) {
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
    if (!CONSTRUCTION_KIND_SET.has(building.kind)) continue;
    const fw = building.footprint?.w || 1;
    const fh = building.footprint?.h || 1;
    const right = building.x + fw - 1;
    const bottom = building.y + fh - 1;
    if (right < minTileX || building.x > maxTileX || bottom < minTileY || building.y > maxTileY) continue;

    drawConstructionObjectTile({ ctx, TILE, fontForTile }, building);
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