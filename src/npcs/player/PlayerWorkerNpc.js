import { NpcBase } from '../core/NpcBase.js';
import { NPC_FACTIONS, NPC_TYPES } from '../types.js';
import { randomNpcName, reserveUniqueName } from './nameRegistry.js';
import {
  createToolItem,
  consumeToolDurability,
  getResourceRequiredTools,
  getUsableToolForResource,
  resourceRequiresTool
} from '../../items/tools.js';

export class PlayerWorkerNpc extends NpcBase {
  constructor(id, x, y, name = null) {
    super(id, x, y, {
      name: name ? reserveUniqueName(name) : randomNpcName(),
      type: NPC_TYPES.PLAYER_WORKER,
      faction: NPC_FACTIONS.PLAYER
    });

    this.job = 'none';
    this.tools = {};
  }

  ensureRequiredToolFromStorage(resource, game) {
    const required = getResourceRequiredTools(resource);
    if (required.length <= 0) return true;
    for (const key of required) {
      const existing = this.tools?.[key];
      if (existing && Number(existing.durability || 0) > 0) return true;
    }
    for (const key of required) {
      const taken = game.takeToolsFromStorage(key, 1);
      if (taken > 0) {
        this.tools[key] = createToolItem(key);
        return true;
      }
    }
    return false;
  }

  canGatherResource(resource, game) {
    if (!resourceRequiresTool(resource)) return true;
    this.ensureRequiredToolFromStorage(resource, game);
    return !!getUsableToolForResource(this.tools, resource);
  }

  consumeGatherDurability(resource, gatheredUnits) {
    if (!resourceRequiresTool(resource)) return;
    const tool = getUsableToolForResource(this.tools, resource);
    if (!tool) return;
    consumeToolDurability(tool, resource, gatheredUnits);
    if (Number(tool.durability || 0) <= 0) {
      delete this.tools[tool.key];
    }
  }

  autoAssignJobTarget(game) {
    if (this.currentTask || this.tasks.length > 0 || !this.job || this.job === 'none') return;

    if (this.job === 'builder') {
      const site = game.findNearestUnfinishedBuilding(this);
      if (site) {
        this.currentTask = { kind: 'buildBuilding', target: site };
        this.target = site;
      }
      return;
    }

    const nearest = game.findNearestResourceOfType(this, this.job);
    if (nearest) {
      this.currentTask = { kind: 'gatherType', target: this.job };
      this.target = nearest;
    }
  }

  update(dt, game) {
    this.autoAssignJobTarget(game);

    if (!this.currentTask) this.popNextTask(game);

    if (!this.target) {
      this.state = 'idle';
      return;
    }

    const arrived = this.moveToCurrentTarget(dt);
    if (!arrived) return;

    if (game.isDepositTarget(this.target)) {
      this.handleDepositArrival(game);
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'move') {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'buildBuilding') {
      this.handleBuildAtTarget(dt);
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'gatherTile') {
      this.handleGatherTileTask(dt, game);
      return;
    }

    this.handleGatherTypeTask(dt, game);
  }

  handleDepositArrival(game) {
    // deposit everything into main storage or stockpile storage.
    game.depositCarryToTarget(this.target, this.carry);

    // if there are queued tasks, run them first
    if (this.popNextTask(game)) return;

    // if we were working on a specific tile, return to it if it still has resources
    if (this.currentTask && this.currentTask.kind === 'gatherTile') {
      const tile = this.currentTask.target;
      if (tile.amount > 0) {
        this.target = tile;
        this.state = 'moving';
        return;
      }
      // tile exhausted: stop this gatherTile task (do not retarget to another tile)
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    // if we were on a gatherType, continue searching
    if (this.currentTask && this.currentTask.kind === 'gatherType') {
      const next = game.findNearestResourceOfType(this, this.currentTask.target);
      if (next) {
        this.target = next;
        this.state = 'moving';
        return;
      }
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.currentTask = null;
    this.target = null;
    this.state = 'idle';
  }

  handleBuildAtTarget(dt) {
    const b = this.currentTask.target;
    if (!b || b.isConstructed || this.job !== 'builder') {
      this.buildProgress = 0;
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.buildProgress += this.buildRateFor(b) * dt;
    const unitsReady = Math.floor(this.buildProgress);
    if (unitsReady <= 0) {
      this.state = 'building';
      return;
    }

    b.addBuildWork(unitsReady);
    this.buildProgress = Math.max(0, this.buildProgress - unitsReady);
    this.state = 'building';
    if (b.isConstructed) {
      this.buildProgress = 0;
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
    }
  }

  handleGatherTileTask(dt, game) {
    const tile = this.currentTask.target;
    if (!this.canGatherResource(tile, game)) {
      this.gatherProgress = 0;
      this.state = 'needsTool';
      return;
    }
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
      this.consumeGatherDurability(tile, take);
      this.gatherProgress = Math.max(0, this.gatherProgress - take);
      this.state = 'gathering';
      return;
    }

    this.gatherProgress = 0;
    // either full or tile finished
    if (this.totalCarry() >= this.capacity) {
      // if there are queued tasks, do them first; otherwise deposit
      if (this.tasks && this.tasks.length > 0) {
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
        return;
      }
      this.target = game.findNearestDepositTarget(this);
      this.state = 'toStorage';
      return;
    }

    // if tile exhausted
    if (tile.amount <= 0) {
      // if there are queued tasks, perform them first (do not deposit yet)
      if (this.tasks && this.tasks.length > 0) {
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
        return;
      }
      // no queued tasks: if carrying anything, deposit first
      if (this.totalCarry() > 0) {
        this.target = game.findNearestDepositTarget(this);
        this.state = 'toStorage';
        return;
      }
      // nothing carried: end task (do not retarget to nearest same-type resource)
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.currentTask = null;
    this.target = null;
    this.state = 'idle';
  }

  handleGatherTypeTask(dt, game) {
    if (!this.canGatherResource(this.target, game)) {
      this.gatherProgress = 0;
      this.state = 'needsTool';
      return;
    }
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
      this.consumeGatherDurability(this.target, take);
      this.gatherProgress = Math.max(0, this.gatherProgress - take);
      this.state = 'gathering';
      return;
    }

    this.gatherProgress = 0;
    if (this.totalCarry() >= this.capacity) {
      this.target = game.findNearestDepositTarget(this);
      this.state = 'toStorage';
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'gatherType') {
      const next = game.findNearestResourceOfType(this, this.currentTask.target);
      if (next) {
        this.target = next;
        this.state = 'moving';
        return;
      }

      // no more resources of that type -- if carrying anything, go deposit first
      if (this.totalCarry() > 0) {
        this.target = game.findNearestDepositTarget(this);
        this.state = 'toStorage';
        return;
      }

      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.currentTask = null;
    this.target = null;
    this.state = 'idle';
  }
}

export class NPC extends PlayerWorkerNpc {}
