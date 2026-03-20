import { createSeededRandom } from './map_seed.js';

export function generateResourceMapResources({
  seedInput,
  cols,
  rows,
  resourceTypes,
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

  function pushResource(typeKey, x, y, amount) {
    occupied.add(keyFor(x, y));
    resources.push(createResourceByType(typeKey, x, y, amount));
  }

  const typeWeights = {
    tree: 1.0,
    stone: 0.9,
    iron: 0.5,
    copper: 0.6,
    gold: 0.2
  };

  const baseSeeds = Math.max(3, Math.floor((cols * rows) / 400));

  for (const type of resourceTypes) {
    const weight = typeWeights[type.key] || 0.5;
    const clusterSeeds = Math.max(1, Math.floor(baseSeeds * weight * (0.8 + rng.random() * 0.8)));

    for (let s = 0; s < clusterSeeds; s += 1) {
      const cx = rng.randInt(0, cols - 1);
      const cy = rng.randInt(0, rows - 1 - 2);
      const radius = rng.randInt(2, Math.max(3, Math.floor(Math.min(cols, rows) * (0.06 + 0.03 * rng.random()))));

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

          pushResource(type.key, x, y, rng.randInt(40, 220));
        }
      }
    }
  }

  for (let i = 0; i < Math.floor((cols * rows) * 0.01); i += 1) {
    const x = rng.randInt(0, cols - 1);
    const y = rng.randInt(0, rows - 1 - 2);
    if (x === storageX && y === storageY) continue;
    if (hasResourceAt(x, y)) continue;
    if (rng.random() < 0.02) {
      const type = resourceTypes[rng.randInt(0, resourceTypes.length - 1)];
      pushResource(type.key, x, y, rng.randInt(30, 150));
    }
  }

  return {
    seedText: rng.seedText,
    resources
  };
}
