import { RESOURCE_DEFINITIONS } from './resources/index.js';

export const BASE_TILE = 32;
export let ZOOM = 1;
export let TILE = BASE_TILE * ZOOM;
export const COLS = 200;
export const ROWS = 200;

export const resourceTypes = RESOURCE_DEFINITIONS.map(d => ({ key: d.key, color: d.color }));

export function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1))}

// extended zoom levels (include very small values so zooming out can show full map)
export const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function setZoom(scale){
  const clamped = Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length-1], scale));
  ZOOM = clamped;
  // allow TILE to shrink low so many tiles fit on screen; minimum 2px per tile
  TILE = Math.max(2, Math.round(BASE_TILE * ZOOM));
}

export function zoomIn(){
  const idx = ZOOM_LEVELS.indexOf(ZOOM);
  const next = idx < ZOOM_LEVELS.length-1 ? ZOOM_LEVELS[idx+1] : ZOOM_LEVELS[idx];
  setZoom(next);
}

export function zoomOut(){
  const idx = ZOOM_LEVELS.indexOf(ZOOM);
  const next = idx > 0 ? ZOOM_LEVELS[idx-1] : ZOOM_LEVELS[idx];
  setZoom(next);
}
