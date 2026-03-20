import { PositionedObject } from './core/PositionedObject.js';

export class Building extends PositionedObject {
  constructor(kind, x, y, props = {}) {
    super(x, y, {
      kind,
      name: props.name || kind,
      icon: props.icon || '',
      sprite: props.sprite || '',
      spriteScale: props.spriteScale
    });
    this.mapSymbol = props.mapSymbol || '';
    this.blocksMovement = props.blocksMovement ?? false;
    this.owner = String(props.owner || 'neutral').trim().toLowerCase();
    this.destroyRefund = { ...(props.destroyRefund || {}) };
    this.acceptedItemKeys = null;
    this.maxCount = props.maxCount ?? Infinity;
    this.requiresBuildings = Array.isArray(props.requiresBuildings) ? [...props.requiresBuildings] : [];
    this.cost = { ...(props.cost || {}) };
    this.buildDifficulty = Math.max(0.1, Number(props.buildDifficulty ?? 1));

    const fw = Math.max(1, Number(props.footprint?.w || 1));
    const fh = Math.max(1, Number(props.footprint?.h || 1));
    this.footprint = { w: fw, h: fh };
    this.tileConsumption = fw * fh;

    this.buildWorkRequired = Math.max(1, Math.round(100 * this.buildDifficulty));
    const startConstructed = props.startConstructed ?? false;
    this.buildWorkDone = startConstructed ? this.buildWorkRequired : 0;

    if (Object.prototype.hasOwnProperty.call(props, 'acceptedItemKeys')) {
      this.setAcceptedItems(props.acceptedItemKeys);
    }
  }

  get buildCompletion() {
    return Math.max(0, Math.min(1, this.buildWorkDone / this.buildWorkRequired));
  }

  get isConstructed() {
    return this.buildWorkDone >= this.buildWorkRequired;
  }

  addBuildWork(units) {
    if (!Number.isFinite(units) || units <= 0) return this.buildCompletion;
    this.buildWorkDone = Math.min(this.buildWorkRequired, this.buildWorkDone + units);
    return this.buildCompletion;
  }

  occupiesTile(tileX, tileY) {
    return (
      tileX >= this.x &&
      tileX < this.x + this.footprint.w &&
      tileY >= this.y &&
      tileY < this.y + this.footprint.h
    );
  }

  occupiedTiles() {
    const tiles = [];
    for (let oy = 0; oy < this.footprint.h; oy += 1) {
      for (let ox = 0; ox < this.footprint.w; ox += 1) {
        tiles.push({ x: this.x + ox, y: this.y + oy });
      }
    }
    return tiles;
  }

  getDestroyRefund() {
    if (this.owner !== 'player') return {};
    return { ...this.destroyRefund };
  }

  setAcceptedItems(itemKeys) {
    if (!Array.isArray(itemKeys)) {
      this.acceptedItemKeys = null;
      return;
    }

    const normalized = [];
    const seen = new Set();
    for (const key of itemKeys) {
      const next = String(key || '').trim();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      normalized.push(next);
    }
    this.acceptedItemKeys = normalized;
  }

  acceptsItem(itemKey) {
    if (!Array.isArray(this.acceptedItemKeys)) return true;
    return this.acceptedItemKeys.includes(itemKey);
  }
}
