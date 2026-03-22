import { Building } from '../../building.js';
import {
  consumeStoredCost,
  createWorkshopInputStorage,
  formatWorkshopCost,
  refundExcessStoredCost,
  getStoredCostShortfall,
  getWorkshopAcceptedItemKeys,
  hasStoredCost,
  sumWorkshopCosts
} from '../workshop_inventory.js';

const CARPENTRY_RECIPES = Object.freeze([
  {
    id: 'wood_axe',
    icon: '🪓',
    name: 'Wood Axe',
    description: 'Fast to craft. Good starter chopping tool.',
    cost: { log: 6 },
    duration: 7,
    output: { key: 'axe', material: 'wood', count: 1 }
  },
  {
    id: 'wood_pickaxe',
    icon: '⛏️',
    name: 'Wood Pickaxe',
    description: 'Basic mining tool made from shaped timber.',
    cost: { log: 8 },
    duration: 9,
    output: { key: 'pickaxe', material: 'wood', count: 1 }
  }
]);

function normalizeRecipeId(recipeId) {
  return String(recipeId || '').trim().toLowerCase();
}

function recipeById(recipeId) {
  const id = normalizeRecipeId(recipeId);
  return CARPENTRY_RECIPES.find(recipe => recipe.id === id) || null;
}

function getCarpenterWorkRate(npc) {
  const level = Math.max(1, Number(typeof npc?.getJobSkillLevel === 'function' ? npc.getJobSkillLevel('carpenter') : 1) || 1);
  return 1 + ((level - 1) * 0.15);
}

export class CarpentryWorkshopBuilding extends Building {
  static recipes = CARPENTRY_RECIPES;

  static definition = {
    kind: 'carpentryWorkshop',
    name: 'Carpentry Workshop',
    icon: '🪚',
    sprite: 'src/sprites/building_carpentry_workshop_64x64.svg',
    mapSymbol: 'C',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 2, h: 2 },
    maxCount: Infinity,
    requiresBuildings: [
      { kind: 'horseWagon', count: 1 },
      { kind: 'storage', count: 1 }
    ],
    cost: {
      log: 50,
      stone: 50
    },
    destroyRefund: {
      log: 25,
      stone: 25
    },
    buildDifficulty: 3.4,
    productionSpeed: 1,
    requiredWorkerJob: 'carpenter',
    workerSlots: 2
  };

  constructor(x, y, overrides = {}) {
    super(CarpentryWorkshopBuilding.definition.kind, x, y, { ...CarpentryWorkshopBuilding.definition, ...overrides });

    this.productionSpeed = Math.max(0.1, Number(overrides.productionSpeed ?? CarpentryWorkshopBuilding.definition.productionSpeed ?? 1));
    this.requiredWorkerJob = String(overrides.requiredWorkerJob ?? CarpentryWorkshopBuilding.definition.requiredWorkerJob ?? 'carpenter').trim().toLowerCase();
    this.workerSlots = Math.max(0, Math.floor(Number(overrides.workerSlots ?? CarpentryWorkshopBuilding.definition.workerSlots ?? 1)));
    this.productionQueue = Array.isArray(overrides.productionQueue)
      ? overrides.productionQueue.map(normalizeRecipeId).filter(recipeId => !!recipeById(recipeId))
      : [];
    this.activeProduction = null;
    this.productionBlockedReason = '';
    this.lastCompletedRecipeId = '';
    this.lastWorkerCount = 0;
    this.lastWorkerSpeed = 0;
    this.storageCapacity = Math.max(1, Math.floor(Number(overrides.storageCapacity ?? 32) || 32));
    this.excludeFromVillageStorageTotals = true;
    this.itemStorage = createWorkshopInputStorage(overrides.itemStorage);
    this.setAcceptedItems(getWorkshopAcceptedItemKeys(CarpentryWorkshopBuilding.recipes));

    this.palette = {
      frame: '#594132',
      fill: '#7c5c43',
      stroke: '#2f2219',
      text: '#f4dfbf'
    };
  }

  getRecipes() {
    return CarpentryWorkshopBuilding.recipes;
  }

  getRecipe(recipeId) {
    return recipeById(recipeId);
  }

  enqueueRecipe(recipeId) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return false;
    this.productionQueue.push(recipe.id);
    return true;
  }

  dequeueRecipe(recipeId, game = null) {
    const id = normalizeRecipeId(recipeId);
    for (let index = this.productionQueue.length - 1; index >= 0; index -= 1) {
      if (this.productionQueue[index] !== id) continue;
      this.productionQueue.splice(index, 1);
      if (game) this.reconcileInputBuffer(game);
      return true;
    }
    return false;
  }

  getQueuedRecipeCount(recipeId) {
    const id = normalizeRecipeId(recipeId);
    return this.productionQueue.reduce((count, entry) => count + (entry === id ? 1 : 0), 0);
  }

  getActiveRecipe() {
    return this.activeProduction ? this.getRecipe(this.activeProduction.recipeId) : null;
  }

  getNextQueuedRecipe() {
    return this.productionQueue.length > 0 ? this.getRecipe(this.productionQueue[0]) : null;
  }

  getQueuedRecipes() {
    return this.productionQueue.map((recipeId) => this.getRecipe(recipeId)).filter(Boolean);
  }

  getQueuedInputCost() {
    return sumWorkshopCosts(this.getQueuedRecipes().map((recipe) => recipe.cost || {}));
  }

  getInputShortfallForRecipe(recipe) {
    return getStoredCostShortfall(this.itemStorage, recipe?.cost || {});
  }

  getQueuedInputShortfall() {
    return getStoredCostShortfall(this.itemStorage, this.getQueuedInputCost());
  }

  reconcileInputBuffer(game) {
    return refundExcessStoredCost(this.itemStorage, this.getQueuedInputCost(), game, this.acceptedItemKeys || []);
  }

  getProductionProgress() {
    if (!this.activeProduction) return 0;
    const duration = Math.max(0.001, Number(this.activeProduction.duration || 0));
    return Math.max(0, Math.min(1, Number(this.activeProduction.elapsed || 0) / duration));
  }

  getProductionStatusLabel() {
    if (!this.isConstructed) return 'Under Construction';
    const activeRecipe = this.getActiveRecipe();
    if (this.productionBlockedReason === 'Needs Carpenter On Site.') return 'Needs Carpenter';
    if (activeRecipe) return `Crafting ${activeRecipe.name}`;
    if (this.productionBlockedReason) return 'Waiting For Delivery';
    if (this.productionQueue.length > 0) return 'Queued';
    return 'Idle';
  }

  getWorkerCount(game) {
    return Math.max(0, Number(game?.countWorkersAtBuilding?.(this, this.requiredWorkerJob) || 0));
  }

  getActiveWorkers(game) {
    const workers = Array.isArray(game?.getWorkersAtBuilding?.(this, this.requiredWorkerJob, { onSiteOnly: true }))
      ? game.getWorkersAtBuilding(this, this.requiredWorkerJob, { onSiteOnly: true })
      : [];
    return workers.slice(0, Math.max(0, this.workerSlots));
  }

  getWorkerSpeed(game) {
    const workers = this.getActiveWorkers(game);
    return workers.reduce((sum, npc) => sum + getCarpenterWorkRate(npc), 0);
  }

  tryStartNextRecipe(game) {
    if (this.activeProduction || !this.isConstructed || this.productionQueue.length <= 0) return false;
    const recipe = this.getRecipe(this.productionQueue[0]);
    if (!recipe) {
      this.productionQueue.shift();
      return false;
    }

    if (!hasStoredCost(this.itemStorage, recipe.cost)) {
      const shortfall = this.getQueuedInputShortfall();
      this.productionBlockedReason = `Needs ${formatWorkshopCost(shortfall)} delivered to workshop.`;
      return false;
    }
    if (!consumeStoredCost(this.itemStorage, recipe.cost)) {
      const shortfall = this.getQueuedInputShortfall();
      this.productionBlockedReason = `Needs ${formatWorkshopCost(shortfall)} delivered to workshop.`;
      return false;
    }

    this.productionQueue.shift();
    this.productionBlockedReason = '';
    this.activeProduction = {
      recipeId: recipe.id,
      elapsed: 0,
      duration: Math.max(0.5, Number(recipe.duration || 1))
    };
    return true;
  }

  finishActiveRecipe(game) {
    const recipe = this.getActiveRecipe();
    if (!recipe) {
      this.activeProduction = null;
      return false;
    }

    const outputCount = Math.max(1, Math.floor(Number(recipe.output?.count || 1)));
    for (let index = 0; index < outputCount; index += 1) {
      game?.addToolsToStorage?.(recipe.output.key, 1, { material: recipe.output.material });
    }
    this.lastCompletedRecipeId = recipe.id;
    this.activeProduction = null;
    this.productionBlockedReason = '';
    return true;
  }

  update(dt, game) {
    if (!this.isConstructed) return;
    const activeWorkers = this.getActiveWorkers(game);
    const workerSpeed = this.getWorkerSpeed(game);
    this.lastWorkerCount = activeWorkers.length;
    this.lastWorkerSpeed = workerSpeed;
    if (activeWorkers.length <= 0 || workerSpeed <= 0) {
      if (this.activeProduction || this.productionQueue.length > 0) this.productionBlockedReason = 'Needs Carpenter On Site.';
      return;
    }

    let remaining = Math.max(0, Number(dt) || 0) * this.productionSpeed * workerSpeed;
    if (remaining <= 0) return;

    let iterations = 0;
    while (remaining > 0 && iterations < 8) {
      if (!this.activeProduction && !this.tryStartNextRecipe(game)) break;
      if (!this.activeProduction) break;

      const workLeft = Math.max(0, Number(this.activeProduction.duration || 0) - Number(this.activeProduction.elapsed || 0));
      const applied = Math.min(workLeft, remaining);
      this.activeProduction.elapsed += applied;
      remaining -= applied;

      if (this.activeProduction.elapsed + 0.0001 >= this.activeProduction.duration) {
        this.finishActiveRecipe(game);
      } else {
        break;
      }

      iterations += 1;
    }

    if (!this.activeProduction && this.productionQueue.length <= 0) this.productionBlockedReason = '';
  }
}