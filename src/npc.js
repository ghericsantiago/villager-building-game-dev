import { resourceTypes, TILE } from './util.js';

export class NPC{
  constructor(id,x,y){
    this.id=id;this.x=x;this.y=y;this.speed=1.4;this.capacity=30;this.carry={};
    resourceTypes.forEach(r=>this.carry[r.key]=0);
    this.tasks=[];this.state='idle';this.target=null;this.currentTask=null;
  }
  enqueue(task){this.tasks.push(task)}
  totalCarry(){return Object.values(this.carry).reduce((a,b)=>a+b,0)}
  update(dt, game){
    if (!this.currentTask && this.tasks.length > 0) {
      const t = this.tasks.shift();
      this.currentTask = t;
        if (t.kind === 'gatherTile') this.target = t.target;
      else if (t.kind === 'gatherType') this.target = game.findNearestResourceOfType(this, t.target);
      else if (t.kind === 'deposit') this.target = t.target;
      else if (t.kind === 'move') this.target = { x: t.target.x, y: t.target.y };
    }

    if (this.target) {
      const tx = this.target.x * TILE + TILE / 2;
      const ty = this.target.y * TILE + TILE / 2;
      const dx = tx - this.x, dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;
        this.state = 'moving';
        return;
      }

      if (this.target === game.storageTile) {
        // deposit everything
        for (const k in this.carry) { if (this.carry[k] > 0) { game.storage[k] += this.carry[k]; this.carry[k] = 0; } }

        // if there are queued tasks, run them first
        if (this.tasks && this.tasks.length > 0) {
          const t = this.tasks.shift();
          this.currentTask = t;
          if (t.kind === 'gatherTile') this.target = t.target;
          else if (t.kind === 'gatherType') this.target = game.findNearestResourceOfType(this, t.target);
          else if (t.kind === 'deposit') this.target = t.target;
          else if (t.kind === 'move') this.target = { x: t.target.x, y: t.target.y };
          return;
        }

        // if we were working on a specific tile, return to it if it still has resources
        if (this.currentTask && this.currentTask.kind === 'gatherTile') {
          const tile = this.currentTask.target;
          if (tile.amount > 0) { this.target = tile; this.state = 'moving'; return; }
          // tile exhausted: look for nearest same-type resource
          const next = game.findNearestResourceOfType(this, tile.type);
          if (next) { this.currentTask = { kind: 'gatherType', target: tile.type }; this.target = next; this.state = 'moving'; return; }
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
            const take = Math.min(1, this.capacity - this.totalCarry(), tile.amount);
            tile.amount -= take;
            this.carry[tile.type] += take;
            this.state = 'gathering';
            return;
          } else {
            // either full or tile finished
            if (this.totalCarry() >= this.capacity) {
              // if there are queued tasks, do them first; otherwise deposit
              if (this.tasks && this.tasks.length > 0) { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
              this.target = game.storageTile; this.state = 'toStorage'; return;
            }
            // if tile exhausted
            if (tile.amount <= 0) {
              // if there are queued tasks, perform them first (do not deposit yet)
              if (this.tasks && this.tasks.length > 0) { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
              // no queued tasks: if carrying anything, deposit first
              if (this.totalCarry() > 0) { this.target = game.storageTile; this.state = 'toStorage'; return; }
              // nothing carried: go to nearest same-type resource
              const next = game.findNearestResourceOfType(this, tile.type);
              if (next) { this.currentTask = { kind: 'gatherType', target: tile.type }; this.target = next; this.state = 'moving'; return; }
              // no same-type resources left
              this.currentTask = null; this.target = null; this.state = 'idle'; return;
            }
            // fallback: clear task
            this.currentTask = null; this.target = null; this.state = 'idle'; return;
          }
        }

      else {
        if (this.target.amount > 0 && this.totalCarry() < this.capacity) {
          const take = Math.min(1, this.capacity - this.totalCarry(), this.target.amount);
          this.target.amount -= take;
          this.carry[this.target.type] += take;
          this.state = 'gathering';
          return;
        } else {
          if (this.totalCarry() >= this.capacity) { this.target = game.storageTile; this.state = 'toStorage'; return; }
          if (this.currentTask && this.currentTask.kind === 'gatherType') {
            const next = game.findNearestResourceOfType(this, this.currentTask.target);
            if (next) { this.target = next; this.state = 'moving'; return; }
            else {
              // no more resources of that type -- if carrying anything, go deposit first
              if (this.totalCarry() > 0) { this.target = game.storageTile; this.state = 'toStorage'; return; }
              this.currentTask = null; this.target = null; this.state = 'idle'; return;
            }
          } else { this.currentTask = null; this.target = null; this.state = 'idle'; return; }
        }
      }
    } else { this.state = 'idle'; }
  }
}
