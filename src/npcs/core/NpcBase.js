import { resourceTypes, TILE } from '../../util.js';
import { PositionedObject } from '../../core/PositionedObject.js';

export class NpcBase extends PositionedObject {
  constructor(id, x, y, options = {}) {
    super(x, y, {
      id,
      name: options.name || `NPC ${id}`,
      type: options.type || 'npc',
      icon: options.icon || '',
      sprite: options.sprite || '',
      spriteScale: options.spriteScale
    });
    this.faction = options.faction || 'neutral';
    this.age = Number.isFinite(options.age) ? Math.max(16, Math.floor(options.age)) : (18 + (id % 17));
    this.attributes = {
      strength: Math.max(1, Number(options.attributes?.strength ?? 5)),
      agility: Math.max(1, Number(options.attributes?.agility ?? 5)),
      intelligence: Math.max(1, Number(options.attributes?.intelligence ?? 5))
    };

    // Keep gameplay speed stable across zoom by expressing speed in tiles/sec.
    this.speedTilesPerSec = Number.isFinite(options.speedTilesPerSec)
      ? options.speedTilesPerSec
      : 2.6;

    this.baseGatherUnitsPerSec = Number.isFinite(options.baseGatherUnitsPerSec)
      ? options.baseGatherUnitsPerSec
      : 5;
    this.gatherSkillMultiplier = Number.isFinite(options.gatherSkillMultiplier)
      ? options.gatherSkillMultiplier
      : 1;

    this.baseBuildUnitsPerSec = Number.isFinite(options.baseBuildUnitsPerSec)
      ? options.baseBuildUnitsPerSec
      : 5;
    this.buildSkillMultiplier = Number.isFinite(options.buildSkillMultiplier)
      ? options.buildSkillMultiplier
      : 1;

    this.gatherProgress = 0;
    this.buildProgress = 0;

    this.capacity = Number.isFinite(options.capacity) ? options.capacity : 30;
    this.carry = {};
    resourceTypes.forEach(r => {
      this.carry[r.key] = 0;
    });

    this.tasks = [];
    this.state = 'idle';
    this.target = null;
    this.currentTask = null;
    this.tools = { ...(options.tools || {}) };
    this.weapons = Array.isArray(options.weapons) ? [...options.weapons] : [];
    this.armors = Array.isArray(options.armors) ? [...options.armors] : [];
  }

  enqueue(task) {
    this.tasks.push(task);
  }

  totalCarry() {
    return Object.values(this.carry).reduce((a, b) => a + b, 0);
  }

  addCarryItem(key, amount) {
    const add = Math.max(0, Number(amount) || 0);
    if (!key || add <= 0) return;
    this.carry[key] = (this.carry[key] || 0) + add;
  }

  gatherRateFor(resource) {
    const difficulty = Math.max(0.1, Number(resource?.gatherDifficulty ?? 1));
    const npcGatherSpeed = Math.max(0, Number(this.baseGatherUnitsPerSec || 0)) * Math.max(0, Number(this.gatherSkillMultiplier || 0));
    return npcGatherSpeed / difficulty;
  }

  buildRateFor(building) {
    const difficulty = Math.max(0.1, Number(building?.buildDifficulty ?? 1));
    const npcBuildSpeed = Math.max(0, Number(this.baseBuildUnitsPerSec || 0)) * Math.max(0, Number(this.buildSkillMultiplier || 0));
    return npcBuildSpeed / difficulty;
  }

  resolveTaskTarget(task, game) {
    if (!task) return null;
    if (task.kind === 'gatherTile') return task.target;
    if (task.kind === 'gatherType') return game.findNearestResourceOfType(this, task.target);
    if (task.kind === 'buildBuilding') return task.target;
    if (task.kind === 'deposit') return task.target || game.findNearestDepositTarget(this, this.carry);
    if (task.kind === 'move') return { x: task.target.x, y: task.target.y };
    return null;
  }

  popNextTask(game) {
    if (this.tasks.length <= 0) return false;
    const next = this.tasks.shift();
    this.currentTask = next;
    this.target = this.resolveTaskTarget(next, game);
    return true;
  }

  moveToCurrentTarget(dt) {
    if (!this.target) return false;

    const fw = this.target?.footprint?.w || 1;
    const fh = this.target?.footprint?.h || 1;
    const tx = (this.target.x + fw / 2) * TILE;
    const ty = (this.target.y + fh / 2) * TILE;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const movePx = this.speedTilesPerSec * TILE * dt;

    if (dist > movePx) {
      this.x += (dx / dist) * movePx;
      this.y += (dy / dist) * movePx;
      this.state = 'moving';
      return false;
    }

    // Snap to target when close enough so arrival logic is deterministic.
    this.x = tx;
    this.y = ty;
    return true;
  }
}
