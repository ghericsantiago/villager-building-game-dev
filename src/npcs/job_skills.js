export const JOB_SKILL_DEFINITIONS = Object.freeze({
  carpenter: {
    key: 'carpenter',
    jobLabel: 'Carpenter',
    skillLabel: 'Carpentry',
    icon: '🪚',
    color: '#c89459',
    gainScale: 1
  },
  builder: {
    key: 'builder',
    jobLabel: 'Builder',
    skillLabel: 'Construction',
    icon: '🛠️',
    color: '#d8ab62',
    gainScale: 1
  },
  tree: {
    key: 'tree',
    jobLabel: 'Woodcutter',
    skillLabel: 'Logging',
    icon: '🌲',
    color: '#73c983',
    gainScale: 1
  },
  miner: {
    key: 'miner',
    jobLabel: 'Miner',
    skillLabel: 'Mining',
    icon: '⛏️',
    color: '#aebed0',
    gainScale: 1
  },
  forager: {
    key: 'forager',
    jobLabel: 'Forager',
    skillLabel: 'Foraging',
    icon: '🍓',
    color: '#eb7fae',
    gainScale: 1
  }
});

export const JOB_SKILL_DIFFICULTY = Object.freeze({
  // Higher = slower leveling. Lower = faster leveling.
  levelXpMultiplier: 1.75,
  baseLevelXp: 18,
  linearLevelXp: 8,
  quadraticLevelXp: 2.5
});

const JOB_SKILL_ALIASES = Object.freeze({
  stone: 'miner',
  iron: 'miner',
  copper: 'miner',
  silver: 'miner',
  gold: 'miner',
  mineral: 'miner',
  wildberry: 'forager'
});

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeJobSkillKey(skillKey) {
  const key = String(skillKey || '').trim().toLowerCase();
  if (!key) return '';
  return JOB_SKILL_ALIASES[key] || key;
}

export function getJobSkillDefinition(skillKey) {
  const key = normalizeJobSkillKey(skillKey);
  const existing = JOB_SKILL_DEFINITIONS[key];
  if (existing) return existing;
  return {
    key,
    jobLabel: toTitleCase(key),
    skillLabel: toTitleCase(key),
    icon: '✦',
    color: '#79c3d3',
    gainScale: 1
  };
}

export function getJobSkillKeyForResource(resourceOrType) {
  const type = typeof resourceOrType === 'string'
    ? resourceOrType
    : resourceOrType?.type;
  return normalizeJobSkillKey(type);
}

export function xpRequiredForLevel(level) {
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  const tier = currentLevel - 1;
  const baseXp = Number(JOB_SKILL_DIFFICULTY.baseLevelXp || 0);
  const linearXp = Number(JOB_SKILL_DIFFICULTY.linearLevelXp || 0);
  const quadraticXp = Number(JOB_SKILL_DIFFICULTY.quadraticLevelXp || 0);
  const multiplier = Math.max(0.1, Number(JOB_SKILL_DIFFICULTY.levelXpMultiplier || 1));
  const rawXp = baseXp + (tier * linearXp) + (tier * tier * quadraticXp);
  return Math.max(1, Math.round(rawXp * multiplier));
}

export function xpTotalForLevel(level) {
  let total = 0;
  const targetLevel = Math.max(1, Math.floor(Number(level) || 1));
  for (let current = 1; current < targetLevel; current += 1) {
    total += xpRequiredForLevel(current);
  }
  return total;
}

export function createNpcJobSkills(source = {}, options = {}) {
  const state = {};
  const rawEntries = (source && typeof source === 'object') ? Object.entries(source) : [];
  for (const [rawKey, rawValue] of rawEntries) {
    const key = normalizeJobSkillKey(rawKey);
    if (!key) continue;
    const xp = Math.max(0, Number(rawValue?.xp ?? rawValue) || 0);
    state[key] = { xp };
  }

  for (const key of Object.keys(JOB_SKILL_DEFINITIONS)) {
    if (!state[key]) state[key] = { xp: 0 };
  }

  if (Number.isFinite(Number(options.miningSkillLevel))) {
    const legacyLevel = Math.max(1, Math.floor(Number(options.miningSkillLevel) || 1));
    state.miner = state.miner || { xp: 0 };
    state.miner.xp = Math.max(Number(state.miner.xp || 0), xpTotalForLevel(legacyLevel));
  }

  return state;
}

export function getJobSkillSnapshot(jobSkills, skillKey) {
  const key = normalizeJobSkillKey(skillKey);
  const definition = getJobSkillDefinition(key);
  const record = (jobSkills && typeof jobSkills === 'object' && jobSkills[key] && typeof jobSkills[key] === 'object')
    ? jobSkills[key]
    : { xp: 0 };

  let totalXp = Math.max(0, Number(record.xp) || 0);
  let level = 1;
  while (totalXp >= xpRequiredForLevel(level)) {
    totalXp -= xpRequiredForLevel(level);
    level += 1;
  }
  const nextLevelXp = xpRequiredForLevel(level);
  const currentLevelXp = totalXp;
  const progressRatio = nextLevelXp > 0 ? currentLevelXp / nextLevelXp : 1;

  return {
    ...definition,
    xp: Math.max(0, Number(record.xp) || 0),
    level,
    currentLevelXp,
    nextLevelXp,
    progressRatio,
    progressPercent: Math.round(progressRatio * 100)
  };
}

export function listJobSkillSnapshots(jobSkills, options = {}) {
  const includeUnknown = !!options.includeUnknown;
  const orderedKeys = [...Object.keys(JOB_SKILL_DEFINITIONS)];
  if (includeUnknown && jobSkills && typeof jobSkills === 'object') {
    for (const key of Object.keys(jobSkills)) {
      const normalized = normalizeJobSkillKey(key);
      if (!orderedKeys.includes(normalized)) orderedKeys.push(normalized);
    }
  }
  return orderedKeys.map(key => getJobSkillSnapshot(jobSkills, key));
}