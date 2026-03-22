import { createToolItem, formatToolDurability, toolInstanceDisplayName } from '../../items/tools.js';
import {
  applyWorkshopRecipeSearch,
  normalizeWorkshopRecipeSearch
} from '../workshop_recipe_search.js';

const workshopRecipeSearchByBuilding = new WeakMap();

function formatCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, amount]) => `${key} x${Math.max(0, Math.floor(Number(amount) || 0))}`)
    .join(' | ');
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
}

function getRecipePreview(recipe) {
  return createToolItem(recipe.output.key, null, recipe.output.material);
}

function getWorkshopInputSummary(building, recipe) {
  const cost = recipe?.cost || {};
  const shortfall = typeof building?.getInputShortfallForRecipe === 'function'
    ? (building.getInputShortfallForRecipe(recipe) || {})
    : {};
  const rows = Object.entries(cost).map(([itemKey, amount]) => {
    const required = Math.max(0, Math.floor(Number(amount) || 0));
    const stored = Math.max(0, Number(building?.itemStorage?.[itemKey] || 0));
    const missing = Math.max(0, Number(shortfall[itemKey] || 0));
    return { itemKey, required, stored, missing };
  });
  return { rows, shortfall };
}

export function getMasonryWorkshopSettingsSignature(building) {
  if (!building || building.kind !== 'masonryWorkshop') return '';
  const accepted = Array.isArray(building.acceptedItemKeys) ? building.acceptedItemKeys : [];
  return JSON.stringify({
    queue: Array.isArray(building.productionQueue) ? [...building.productionQueue] : [],
    blockedReason: building.productionBlockedReason || '',
    workerCount: Number(building.lastWorkerCount || 0),
    workerSpeed: Number(building.lastWorkerSpeed || 0),
    workerSlots: Number(building.workerSlots || 0),
    active: building.activeProduction
      ? {
        recipeId: building.activeProduction.recipeId,
        elapsed: Number(building.activeProduction.elapsed || 0),
        duration: Number(building.activeProduction.duration || 0)
      }
      : null,
    lastCompletedRecipeId: building.lastCompletedRecipeId || '',
    workshopInputs: accepted.map((key) => [key, Math.max(0, Number(building?.itemStorage?.[key] || 0))])
  });
}

export function renderMasonryWorkshopSettings(building, mountEl, helpers = {}) {
  if (!mountEl) return false;
  mountEl.innerHTML = '';
  if (!building || building.kind !== 'masonryWorkshop') return false;

  const refresh = typeof helpers.refresh === 'function' ? helpers.refresh : () => {};
  const game = helpers.game || null;
  const workerCount = Math.max(0, Number(building.lastWorkerCount || 0));
  const workerSlots = Math.max(0, Number(building.workerSlots || 0));
  const workerSpeed = Math.max(0, Number(building.lastWorkerSpeed || 0));
  const recipeSearchQuery = normalizeWorkshopRecipeSearch(workshopRecipeSearchByBuilding.get(building) || '');

  const wrap = document.createElement('div');
  wrap.className = 'building-workshop-panel masonry-workshop-panel';

  const header = document.createElement('div');
  header.className = 'building-workshop-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'building-workshop-title-wrap';

  const title = document.createElement('div');
  title.className = 'building-workshop-title';
  title.textContent = 'Masonry Orders';
  titleWrap.appendChild(title);

  const subtitle = document.createElement('div');
  subtitle.className = 'building-workshop-subtitle';
  subtitle.textContent = 'Stone masons haul recipe inputs to the workshop, then return finished tools to village storage.';
  titleWrap.appendChild(subtitle);

  header.appendChild(titleWrap);

  const statusPill = document.createElement('div');
  statusPill.className = `building-workshop-status${building.activeProduction ? ' is-active' : (building.productionBlockedReason ? ' is-blocked' : '')}`;
  statusPill.textContent = typeof building.getProductionStatusLabel === 'function'
    ? building.getProductionStatusLabel()
    : 'Idle';
  header.appendChild(statusPill);

  wrap.appendChild(header);

  const workerRow = document.createElement('div');
  workerRow.className = 'building-workshop-worker-row';
  workerRow.innerHTML = `
    <span class="building-workshop-worker-label">Crew</span>
    <span class="building-workshop-worker-value">${workerCount}/${workerSlots} stone mason${workerSlots === 1 ? '' : 's'} | Speed x${workerSpeed.toFixed(workerSpeed >= 10 ? 0 : 2)}</span>
  `;
  wrap.appendChild(workerRow);

  const activeRecipe = typeof building.getActiveRecipe === 'function' ? building.getActiveRecipe() : null;
  const nextRecipe = typeof building.getNextQueuedRecipe === 'function' ? building.getNextQueuedRecipe() : null;
  const queuedShortfall = typeof building.getQueuedInputShortfall === 'function' ? building.getQueuedInputShortfall() : {};
  if (activeRecipe && building.activeProduction) {
    const activeBox = document.createElement('div');
    activeBox.className = 'building-workshop-active';

    const activeHead = document.createElement('div');
    activeHead.className = 'building-workshop-active-head';

    const activeName = document.createElement('div');
    activeName.className = 'building-workshop-active-name';
    activeName.textContent = activeRecipe.name;
    activeHead.appendChild(activeName);

    const activeTime = document.createElement('div');
    activeTime.className = 'building-workshop-active-time';
    activeTime.textContent = `${formatSeconds(building.activeProduction.elapsed)} / ${formatSeconds(building.activeProduction.duration)}`;
    activeHead.appendChild(activeTime);
    activeBox.appendChild(activeHead);

    const progressBar = document.createElement('div');
    progressBar.className = 'building-workshop-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'building-workshop-progress-fill';
    const ratio = Math.max(0, Math.min(1, Number(typeof building.getProductionProgress === 'function' ? building.getProductionProgress() : 0) || 0));
    progressFill.style.width = `${ratio * 100}%`;
    progressBar.appendChild(progressFill);
    activeBox.appendChild(progressBar);

    const activeNote = document.createElement('div');
    activeNote.className = 'building-workshop-note';
    activeNote.textContent = `Output: ${toolInstanceDisplayName(getRecipePreview(activeRecipe))}`;
    activeBox.appendChild(activeNote);
    wrap.appendChild(activeBox);
  } else if (building.productionBlockedReason) {
    const blocked = document.createElement('div');
    blocked.className = 'building-workshop-warning';
    blocked.textContent = building.productionBlockedReason;
    wrap.appendChild(blocked);
  }

  const inputRecipe = activeRecipe || nextRecipe;
  if (inputRecipe) {
    const inputBox = document.createElement('div');
    inputBox.className = 'building-workshop-active';

    const inputHead = document.createElement('div');
    inputHead.className = 'building-workshop-active-head';

    const inputName = document.createElement('div');
    inputName.className = 'building-workshop-active-name';
    inputName.textContent = activeRecipe ? 'Input Buffer' : 'Queued Input Buffer';
    inputHead.appendChild(inputName);

    const inputTime = document.createElement('div');
    inputTime.className = 'building-workshop-active-time';
    inputTime.textContent = activeRecipe ? 'On Site' : 'Next Recipe';
    inputHead.appendChild(inputTime);
    inputBox.appendChild(inputHead);

    const inputSummary = getWorkshopInputSummary(building, inputRecipe);
    for (const row of inputSummary.rows) {
      const line = document.createElement('div');
      line.className = 'building-workshop-note';
      line.textContent = `${row.itemKey}: ${row.stored}/${row.required}${row.missing > 0 ? ` | Missing ${row.missing}` : ' | Ready'}`;
      inputBox.appendChild(line);
    }

    if (!activeRecipe && Object.keys(queuedShortfall).length > 0) {
      const queuedMissing = document.createElement('div');
      queuedMissing.className = 'building-workshop-note';
      queuedMissing.textContent = `Total Missing Across Queue: ${formatCost(queuedShortfall)}`;
      inputBox.appendChild(queuedMissing);
    }

    wrap.appendChild(inputBox);
  }

  const recipes = typeof building.getRecipes === 'function' ? building.getRecipes() : [];
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'building-workshop-search';
  searchInput.placeholder = 'Search recipes...';
  searchInput.setAttribute('aria-label', 'Search workshop recipes');
  searchInput.value = recipeSearchQuery;
  wrap.appendChild(searchInput);

  const list = document.createElement('div');
  list.className = 'building-workshop-recipes';
  const recipeEntries = [];

  for (const recipe of recipes) {
    const preview = getRecipePreview(recipe);
    const queuedCount = typeof building.getQueuedRecipeCount === 'function' ? building.getQueuedRecipeCount(recipe.id) : 0;
    const card = document.createElement('div');
    card.className = 'building-workshop-card';

    const cardHead = document.createElement('div');
    cardHead.className = 'building-workshop-card-head';

    const icon = document.createElement('div');
    icon.className = 'building-workshop-icon';
    icon.textContent = recipe.icon || '🧱';
    cardHead.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'building-workshop-copy';

    const name = document.createElement('div');
    name.className = 'building-workshop-card-title';
    name.textContent = recipe.name;
    copy.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'building-workshop-card-desc';
    desc.textContent = recipe.description;
    copy.appendChild(desc);

    cardHead.appendChild(copy);
    card.appendChild(cardHead);

    const stats = document.createElement('div');
    stats.className = 'building-workshop-stats';
    const recipeInputSummary = getWorkshopInputSummary(building, recipe);
    const totalMissing = Object.values(recipeInputSummary.shortfall).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
    stats.innerHTML = `
      <span>Cost ${formatCost(recipe.cost)}</span>
      <span>Time ${formatSeconds(recipe.duration)}</span>
      <span>${formatToolDurability(preview)}</span>
      <span>${totalMissing > 0 ? `Missing ${formatCost(recipeInputSummary.shortfall)}` : 'Inputs Ready'}</span>
    `;
    card.appendChild(stats);

    const footer = document.createElement('div');
    footer.className = 'building-workshop-footer';

    const queueBadge = document.createElement('div');
    queueBadge.className = 'building-workshop-queue-badge';
    queueBadge.textContent = `Queued ${queuedCount}`;
    footer.appendChild(queueBadge);

    const controls = document.createElement('div');
    controls.className = 'building-workshop-controls';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'building-workshop-btn is-secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.disabled = queuedCount <= 0;
    removeBtn.addEventListener('click', () => {
      if (typeof building.dequeueRecipe !== 'function') return;
      building.dequeueRecipe(recipe.id, game);
      refresh();
    });
    controls.appendChild(removeBtn);

    const queueBtn = document.createElement('button');
    queueBtn.type = 'button';
    queueBtn.className = 'building-workshop-btn';
    queueBtn.textContent = 'Queue';
    queueBtn.addEventListener('click', () => {
      if (typeof building.enqueueRecipe !== 'function') return;
      building.enqueueRecipe(recipe.id);
      refresh();
    });
    controls.appendChild(queueBtn);

    footer.appendChild(controls);
    card.appendChild(footer);
    list.appendChild(card);
    recipeEntries.push({ recipe, card });
  }

  const empty = document.createElement('div');
  empty.className = 'building-workshop-empty';
  list.appendChild(empty);

  searchInput.addEventListener('input', () => {
    workshopRecipeSearchByBuilding.set(building, searchInput.value);
    applyWorkshopRecipeSearch(recipeEntries, empty, searchInput.value);
  });

  applyWorkshopRecipeSearch(recipeEntries, empty, recipeSearchQuery);

  wrap.appendChild(list);
  mountEl.appendChild(wrap);
  return true;
}