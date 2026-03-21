import { Building } from '../../building.js';

const MASONRY_RECIPES = Object.freeze([
  {
    id: 'stone_axe',
    icon: '🪓',
    name: 'Stone Axe',
    description: 'A heavier chopping tool with a carved stone head.',
    cost: { log: 2, stone: 6 },
    duration: 10,
    output: { key: 'axe', material: 'stone', count: 1 }
  },
  {
    id: 'stone_pickaxe',
    icon: '⛏️',
    name: 'Stone Pickaxe',
    description: 'A tougher mining tool reinforced with shaped stone.',
    cost: { log: 2, stone: 8 },
    duration: 12,
    output: { key: 'pickaxe', material: 'stone', count: 1 }
  }
]);

function normalizeRecipeId(recipeId) {
  return String(recipeId || '').trim().toLowerCase();
}

function recipeById(recipeId) {
  const id = normalizeRecipeId(recipeId);
  return MASONRY_RECIPES.find(recipe => recipe.id === id) || null;
}

function formatRecipeCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, amount]) => `${key} x${Math.max(0, Math.floor(Number(amount) || 0))}`)
    .join(', ');
}

function getStoneMasonWorkRate(npc) {
  const level = Math.max(1, Number(typeof npc?.getJobSkillLevel === 'function' ? npc.getJobSkillLevel('stonemason') : 1) || 1);
  return 1 + ((level - 1) * 0.15);
}

export class MasonryWorkshopBuilding extends Building {
  static recipes = MASONRY_RECIPES;

  static definition = {
    kind: 'masonryWorkshop',
    name: 'Masonry Workshop',
    icon: '🧱',
    sprite: 'src/sprites/building_masonry_workshop_64x64.svg',
    mapSymbol: 'M',
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
    requiredWorkerJob: 'stonemason',
    workerSlots: 2
  };

  constructor(x, y, overrides = {}) {
    super(MasonryWorkshopBuilding.definition.kind, x, y, { ...MasonryWorkshopBuilding.definition, ...overrides });

    this.productionSpeed = Math.max(0.1, Number(overrides.productionSpeed ?? MasonryWorkshopBuilding.definition.productionSpeed ?? 1));
    this.requiredWorkerJob = String(overrides.requiredWorkerJob ?? MasonryWorkshopBuilding.definition.requiredWorkerJob ?? 'stonemason').trim().toLowerCase();
    this.workerSlots = Math.max(0, Math.floor(Number(overrides.workerSlots ?? MasonryWorkshopBuilding.definition.workerSlots ?? 1)));
    this.productionQueue = Array.isArray(overrides.productionQueue)
      ? overrides.productionQueue.map(normalizeRecipeId).filter(recipeId => !!recipeById(recipeId))
      : [];
    this.activeProduction = null;
    this.productionBlockedReason = '';
    this.lastCompletedRecipeId = '';
    this.lastWorkerCount = 0;
    this.lastWorkerSpeed = 0;

    this.palette = {
      frame: '#505862',
      fill: '#77828f',
      stroke: '#293039',
      text: '#edf6ff'
    };
  }

  getRecipes() {
    return MasonryWorkshopBuilding.recipes;
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

  dequeueRecipe(recipeId) {
    const id = normalizeRecipeId(recipeId);
    for (let index = this.productionQueue.length - 1; index >= 0; index -= 1) {
      if (this.productionQueue[index] !== id) continue;
      this.productionQueue.splice(index, 1);
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

  getProductionProgress() {
    if (!this.activeProduction) return 0;
    const duration = Math.max(0.001, Number(this.activeProduction.duration || 0));
    return Math.max(0, Math.min(1, Number(this.activeProduction.elapsed || 0) / duration));
  }

  getProductionStatusLabel() {
    if (!this.isConstructed) return 'Under Construction';
    const activeRecipe = this.getActiveRecipe();
    if (this.productionBlockedReason === 'Needs Stone Mason On Site.') return 'Needs Stone Mason';
    if (activeRecipe) return `Crafting ${activeRecipe.name}`;
    if (this.productionBlockedReason) return 'Waiting For Materials';
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
    return workers.reduce((sum, npc) => sum + getStoneMasonWorkRate(npc), 0);
  }

  tryStartNextRecipe(game) {
    if (this.activeProduction || !this.isConstructed || this.productionQueue.length <= 0) return false;
    const recipe = this.getRecipe(this.productionQueue[0]);
    if (!recipe) {
      this.productionQueue.shift();
      return false;
    }

    if (!game?.canAffordStoredCost?.(recipe.cost)) {
      this.productionBlockedReason = `Needs ${formatRecipeCost(recipe.cost)} in storage.`;
      return false;
    }
    if (!game?.spendStoredCost?.(recipe.cost)) {
      this.productionBlockedReason = `Needs ${formatRecipeCost(recipe.cost)} in storage.`;
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
      if (this.activeProduction || this.productionQueue.length > 0) this.productionBlockedReason = 'Needs Stone Mason On Site.';
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