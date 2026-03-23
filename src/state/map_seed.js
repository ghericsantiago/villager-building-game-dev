function normalizeSeed(seedInput) {
  return String(seedInput ?? '').trim();
}

export function resolveInitialMapSeed() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const fromQuery = normalizeSeed(params.get('seed') || params.get('mapSeed'));
      if (fromQuery) return fromQuery;
    } catch {}
  }

  return `rnd-${Date.now().toString(36)}`;
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function nextSeed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function random() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seedInput) {
  const seedText = normalizeSeed(seedInput) || 'default-seed';
  const seedFn = xmur3(seedText);
  const random = mulberry32(seedFn());

  return {
    seedText,
    random,
    randInt(min, max) {
      const a = Math.floor(Math.min(min, max));
      const b = Math.floor(Math.max(min, max));
      return a + Math.floor(random() * (b - a + 1));
    }
  };
}
