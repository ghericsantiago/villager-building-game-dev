import { resourceTypes, TILE } from './util.js';
import { faker } from 'https://esm.sh/@faker-js/faker@9.7.0';

const usedNpcNames = new Set();
let duplicateNameCounter = 1;

function normalizeName(value){
  return String(value || '').trim();
}

function reserveUniqueName(candidate){
  const base = normalizeName(candidate) || `Worker ${duplicateNameCounter++}`;
  if (!usedNpcNames.has(base)) {
    usedNpcNames.add(base);
    return base;
  }

  let i = 2;
  while (usedNpcNames.has(`${base} ${i}`)) i += 1;
  const unique = `${base} ${i}`;
  usedNpcNames.add(unique);
  return unique;
}

function randomNpcName(){
  // Retry a handful of times for a clean, unsuffixed unique first name.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = normalizeName(faker.person.firstName());
    if (candidate && !usedNpcNames.has(candidate)) {
      usedNpcNames.add(candidate);
      return candidate;
    }
  }

  // Fallback in case random generation repeats existing names.
  return reserveUniqueName(normalizeName(faker.person.firstName()) || 'Worker');
}

export class NPC{
  constructor(id,x,y,name=null){
    // Keep gameplay speed stable across zoom by expressing speed in tiles/sec.
    this.id=id;this.name=name ? reserveUniqueName(name) : randomNpcName();this.x=x;this.y=y;this.speedTilesPerSec=2.6;this.baseGatherUnitsPerSec=5;this.gatherSkillMultiplier=1;this.gatherProgress=0;this.capacity=30;this.carry={};
    resourceTypes.forEach(r=>this.carry[r.key]=0);
    this.tasks=[];this.state='idle';this.target=null;this.currentTask=null;this.job='none';
  }
  enqueue(task){this.tasks.push(task)}
  totalCarry(){return Object.values(this.carry).reduce((a,b)=>a+b,0)}
  gatherRateFor(resource){
    const difficulty = Math.max(0.1, Number(resource?.gatherDifficulty ?? 1));
    const npcGatherSpeed = Math.max(0, Number(this.baseGatherUnitsPerSec || 0)) * Math.max(0, Number(this.gatherSkillMultiplier || 0));
    return npcGatherSpeed / difficulty;
  }
  update(dt, game){
    // Auto-start job gathering when this NPC has no active or queued work.
    if (!this.currentTask && this.tasks.length === 0 && this.job && this.job !== 'none') {
      const nearest = game.findNearestResourceOfType(this, this.job);
      if (nearest) {
        this.currentTask = { kind: 'gatherType', target: this.job };
        this.target = nearest;
      }
    }

    if (!this.currentTask && this.tasks.length > 0) {
      const t = this.tasks.shift();
      this.currentTask = t;
        if (t.kind === 'gatherTile') this.target = t.target;
      else if (t.kind === 'gatherType') this.target = game.findNearestResourceOfType(this, t.target);
      else if (t.kind === 'deposit') this.target = t.target || game.findNearestDepositTarget(this);
      else if (t.kind === 'move') this.target = { x: t.target.x, y: t.target.y };
    }

    if (this.target) {
      const fw = this.target?.footprint?.w || 1;
      const fh = this.target?.footprint?.h || 1;
      const tx = (this.target.x + fw / 2) * TILE;
      const ty = (this.target.y + fh / 2) * TILE;
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      const movePx = this.speedTilesPerSec * TILE * dt;
      if (dist > movePx) {
        this.x += (dx / dist) * movePx;
        this.y += (dy / dist) * movePx;
        this.state = 'moving';
        return;
      }
      // Snap to target when close enough so arrival logic is deterministic.
      this.x = tx;
      this.y = ty;

      if (game.isDepositTarget(this.target)) {
        // deposit everything into main storage or stockpile storage.
        game.depositCarryToTarget(this.target, this.carry);

        // if there are queued tasks, run them first
        if (this.tasks && this.tasks.length > 0) {
          const t = this.tasks.shift();
          this.currentTask = t;
          if (t.kind === 'gatherTile') this.target = t.target;
          else if (t.kind === 'gatherType') this.target = game.findNearestResourceOfType(this, t.target);
          else if (t.kind === 'deposit') this.target = t.target || game.findNearestDepositTarget(this);
          else if (t.kind === 'move') this.target = { x: t.target.x, y: t.target.y };
          return;
        }

        // if we were working on a specific tile, return to it if it still has resources
        if (this.currentTask && this.currentTask.kind === 'gatherTile') {
          const tile = this.currentTask.target;
          if (tile.amount > 0) { this.target = tile; this.state = 'moving'; return; }
          // tile exhausted: stop this gatherTile task (do not retarget to another tile)
          this.currentTask = null; this.target = null; this.state = 'idle'; return;
        }

        // if we were on a gatherType, continue searching
        if (this.currentTask && this.currentTask.kind === 'gatherType') {
          const next = game.findNearestResourceOfType(this, this.currentTask.target);
          if (next) { this.target = next; this.state = 'moving'; return; }
          this.currentTask = null; this.target = null; this.state = 'idle'; return;
        }

        // nothing to do
        this.currentTask = null; this.target = null; this.state = 'idle';
        return;
      }
      // if the task was a plain move, finish it on arrival
      if (this.currentTask && this.currentTask.kind === 'move') {
        this.currentTask = null; this.target = null; this.state = 'idle'; return;
      } 

        // if gathering a specific tile
        if (this.currentTask && this.currentTask.kind === 'gatherTile') {
          const tile = this.currentTask.target;
          if (tile.amount > 0 && this.totalCarry() < this.capacity) {
            this.gatherProgress += this.gatherRateFor(tile) * dt;
            const unitsReady = Math.floor(this.gatherProgress);
            if (unitsReady <= 0) {
              this.state = 'gathering';
              return;
            }
            const take = Math.min(unitsReady, this.capacity - this.totalCarry(), tile.amount);
            tile.amount -= take;
            this.carry[tile.type] += take;
            this.gatherProgress = Math.max(0, this.gatherProgress - take);
            this.state = 'gathering';
            return;
          } else {
            this.gatherProgress = 0;
            // either full or tile finished
            if (this.totalCarry() >= this.capacity) {
              // if there are queued tasks, do them first; otherwise deposit
              if (this.tasks && this.tasks.length > 0) { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
              this.target = game.findNearestDepositTarget(this); this.state = 'toStorage'; return;
            }
            // if tile exhausted
            if (tile.amount <= 0) {
              // if there are queued tasks, perform them first (do not deposit yet)
              if (this.tasks && this.tasks.length > 0) { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
              // no queued tasks: if carrying anything, deposit first
              if (this.totalCarry() > 0) { this.target = game.findNearestDepositTarget(this); this.state = 'toStorage'; return; }
              // nothing carried: end task (do not retarget to nearest same-type resource)
              this.currentTask = null; this.target = null; this.state = 'idle'; return;
            }
            // fallback: clear task
            this.currentTask = null; this.target = null; this.state = 'idle'; return;
          }
        }

      else {
        if (this.target.amount > 0 && this.totalCarry() < this.capacity) {
          this.gatherProgress += this.gatherRateFor(this.target) * dt;
          const unitsReady = Math.floor(this.gatherProgress);
          if (unitsReady <= 0) {
            this.state = 'gathering';
            return;
          }
          const take = Math.min(unitsReady, this.capacity - this.totalCarry(), this.target.amount);
          this.target.amount -= take;
          this.carry[this.target.type] += take;
          this.gatherProgress = Math.max(0, this.gatherProgress - take);
          this.state = 'gathering';
          return;
        } else {
          this.gatherProgress = 0;
          if (this.totalCarry() >= this.capacity) { this.target = game.findNearestDepositTarget(this); this.state = 'toStorage'; return; }
          if (this.currentTask && this.currentTask.kind === 'gatherType') {
            const next = game.findNearestResourceOfType(this, this.currentTask.target);
            if (next) { this.target = next; this.state = 'moving'; return; }
            else {
              // no more resources of that type -- if carrying anything, go deposit first
              if (this.totalCarry() > 0) { this.target = game.findNearestDepositTarget(this); this.state = 'toStorage'; return; }
              this.currentTask = null; this.target = null; this.state = 'idle'; return;
            }
          } else { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
        }
      }
    } else { this.state = 'idle'; }
  }
}
