import { resourceTypes, TILE } from '../../util.js';
import { PositionedObject } from '../../core/PositionedObject.js';
import {
  createNpcJobSkills,
  getJobSkillSnapshot as describeJobSkill,
  listJobSkillSnapshots,
  normalizeJobSkillKey
} from '../job_skills.js';

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
    this.jobSkills = createNpcJobSkills(options.jobSkills, {
      miningSkillLevel: options.miningSkillLevel
    });
    this.miningSkillLevel = this.getJobSkillLevel('miner');

    this.capacity = Number.isFinite(options.capacity) ? options.capacity : 30;
    this.carry = {};
    resourceTypes.forEach(r => {
      this.carry[r.key] = 0;
    });

    this.tasks = [];
    this.state = 'idle';
    this.target = null;
    this.currentTask = null;
    this.thoughtText = '';
    this.thoughtUntil = 0;
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

  ensureJobSkillRecord(jobKey) {
    const key = normalizeJobSkillKey(jobKey);
    if (!key) return null;
    if (!this.jobSkills || typeof this.jobSkills !== 'object') this.jobSkills = {};
    if (!this.jobSkills[key] || typeof this.jobSkills[key] !== 'object') {
      this.jobSkills[key] = { xp: 0 };
    }
    this.jobSkills[key].xp = Math.max(0, Number(this.jobSkills[key].xp) || 0);
    return { key, record: this.jobSkills[key] };
  }

  getJobSkillSnapshot(jobKey) {
    return describeJobSkill(this.jobSkills, jobKey);
  }

  getAllJobSkillSnapshots() {
    return listJobSkillSnapshots(this.jobSkills);
  }

  getJobSkillLevel(jobKey) {
    return this.getJobSkillSnapshot(jobKey).level;
  }

  addJobSkillXp(jobKey, amount = 0) {
    const entry = this.ensureJobSkillRecord(jobKey);
    if (!entry) return null;
    const gain = Math.max(0, Number(amount) || 0);
    if (gain > 0) entry.record.xp += gain;
    this.miningSkillLevel = this.getJobSkillLevel('miner');
    return this.getJobSkillSnapshot(entry.key);
  }

  setThought(text, durationMs = 2600) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this.thoughtText = String(text || '').trim();
    this.thoughtUntil = this.thoughtText ? (now + Math.max(300, Number(durationMs) || 0)) : 0;
  }

  clearThought() {
    this.thoughtText = '';
    this.thoughtUntil = 0;
  }

  getThoughtText() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!this.thoughtText || now >= this.thoughtUntil) {
      this.clearThought();
      return '';
    }
    return this.thoughtText;
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
    if (task.kind === 'gatherTile') {
      const tile = task.target;
      if (!tile) return null;
      if (Number(tile.amount || 0) <= 0) return null;
      if (Array.isArray(game?.resources) && !game.resources.includes(tile)) return null;
      return tile;
    }
    if (task.kind === 'gatherType') return game.findNearestResourceOfType(this, task.target);
    if (task.kind === 'buildBuilding') {
      const b = task.target;
      if (!b || b.isConstructed) return null;
      if (Array.isArray(game?.buildings) && !game.buildings.includes(b)) return null;
      return b;
    }
    if (task.kind === 'deposit') {
      if (task.target && game.isDepositTarget(task.target)) return task.target;
      return game.findNearestDepositTarget(this, this.carry);
    }
    if (task.kind === 'move') {
      if (!task.target || !Number.isFinite(task.target.x) || !Number.isFinite(task.target.y)) return null;
      return { x: task.target.x, y: task.target.y };
    }
    return null;
  }

  popNextTask(game) {
    while (this.tasks.length > 0) {
      const next = this.tasks.shift();
      const target = this.resolveTaskTarget(next, game);
      if (!target) continue;
      this.currentTask = next;
      this.target = target;
      return true;
    }

    this.currentTask = null;
    this.target = null;
    return false;
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
