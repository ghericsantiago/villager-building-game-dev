export function normalizeWorkshopRecipeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

export function matchesWorkshopRecipeSearch(recipe, query) {
  if (!query) return true;
  const text = [recipe.name, recipe.description, recipe.output?.key, recipe.output?.material, recipe.icon]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return text.includes(query);
}

export function applyWorkshopRecipeSearch(recipeEntries, emptyEl, query) {
  const normalized = normalizeWorkshopRecipeSearch(query);
  let visibleCount = 0;
  for (const entry of recipeEntries) {
    const visible = matchesWorkshopRecipeSearch(entry.recipe, normalized);
    entry.card.style.display = visible ? '' : 'none';
    if (visible) visibleCount += 1;
  }
  if (emptyEl) {
    emptyEl.style.display = visibleCount > 0 ? 'none' : 'block';
    emptyEl.textContent = normalized
      ? 'No recipes match that search.'
      : 'No recipes available.';
  }
}