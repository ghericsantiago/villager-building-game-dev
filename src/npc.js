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
      if (t.kind === 'gather') this.target = t.target;
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
        for (const k in this.carry) { if (this.carry[k] > 0) { game.storage[k] += this.carry[k]; this.carry[k] = 0; } }
        if (this.currentTask && this.currentTask.kind === 'gatherType') {
          const next = game.findNearestResourceOfType(this, this.currentTask.target);
          if (next) { this.target = next; this.state = 'moving'; }
          else { this.currentTask = null; this.target = null; this.state = 'idle'; }
        } else { this.currentTask = null; this.target = null; this.state = 'idle'; }
        return;
      }
      // if the task was a plain move, finish it on arrival
      if (this.currentTask && this.currentTask.kind === 'move') {
        this.currentTask = null; this.target = null; this.state = 'idle'; return;
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
