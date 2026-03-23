import { NpcBase } from '../core/NpcBase.js';
import { NPC_FACTIONS, NPC_TYPES } from '../types.js';
import { randomNpcName, reserveUniqueName } from './nameRegistry.js';
import {
  consumeToolDurability,
  getResourceRequiredTools,
  getUsableToolForResource,
  resourceRequiresTool,
  toolDisplayName
} from '../../items/tools.js';
import { publishGameAlert } from '../../ui/alerts_bus.js';
import { randomNpcSpriteFrame, getVillagerSpriteForJob } from './npc_sprite_picker.js';
import { getJobSkillKeyForResource } from '../job_skills.js';
import { TILE } from '../../util.js';

const LEGACY_MINER_JOB_KEYS = new Set(['stone', 'iron', 'copper', 'silver', 'gold']);

function normalizeGatherJob(jobKey) {
  const key = String(jobKey || '').trim().toLowerCase();
  if (key === 'forager') return 'wildberry';
  return LEGACY_MINER_JOB_KEYS.has(key) ? 'miner' : key;
}

export class PlayerWorkerNpc extends NpcBase {
  constructor(id, x, y, options = {}) {
    // Backward compatibility: older call sites may still pass `name` as a string.
    const normalized = (typeof options === 'string') ? { name: options } : (options || {});
    super(id, x, y, {
      name: normalized.name ? reserveUniqueName(normalized.name) : randomNpcName(),
      type: NPC_TYPES.PLAYER_WORKER,
      faction: NPC_FACTIONS.PLAYER,
      sprite: normalized.sprite || randomNpcSpriteFrame(),
      spriteScale: Number.isFinite(normalized.spriteScale) ? normalized.spriteScale : 1
    });

    this.usesJobSprite = !normalized.sprite;
    this.job = 'none';
    this.tools = {};
    this.nextMissingToolAlertAt = 0;
    this.nextMissingSkillAlertAt = 0;
    this.nextWorkshopSupplyAttemptAt = 0;
    this.nextStorageRetainAttemptAt = 0;
    this.syncJobSprite();
  }

  syncJobSprite() {
    if (!this.usesJobSprite) return;
    const next = getVillagerSpriteForJob(this.job || 'none');
    this.sprite = next;
  }

  notifyMissingTools(resource) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < this.nextMissingToolAlertAt) return;
    this.nextMissingToolAlertAt = now + 5000;

    const required = getResourceRequiredTools(resource);
    const requiredText = required.length > 0
      ? required.map(toolDisplayName).join(', ')
      : 'a required tool';
    const targetName = resource?.name || resource?.type || 'resource';

    publishGameAlert({
      level: 'warning',
      title: 'Tool Required',
      message: `${this.name} needs ${requiredText} to continue gathering ${targetName}.`,
      focusTarget: { worldX: this.x, worldY: this.y, entityType: 'npc', npcId: this.id, selectNpcId: this.id },
      dedupeKey: `villager-needs-tool-${this.id}-${required.join('|')}`,
      dedupeMs: 4200,
      trackIssue: true,
      issueKey: `villager-needs-tool-${this.id}-${required.join('|')}`,
      resolveWhen: () => {
        if (!this.currentTask || !this.target) return true;
        if (this.state !== 'needsTool') return true;
        if (Number(this.target.amount || 0) <= 0) return true;
        return !!getUsableToolForResource(this.tools, this.target);
      }
    });
  }

  notifyInsufficientMiningSkill(resource) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < this.nextMissingSkillAlertAt) return;
    this.nextMissingSkillAlertAt = now + 5000;

    const required = Math.max(0, Number(resource?.requiredMiningSkillLevel || 0));
    const current = Math.max(0, Number(this.getJobSkillLevel('miner') || 0));
    const targetName = (typeof resource?.getDisplayName === 'function') ? resource.getDisplayName() : (resource?.name || resource?.type || 'resource');
    this.setThought(`My level is not high enough for ${targetName}.`, 3200);

    publishGameAlert({
      level: 'warning',
      title: 'Mining Skill Too Low',
      message: `${this.name} needs Mining Skill ${required} to mine ${targetName} (current ${current}). Looking for another resource.`,
      focusTarget: { worldX: this.x, worldY: this.y, entityType: 'npc', npcId: this.id, selectNpcId: this.id },
      dedupeKey: `villager-needs-mining-skill-${this.id}-${required}`,
      dedupeMs: 4200,
      trackIssue: true,
      issueKey: `villager-needs-mining-skill-${this.id}-${required}`,
      resolveWhen: () => {
        if (!this.currentTask || !this.target) return true;
        if (this.state !== 'needsSkill') return true;
        if (Number(this.target.amount || 0) <= 0) return true;
        return Math.max(0, Number(this.getJobSkillLevel('miner') || 0)) >= Math.max(0, Number(this.target.requiredMiningSkillLevel || 0));
      }
    });
  }

  isAtDepositTarget(target, game) {
    if (!target || !game?.isDepositTarget(target)) return false;
    const fw = target?.footprint?.w || 1;
    const fh = target?.footprint?.h || 1;
    const targetX = (target.x + fw / 2) * TILE;
    const targetY = (target.y + fh / 2) * TILE;
    return Math.hypot(this.x - targetX, this.y - targetY) <= 1;
  }

  publishStorageFullAlert(target, game) {
    if (!this.isAtDepositTarget(target, game)) return;
    const fw = target?.footprint?.w || 1;
    const fh = target?.footprint?.h || 1;
    publishGameAlert({
      level: 'warning',
      title: 'Storage Full',
      message: `${this.name} cannot deposit because all valid storage is full or filtered.`,
      focusTarget: {
        worldX: (target.x + fw / 2) * TILE,
        worldY: (target.y + fh / 2) * TILE,
        selectNpcId: this.id
      },
      dedupeKey: `storage-full-${this.id}`,
      trackIssue: true,
      issueKey: `storage-full-${this.id}`,
      resolveWhen: () => this.totalCarry() <= 0 || !!game.findNearestDepositTargetWithSpace(this, this.carry)
    });
  }

  workshopHasPendingWork(building) {
    return !!building?.activeProduction || (Array.isArray(building?.productionQueue) && building.productionQueue.length > 0);
  }

  isWorkshopTask(task) {
    const kind = String(task?.kind || '').trim();
    return kind === 'workBuilding' || kind === 'supplyWorkshop';
  }

  getWorkshopSupplyNeed(building) {
    if (!building) return null;
    const recipe = (typeof building.getNextQueuedRecipe === 'function') ? building.getNextQueuedRecipe() : null;
    const shortfall = (typeof building.getQueuedInputShortfall === 'function')
      ? building.getQueuedInputShortfall()
      : {};
    if (!shortfall || Object.keys(shortfall).length <= 0) return null;
    return { recipe, shortfall };
  }

  getStorageRetainNeed(building, game) {
    if (!building || typeof game?.getStorageRetainShortfall !== 'function') return null;
    const shortfall = game.getStorageRetainShortfall(building);
    if (!shortfall || Object.keys(shortfall).length <= 0) return null;
    return { shortfall };
  }

  hasWorkshopCarryFor(building) {
    if (!building || !this.carry) return false;
    const acceptedItemKeys = Array.isArray(building.acceptedItemKeys) ? building.acceptedItemKeys : [];
    return acceptedItemKeys.some((itemKey) => Math.max(0, Number(this.carry[itemKey] || 0)) > 0);
  }

  depositWorkshopInputs(building, game) {
    if (!building || !this.hasWorkshopCarryFor(building)) return false;
    game.depositCarryToTarget(building, this.carry);
    return true;
  }

  startWorkshopSupplyRun(building, game) {
    const need = this.getWorkshopSupplyNeed(building);
    if (!need) return false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < Number(this.nextWorkshopSupplyAttemptAt || 0)) return false;
    if (!game?.hasAnyStoredCost?.(need.shortfall)) {
      this.nextWorkshopSupplyAttemptAt = now + 1600;
      return false;
    }
    const pickupTarget = game.findNearestStorageSourceTarget(this, need.shortfall);
    if (!pickupTarget) {
      this.nextWorkshopSupplyAttemptAt = now + 1600;
      return false;
    }
    this.target = pickupTarget;
    this.state = 'toStorage';
    return true;
  }

  startStorageRetainRun(building, game) {
    const need = this.getStorageRetainNeed(building, game);
    if (!need) return false;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < Number(this.nextStorageRetainAttemptAt || 0)) return false;
    const pickupTarget = game.findNearestStorageSourceTarget(this, need.shortfall, {
      excludeTargets: [building],
      respectRetain: true,
      anchorTarget: building
    });
    if (!pickupTarget) {
      this.nextStorageRetainAttemptAt = now + 1600;
      return false;
    }
    this.target = pickupTarget;
    this.state = 'toStorage';
    return true;
  }

  handleWorkshopSupplyPickup(game) {
    const supplySource = this.target;
    const building = this.currentTask?.target;
    if (!building) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    const capacityLeft = Math.max(0, this.capacity - this.totalCarry());
    const need = this.getWorkshopSupplyNeed(building);
    let pickedTotal = 0;
    if (need && capacityLeft > 0 && supplySource && game.isDepositTarget(supplySource)) {
      const picked = game.withdrawStoredCostFromTarget(supplySource, need.shortfall, {
        maxUnits: capacityLeft,
        respectRetain: true
      });
      for (const [itemKey, amount] of Object.entries(picked || {})) {
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (qty <= 0) continue;
        this.addCarryItem(itemKey, qty);
        pickedTotal += qty;
      }
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (pickedTotal <= 0) {
      this.nextWorkshopSupplyAttemptAt = now + 1600;
      if (this.currentTask?.kind === 'supplyWorkshop') {
        this.currentTask = null;
      }
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.nextWorkshopSupplyAttemptAt = 0;
    this.target = building;
    this.state = 'moving';
  }

  handleStorageRetainPickup(game) {
    const supplySource = this.target;
    const building = this.currentTask?.target;
    if (!building) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    const capacityLeft = Math.max(0, this.capacity - this.totalCarry());
    const need = this.getStorageRetainNeed(building, game);
    let pickedTotal = 0;
    if (need && capacityLeft > 0 && supplySource && game.isDepositTarget(supplySource)) {
      const picked = game.withdrawStoredCostFromTarget(supplySource, need.shortfall, { maxUnits: capacityLeft });
      for (const [itemKey, amount] of Object.entries(picked || {})) {
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (qty <= 0) continue;
        this.addCarryItem(itemKey, qty);
        pickedTotal += qty;
      }
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (pickedTotal <= 0) {
      this.nextStorageRetainAttemptAt = now + 1600;
      if (this.currentTask?.kind === 'supplyStorageRetain') {
        this.currentTask = null;
      }
      this.target = null;
      this.state = 'idle';
      return;
    }

    this.nextStorageRetainAttemptAt = 0;
    this.target = building;
    this.state = 'moving';
  }

  syncWorkshopTaskTarget(game) {
    if (!this.isWorkshopTask(this.currentTask)) return false;

    const building = this.currentTask?.target;
    if (!building || !building.isConstructed) return false;

    const carryingInputs = this.hasWorkshopCarryFor(building);
    if (carryingInputs) {
      this.target = building;
      return true;
    }

    const supplyNeed = this.getWorkshopSupplyNeed(building);
    if (!supplyNeed) {
      if (this.currentTask?.kind === 'supplyWorkshop') {
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
      } else {
        this.target = building;
      }
      return true;
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now < Number(this.nextWorkshopSupplyAttemptAt || 0)) {
      this.target = null;
      this.state = 'idle';
      return true;
    }

    if (!game?.hasAnyStoredCost?.(supplyNeed.shortfall)) {
      this.nextWorkshopSupplyAttemptAt = now + 1600;
      this.target = null;
      this.state = 'idle';
      return true;
    }

    const pickupTarget = game.findNearestStorageSourceTarget(this, supplyNeed.shortfall);
    if (!pickupTarget) {
      this.nextWorkshopSupplyAttemptAt = now + 1600;
      this.target = null;
      this.state = 'idle';
      return true;
    }

    this.target = pickupTarget;
    this.state = 'toStorage';
    return true;
  }

  hasRequiredMiningSkill(resource) {
    const required = Math.max(0, Number(resource?.requiredMiningSkillLevel || 0));
    const current = Math.max(0, Number(this.getJobSkillLevel('miner') || 0));
    return current >= required;
  }

  retargetAfterInsufficientSkill(resource, game) {
    if (!game || !resource) return false;

    if (this.currentTask?.kind === 'gatherType') {
      const next = game.findNearestResourceOfType(this, this.currentTask.target, {
        excludeResources: [resource]
      });
      if (next) {
        this.target = next;
        this.state = 'moving';
        this.gatherProgress = 0;
        return true;
      }
    }

    const fallbackGatherType = normalizeGatherJob(this.job);
    if (fallbackGatherType && fallbackGatherType !== 'none') {
      const next = game.findNearestResourceOfType(this, fallbackGatherType, {
        excludeResources: [resource]
      });
      if (next) {
        this.currentTask = { kind: 'gatherType', target: fallbackGatherType };
        this.target = next;
        this.state = 'moving';
        this.gatherProgress = 0;
        return true;
      }
    }

    return false;
  }

  gainSkillFromResource(resource, gatheredUnits) {
    const skillKey = getJobSkillKeyForResource(resource);
    if (!skillKey) return;
    const difficulty = Math.max(0.5, Number(resource?.gatherDifficulty ?? 1));
    this.addJobSkillXp(skillKey, Math.max(0, Number(gatheredUnits) || 0) * difficulty * 0.14);
  }

  gainSkillFromBuild(building, builtUnits) {
    const difficulty = Math.max(0.5, Number(building?.buildDifficulty ?? 1));
    this.addJobSkillXp('builder', Math.max(0, Number(builtUnits) || 0) * difficulty * 0.18);
  }

  ensureRequiredToolFromStorage(resource, game) {
    const required = getResourceRequiredTools(resource);
    if (required.length <= 0) return true;
    for (const key of required) {
      const existing = this.tools?.[key];
      if (existing && Number(existing.durability || 0) > 0) return true;
    }
    for (const key of required) {
      const taken = game.takeToolsFromStorage(key);
      if (taken) {
        this.tools[key] = taken;
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

  addGatherYieldToCarry(resource, gatheredUnits) {
    if (resource && typeof resource.rollYield === 'function') {
      const rolled = resource.rollYield(gatheredUnits, Math.random);
      for (const [itemKey, amount] of Object.entries(rolled || {})) {
        const qty = Math.max(0, Math.floor(Number(amount) || 0));
        if (qty > 0) this.addCarryItem(itemKey, qty);
      }
      return;
    }

    const yields = (resource && typeof resource.yieldItems === 'object' && resource.yieldItems)
      ? resource.yieldItems
      : { [resource?.type || 'unknown']: 1 };
    for (const [itemKey, perUnit] of Object.entries(yields)) {
      const amount = Math.floor((Number(perUnit) || 0) * gatheredUnits);
      if (amount > 0) this.addCarryItem(itemKey, amount);
    }
  }

  autoAssignJobTarget(game) {
    // When carrying items, prioritize depositing — do not auto-assign gather work.
    if (this.totalCarry() > 0) return;
    // When blocked by full storage, pause autonomous job assignment.
    // Manual commands (move/build) and explicit job changes still set currentTask directly.
    if (this.state === 'storageFull') return;
    if (this.currentTask || this.tasks.length > 0 || !this.job || this.job === 'none') return;

    if (this.job === 'builder') {
      const site = game.findNearestUnfinishedBuilding(this);
      if (site) {
        this.currentTask = { kind: 'buildBuilding', target: site };
        this.target = site;
      }
      return;
    }

    if (this.job === 'carpenter') {
      const workshop = game.findNearestWorkshopForJob(this, 'carpenter');
      if (workshop) {
        this.currentTask = { kind: 'workBuilding', target: workshop };
        this.target = workshop;
      }
      return;
    }

    if (this.job === 'stonemason') {
      const workshop = game.findNearestWorkshopForJob(this, 'stonemason');
      if (workshop) {
        this.currentTask = { kind: 'workBuilding', target: workshop };
        this.target = workshop;
      }
      return;
    }

    const gatherType = normalizeGatherJob(this.job);
    const nearest = game.findNearestResourceOfType(this, gatherType);
    if (nearest) {
      this.currentTask = { kind: 'gatherType', target: gatherType };
      this.target = nearest;
    }
  }

  update(dt, game) {
    this.syncJobSprite();

    // Recover automatically from storage-full lock as soon as valid storage is available.
    if (this.state === 'storageFull') {
      if (this.currentTask && this.currentTask.kind !== 'deposit') {
        if (!this.target) {
          this.target = this.resolveTaskTarget(this.currentTask, game);
        }
        this.state = 'idle';
      } else if (this.totalCarry() <= 0) {
        this.state = 'idle';
        this.target = null;
      } else {
        const retryTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
        if (retryTarget) {
          this.currentTask = { kind: 'deposit', target: retryTarget };
          this.target = retryTarget;
          this.state = 'toStorage';
        } else {
          this.target = null;
          return;
        }
      }
    }

    const hasActiveTask = !!this.currentTask;
    const hasQueuedTask = this.tasks.length > 0;
    const hasQueuedOrActiveTask = hasActiveTask || hasQueuedTask;
    const isCarryFull = this.totalCarry() >= this.capacity;

    // Before pulling the next queued task, force a deposit run if inventory is full.
    if (!hasActiveTask && hasQueuedTask && isCarryFull) {
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        return;
      }
      this.currentTask = { kind: 'deposit', target: depositTarget };
      this.target = depositTarget;
      this.state = 'toStorage';
    }

    // Pause only when full and blocked by storage, but do not interrupt explicit tasks.
    if (!hasQueuedOrActiveTask && isCarryFull) {
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        return;
      }
      this.currentTask = { kind: 'deposit', target: depositTarget };
      this.target = depositTarget;
      this.state = 'toStorage';
    }

    this.autoAssignJobTarget(game);

    if (!this.currentTask) this.popNextTask(game);

    // Idle workers with carried resources should auto-deposit, even when not full.
    if (!this.currentTask && this.tasks.length <= 0 && this.totalCarry() > 0) {
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        return;
      }
      this.currentTask = { kind: 'deposit', target: depositTarget };
      this.target = depositTarget;
      this.state = 'toStorage';
    }

    if (!this.currentTask && this.tasks.length <= 0 && this.totalCarry() <= 0 && (!this.job || this.job === 'none')) {
      game.enqueueGlobalStorageRetainTasks?.();
      const hasRetainDemand = typeof game?.getGlobalQueueItems === 'function'
        && (game.getGlobalQueueItems() || []).some((task) => task?.kind === 'supplyStorageRetain');
      if (hasRetainDemand) this.state = 'seekingStorageRetain';
      const directRetainTarget = game.findNearestStorageRetainTarget?.(this);
      if (directRetainTarget) {
        this.currentTask = { kind: 'supplyStorageRetain', target: directRetainTarget };
        this.target = this.resolveTaskTarget(this.currentTask, game);
      }
    }

    if (!this.currentTask && this.tasks.length <= 0 && this.totalCarry() <= 0 && (!this.job || this.job === 'none')) {
      const globalTask = game.getNextGlobalTaskForNpc({ kinds: ['supplyStorageRetain'], requesterNpc: this });
      if (globalTask) {
        this.currentTask = globalTask;
        this.target = this.resolveTaskTarget(globalTask, game);
      }
    }

    // Any truly idle worker can volunteer to haul workshop inputs.
    if (!this.currentTask && this.tasks.length <= 0 && this.totalCarry() <= 0) {
      game.enqueueGlobalWorkshopSupplyTasks?.();
      const globalTask = game.getNextGlobalTaskForNpc({ kinds: ['supplyWorkshop'], requesterNpc: this });
      if (globalTask) {
        this.currentTask = globalTask;
        this.target = this.resolveTaskTarget(globalTask, game);
      }
    }

    // Manual idle workers can also help by pulling from the remaining shared global queue.
    if (!this.currentTask && this.tasks.length <= 0 && this.totalCarry() <= 0 && (!this.job || this.job === 'none')) {
      const globalTask = game.getNextGlobalTaskForNpc({ kinds: ['gatherTile'], requesterNpc: this });
      if (globalTask) {
        this.currentTask = globalTask;
        this.target = this.resolveTaskTarget(globalTask, game);
      }
    }

    if (this.currentTask && this.currentTask.kind === 'gatherTile') {
      const tile = this.currentTask.target;

      // Keep gatherTile pinned unless tile is actually exhausted/removed.
      if (!tile || Number(tile.amount || 0) <= 0 || (Array.isArray(game.resources) && !game.resources.includes(tile))) {
        this.currentTask = null;
        this.target = null;
        if (this.totalCarry() >= this.capacity) {
          const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
          if (depositTarget) {
            this.currentTask = { kind: 'deposit', target: depositTarget };
            this.target = depositTarget;
            this.state = 'toStorage';
            return;
          }
        }
        this.popNextTask(game);
      } else {
        // If target is missing for any reason, restore to current gather tile.
        if (!this.target) this.target = tile;
      }
    }

    if (this.currentTask && this.currentTask.kind === 'workBuilding') {
      const workshop = this.currentTask.target;
      const requiredJob = String(workshop?.requiredWorkerJob || '').trim().toLowerCase();
      const workshopStillValid = !!workshop && workshop.isConstructed && this.job === requiredJob;
      if (!workshopStillValid || !this.workshopHasPendingWork(workshop)) {
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
      }
    }

    if (this.currentTask && this.currentTask.kind === 'supplyWorkshop') {
      const workshop = this.currentTask.target;
      const workshopStillNeedsSupply = !!workshop && workshop.isConstructed && !!this.getWorkshopSupplyNeed(workshop);
      if (!workshopStillNeedsSupply && !this.hasWorkshopCarryFor(workshop)) {
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
      }
    }

    if (this.currentTask && this.currentTask.kind === 'supplyStorageRetain') {
      const storage = this.currentTask.target;
      const storageStillNeedsSupply = !!storage && storage.isConstructed && !!this.getStorageRetainNeed(storage, game);
      if (!storageStillNeedsSupply) {
        const retainKeys = Object.keys(storage?.itemRetainByKey || {});
        const carryingRetain = retainKeys.some((itemKey) => Math.max(0, Number(this.carry?.[itemKey] || 0)) > 0);
        if (!carryingRetain) {
          this.currentTask = null;
          this.target = null;
          this.state = 'idle';
        }
      }
    }

    this.syncWorkshopTaskTarget(game);

    // Never continue gathering while full; deposit first for both gatherTile and gatherType tasks.
    if (
      this.totalCarry() >= this.capacity &&
      this.currentTask &&
      (this.currentTask.kind === 'gatherTile' || this.currentTask.kind === 'gatherType') &&
      !game.isDepositTarget(this.target)
    ) {
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        this.target = null;
        return;
      }
      this.target = depositTarget;
      this.state = 'toStorage';
    }

    if (!this.target && this.currentTask) {
      this.target = this.resolveTaskTarget(this.currentTask, game);
    }

    if (!this.target) {
      if (!this.currentTask && this.state === 'seekingStorageRetain') {
        return;
      }
      this.state = 'idle';
      return;
    }

    const arrived = this.moveToCurrentTarget(dt);
    if (!arrived) return;

    if (this.isWorkshopTask(this.currentTask) && this.target && this.target !== this.currentTask.target) {
      this.handleWorkshopSupplyPickup(game);
      return;
    }

    if (this.currentTask?.kind === 'supplyStorageRetain' && this.target && this.target !== this.currentTask.target) {
      this.handleStorageRetainPickup(game);
      return;
    }

    if (game.isDepositTarget(this.target)) {
      this.handleDepositArrival(dt, game);
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

    if (this.currentTask && this.currentTask.kind === 'workBuilding') {
      this.handleWorkAtTarget(dt, game);
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'supplyWorkshop') {
      this.handleSupplyWorkshopTask(game);
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'supplyStorageRetain') {
      this.handleSupplyStorageRetainTask(game);
      return;
    }

    if (this.currentTask && this.currentTask.kind === 'gatherTile') {
      this.handleGatherTileTask(dt, game);
      return;
    }

    this.handleGatherTypeTask(dt, game);
  }

  handleDepositArrival(dt, game) {
    const target = this.target;
    if (!target) return;

    // Determine storage speed (items per second) for this target.
    const speed = Number(target.storageSpeed ?? 1);
    if (!Number.isFinite(speed) || speed <= 0) {
      // Fallback to instant deposit if speed is invalid.
      const depositResult = game.depositCarryToTarget(target, this.carry);
      if (this.totalCarry() > 0 && (depositResult.blockedByCapacity || depositResult.blockedByFilter)) {
        const fallbackTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
        if (fallbackTarget) {
          this.currentTask = { kind: 'deposit', target: fallbackTarget };
          this.target = fallbackTarget;
          this.state = 'toStorage';
          return;
        }
        this.currentTask = null;
        this.target = null;
        this.state = 'storageFull';
        this.publishStorageFullAlert(target, game);
        return;
      }
      // continue as before
    }

    // Accumulate deposit progress (items deposited per second)
    this._depositProgress = (this._depositProgress || 0) + speed * dt;
    let unitsToDeposit = Math.floor(this._depositProgress);
    if (unitsToDeposit <= 0) {
      this.state = 'depositing';
      return;
    }

    // Build a partial carry containing up to unitsToDeposit items (across types)
    const partial = {};
    let unitsRemaining = unitsToDeposit;
    for (const [k, amt] of Object.entries(this.carry)) {
      const available = Math.max(0, Number(amt) || 0);
      if (available <= 0) continue;
      const take = Math.min(available, unitsRemaining);
      if (take <= 0) continue;
      partial[k] = take;
      unitsRemaining -= take;
      if (unitsRemaining <= 0) break;
    }

    if (Object.keys(partial).length === 0) {
      // nothing to deposit
      this._depositProgress = 0;
      this.state = 'idle';
      this.currentTask = null;
      this.target = null;
      return;
    }

    // Attempt to deposit partial amounts.
    const beforePartial = Object.assign({}, partial);
    const depositResult = game.depositCarryToTarget(target, partial);

    // Subtract deposited amounts from NPC carry based on what changed in partial.
    for (const key of Object.keys(beforePartial)) {
      const before = beforePartial[key] || 0;
      const after = Math.max(0, Number(partial[key] || 0));
      const depositedForKey = before - after;
      if (depositedForKey > 0) {
        this.carry[key] = Math.max(0, (this.carry[key] || 0) - depositedForKey);
      }
    }

    // Reduce progress by actual deposited units
    const actualDeposited = depositResult.deposited || 0;
    this._depositProgress = Math.max(0, this._depositProgress - actualDeposited);

    if (this.totalCarry() > 0 && (depositResult.blockedByCapacity || depositResult.blockedByFilter)) {
      const fallbackTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (fallbackTarget) {
        this.currentTask = { kind: 'deposit', target: fallbackTarget };
        this.target = fallbackTarget;
        this.state = 'toStorage';
        return;
      }

      this.currentTask = null;
      this.target = null;
      this.state = 'storageFull';
      this.publishStorageFullAlert(target, game);
      return;
    }

    // If carry emptied, resume previous tasks or idle
    if (this.totalCarry() <= 0) {
      // reset deposit progress
      this._depositProgress = 0;
      if (this.currentTask && this.currentTask.kind === 'gatherTile') {
        const tile = this.currentTask.target;
        if (tile && tile.amount > 0) {
          this.target = tile;
          this.state = 'moving';
          return;
        }
      }
      if (this.popNextTask(game)) return;
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
      return;
    }

    // If we were working on a specific tile, always return to it first until exhausted.
    if (this.currentTask && this.currentTask.kind === 'gatherTile') {
      const tile = this.currentTask.target;
      if (tile.amount > 0) {
        this.target = tile;
        this.state = 'moving';
        return;
      }
      // tile exhausted: end gatherTile and continue with queued work if any
      this.currentTask = null;
      this.target = null;
      if (this.popNextTask(game)) return;
      this.state = 'idle';
      return;
    }

    // if there are queued tasks, run them first
    if (this.popNextTask(game)) return;

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
    this.gainSkillFromBuild(b, unitsReady);
    this.buildProgress = Math.max(0, this.buildProgress - unitsReady);
    this.state = 'building';
    if (b.isConstructed) {
      this.buildProgress = 0;
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
    }
  }

  handleWorkAtTarget(dt, game) {
    const building = this.currentTask?.target;
    const requiredJob = String(building?.requiredWorkerJob || '').trim().toLowerCase();
    if (!building || !building.isConstructed || this.job !== requiredJob) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    const hasWorkshopWork = !!building.activeProduction || (Array.isArray(building.productionQueue) && building.productionQueue.length > 0);
    if (!hasWorkshopWork) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    if (this.depositWorkshopInputs(building, game)) {
      this.state = 'delivering';
      return;
    }

    const workshopSupplyNeed = this.getWorkshopSupplyNeed(building);
    if (!building.activeProduction && workshopSupplyNeed && this.totalCarry() <= 0) {
      if (this.startWorkshopSupplyRun(building, game)) return;
      this.state = 'idle';
      return;
    }

    const isActivelyProducing = !!building.activeProduction;
    if (isActivelyProducing && workshopSupplyNeed) {
      game?.enqueueGlobalWorkshopSupplyTasks?.([building]);
    }
    this.state = isActivelyProducing ? 'working' : 'idle';
    if (isActivelyProducing) {
      this.addJobSkillXp(this.job, Math.max(0, Number(dt) || 0) * 0.12);
    }

    if ((game?.countWorkersAtBuilding?.(building, this.job) || 0) <= 0) {
      this.target = building;
    }
  }

  handleSupplyWorkshopTask(game) {
    const building = this.currentTask?.target;
    if (!building || !building.isConstructed) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    if (this.depositWorkshopInputs(building, game)) {
      if (this.totalCarry() > 0) {
        this.state = 'delivering';
        return;
      }
    }

    const workshopSupplyNeed = this.getWorkshopSupplyNeed(building);
    if (workshopSupplyNeed) {
      if (this.totalCarry() <= 0) {
        if (this.startWorkshopSupplyRun(building, game)) return;
        this.state = 'idle';
        return;
      }
      this.state = 'delivering';
      return;
    }

    this.currentTask = null;
    this.target = null;
    this.state = 'idle';
  }

  handleSupplyStorageRetainTask(game) {
    const building = this.currentTask?.target;
    if (!building || !building.isConstructed) {
      this.currentTask = null;
      this.target = null;
      this.state = 'idle';
      return;
    }

    const retainKeys = Object.keys(building.itemRetainByKey || {});
    const carryingRetain = retainKeys.some((itemKey) => Math.max(0, Number(this.carry?.[itemKey] || 0)) > 0);
    if (carryingRetain) {
      const depositResult = game.depositCarryToTarget(building, this.carry);
      if (this.totalCarry() > 0 && depositResult?.deposited > 0) {
        this.state = 'delivering';
        return;
      }
      if (this.totalCarry() > 0) {
        const fallbackTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
        if (fallbackTarget && fallbackTarget !== building) {
          this.currentTask = { kind: 'deposit', target: fallbackTarget };
          this.target = fallbackTarget;
          this.state = 'toStorage';
          return;
        }
      }
    }

    const retainNeed = this.getStorageRetainNeed(building, game);
    if (retainNeed) {
      if (this.totalCarry() <= 0) {
        if (this.startStorageRetainRun(building, game)) return;
        this.currentTask = null;
        this.target = null;
        this.state = 'idle';
        return;
      }
      this.state = 'delivering';
      return;
    }

    this.currentTask = null;
    this.target = null;
    this.state = 'idle';
  }

  handleGatherTileTask(dt, game) {
    const tile = this.currentTask.target;
    if (tile && typeof tile.identify === 'function') tile.identify();
    if (!this.hasRequiredMiningSkill(tile)) {
      this.gatherProgress = 0;
      this.notifyInsufficientMiningSkill(tile);
      if (this.retargetAfterInsufficientSkill(tile, game)) return;
      this.state = 'needsSkill';
      return;
    }
    if (!this.canGatherResource(tile, game)) {
      this.gatherProgress = 0;
      this.state = 'needsTool';
      this.notifyMissingTools(tile);
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
      this.addGatherYieldToCarry(tile, take);
      this.gainSkillFromResource(tile, take);
      this.consumeGatherDurability(tile, take);
      this.gatherProgress = Math.max(0, this.gatherProgress - take);
      this.state = 'gathering';
      return;
    }

    this.gatherProgress = 0;
    // either full or tile finished
    if (this.totalCarry() >= this.capacity) {
      // Keep the current gatherTile task active; deposit then return to same tile.
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        this.target = null;
        return;
      }
      this.target = depositTarget;
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
        const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
        if (!depositTarget) {
          this.state = 'storageFull';
          this.target = null;
          return;
        }
        this.target = depositTarget;
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
    if (this.target && typeof this.target.identify === 'function') this.target.identify();
    if (!this.hasRequiredMiningSkill(this.target)) {
      this.gatherProgress = 0;
      this.notifyInsufficientMiningSkill(this.target);
      if (this.retargetAfterInsufficientSkill(this.target, game)) return;
      this.state = 'needsSkill';
      return;
    }
    if (!this.canGatherResource(this.target, game)) {
      this.gatherProgress = 0;
      this.state = 'needsTool';
      this.notifyMissingTools(this.target);
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
      this.addGatherYieldToCarry(this.target, take);
      this.gainSkillFromResource(this.target, take);
      this.consumeGatherDurability(this.target, take);
      this.gatherProgress = Math.max(0, this.gatherProgress - take);
      this.state = 'gathering';
      return;
    }

    this.gatherProgress = 0;
    if (this.totalCarry() >= this.capacity) {
      const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
      if (!depositTarget) {
        this.state = 'storageFull';
        this.target = null;
        return;
      }
      this.target = depositTarget;
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
        const depositTarget = game.findNearestDepositTargetWithSpace(this, this.carry);
        if (!depositTarget) {
          this.state = 'storageFull';
          this.target = null;
          return;
        }
        this.target = depositTarget;
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
