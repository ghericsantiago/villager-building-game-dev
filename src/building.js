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
    this.rejectItemKeys = null;
    this.itemLimitByKey = null;
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
    // How many items per second can be stored to this building. Higher is faster.
    this.storageSpeed = Number(props.storageSpeed ?? 1);

    if (Object.prototype.hasOwnProperty.call(props, 'acceptedItemKeys')) {
      this.setAcceptedItems(props.acceptedItemKeys);
    }
    if (Object.prototype.hasOwnProperty.call(props, 'rejectItemKeys')) {
      this.setRejectedItems(props.rejectItemKeys);
    }
    if (Object.prototype.hasOwnProperty.call(props, 'itemLimitByKey')) {
      this.setItemLimits(props.itemLimitByKey);
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
    // If the building is not yet fully constructed, refund the full cost.
    // Otherwise return the configured destroyRefund (partial refund for completed buildings).
    if (!this.isConstructed) return { ...this.cost };
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

  setRejectedItems(itemKeys) {
    if (!Array.isArray(itemKeys)) {
      this.rejectItemKeys = null;
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
    this.rejectItemKeys = normalized;
  }

  setItemLimits(nextLimits) {
    if (!nextLimits || typeof nextLimits !== 'object' || Array.isArray(nextLimits)) {
      this.itemLimitByKey = null;
      return;
    }

    const normalized = {};
    for (const [rawKey, rawValue] of Object.entries(nextLimits)) {
      const itemKey = String(rawKey || '').trim();
      if (!itemKey) continue;
      const limit = Number(rawValue);
      if (!Number.isFinite(limit) || limit < 0) continue;
      normalized[itemKey] = Math.floor(limit);
    }
    this.itemLimitByKey = Object.keys(normalized).length > 0 ? normalized : null;
  }

  setItemLimit(itemKey, limit) {
    const normalizedKey = String(itemKey || '').trim();
    if (!normalizedKey) return;

    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed < 0) {
      if (this.itemLimitByKey && Object.prototype.hasOwnProperty.call(this.itemLimitByKey, normalizedKey)) {
        delete this.itemLimitByKey[normalizedKey];
        if (Object.keys(this.itemLimitByKey).length <= 0) this.itemLimitByKey = null;
      }
      return;
    }

    if (!this.itemLimitByKey) this.itemLimitByKey = {};
    this.itemLimitByKey[normalizedKey] = Math.floor(parsed);
  }

  getItemLimit(itemKey) {
    const normalizedKey = String(itemKey || '').trim();
    if (!normalizedKey || !this.itemLimitByKey) return null;
    if (!Object.prototype.hasOwnProperty.call(this.itemLimitByKey, normalizedKey)) return null;
    const limit = Number(this.itemLimitByKey[normalizedKey]);
    return Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : null;
  }

  acceptsItem(itemKey) {
    if (Array.isArray(this.rejectItemKeys) && this.rejectItemKeys.includes(itemKey)) return false;
    if (!Array.isArray(this.acceptedItemKeys)) return true;
    return this.acceptedItemKeys.includes(itemKey);
  }
}
