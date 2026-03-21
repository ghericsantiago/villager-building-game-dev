import { createSeededRandom } from './map_seed.js';

export function generateResourceMapResources({
  seedInput,
  cols,
  rows,
  createResourceByType
}) {
  const rng = createSeededRandom(seedInput);
  const resources = [];
  const occupied = new Set();

  const storageX = Math.floor(cols / 2);
  const storageY = rows - 2;

  function keyFor(x, y) {
    return `${x},${y}`;
  }

  function hasResourceAt(x, y) {
    return occupied.has(keyFor(x, y));
  }

  function pushResource(typeKey, x, y, amount, props = {}) {
    occupied.add(keyFor(x, y));
    resources.push(createResourceByType(typeKey, x, y, amount, props));
  }

  const baseSeeds = Math.max(3, Math.floor((cols * rows) / 400));

  function spawnClusters(typeKey, weight, minAmount, maxAmount, radiusScale = 1) {
    const clusterSeeds = Math.max(1, Math.floor(baseSeeds * weight * (0.8 + rng.random() * 0.8)));
    for (let s = 0; s < clusterSeeds; s += 1) {
      const cx = rng.randInt(0, cols - 1);
      const cy = rng.randInt(0, rows - 1 - 2);
      const baseRadius = Math.floor(Math.min(cols, rows) * (0.06 + 0.03 * rng.random()) * radiusScale);
      const radius = rng.randInt(2, Math.max(3, baseRadius));

      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const x = cx + ox;
          const y = cy + oy;
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
          if (x === storageX && y === storageY) continue;

          const dist = Math.hypot(ox, oy);
          if (dist > radius) continue;

          const p = 0.6 * (1 - dist / (radius + 0.001)) + 0.05 * rng.random();
          if (rng.random() >= p) continue;
          if (hasResourceAt(x, y)) continue;

          pushResource(typeKey, x, y, rng.randInt(minAmount, maxAmount));
        }
      }
    }
  }

  // Trees still form their own natural clusters.
  spawnClusters('tree', 1.0, 40, 220, 1.05);

  const groupPresets = [
    { stone: 0.52, copper: 0.24, silver: 0.12, gold: 0.08, iron: 0.04 },
    { stone: 0.57, copper: 0.18, silver: 0.14, gold: 0.06, iron: 0.05 },
    { stone: 0.49, copper: 0.27, silver: 0.11, gold: 0.07, iron: 0.06 },
    { stone: 0.6, copper: 0.16, silver: 0.13, gold: 0.05, iron: 0.06 }
  ];

  function pickWeightedType(distribution) {
    const entries = Object.entries(distribution || {}).filter(([, v]) => (Number(v) || 0) > 0);
    if (entries.length <= 0) return 'stone';
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = rng.random() * total;
    for (const [key, weight] of entries) {
      roll -= Number(weight);
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function normalizeDistribution(dist) {
    const entries = Object.entries(dist || {})
      .map(([k, v]) => [k, Math.max(0, Number(v) || 0)])
      .filter(([, v]) => v > 0);
    if (entries.length <= 0) return { stone: 1 };
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    const normalized = {};
    for (const [k, v] of entries) normalized[k] = v / total;
    return normalized;
  }

  function spawnMineralGroups() {
    const groupCount = Math.max(4, Math.floor((cols * rows) / 5200));
    for (let groupId = 0; groupId < groupCount; groupId += 1) {
      const centerX = rng.randInt(0, cols - 1);
      const centerY = rng.randInt(0, rows - 1 - 2);
      if (centerX === storageX && centerY === storageY) continue;

      const basePreset = groupPresets[rng.randInt(0, groupPresets.length - 1)];
      const jittered = {};
      for (const [key, value] of Object.entries(basePreset)) {
        const jitter = 0.82 + rng.random() * 0.36;
        jittered[key] = Math.max(0.01, value * jitter);
      }
      const groupDistribution = normalizeDistribution(jittered);

      const chunkCount = rng.randInt(3, 7);
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const offsetRadius = rng.randInt(0, 10);
        const angle = rng.random() * Math.PI * 2;
        const cx = centerX + Math.round(Math.cos(angle) * offsetRadius);
        const cy = centerY + Math.round(Math.sin(angle) * offsetRadius);
        const radius = rng.randInt(2, 5);

        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            const x = cx + ox;
            const y = cy + oy;
            if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
            if (x === storageX && y === storageY) continue;
            if (hasResourceAt(x, y)) continue;

            const dist = Math.hypot(ox, oy);
            if (dist > radius) continue;
            const edgeFalloff = 1 - (dist / (radius + 0.001));
            const placementChance = 0.32 + edgeFalloff * 0.55;
            if (rng.random() > placementChance) continue;

            const typeKey = pickWeightedType(groupDistribution);
            const amount = typeKey === 'stone'
              ? rng.randInt(70, 190)
              : rng.randInt(60, 170);

            pushResource(typeKey, x, y, amount, {
              groupId,
              groupChunkIndex: chunkIndex,
              groupComposition: groupDistribution
            });
          }
        }
      }
    }
  }

  spawnMineralGroups();

  // Spawn wild berries: use spawnClusters for many small clumps plus occasional larger patches
  // Many small, tight clusters spread widely
  spawnClusters('wildberry', 1.4, 6, 22, 0.45);
  // Some larger patches for variety
  spawnClusters('wildberry', 0.28, 12, 36, 1.05);

  for (let i = 0; i < Math.floor((cols * rows) * 0.01); i += 1) {
    const x = rng.randInt(0, cols - 1);
    const y = rng.randInt(0, rows - 1 - 2);
    if (x === storageX && y === storageY) continue;
    if (hasResourceAt(x, y)) continue;
    if (rng.random() < 0.02) {
      const typeKey = rng.random() < 0.35
        ? 'tree'
        : pickWeightedType({ stone: 0.62, copper: 0.18, silver: 0.1, gold: 0.06, iron: 0.04 });
      pushResource(typeKey, x, y, rng.randInt(30, 150));
    }
    // occasional isolated wildberry nodes sprinkled across the map (higher chance for scattering)
    if (!hasResourceAt(x, y) && rng.random() < 0.03) {
      pushResource('wildberry', x, y, rng.randInt(6, 20));
    }
  }

  return {
    seedText: rng.seedText,
    resources
  };
}
