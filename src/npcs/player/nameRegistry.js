import { faker } from 'https://esm.sh/@faker-js/faker@9.7.0';

const usedNpcNames = new Set();
let duplicateNameCounter = 1;

function normalizeName(value) {
  return String(value || '').trim();
}

export function reserveUniqueName(candidate) {
  const base = normalizeName(candidate) || `Worker ${duplicateNameCounter++}`;
  if (!usedNpcNames.has(base)) {
    usedNpcNames.add(base);
    return base;
  }

  let i = 2;
  while (usedNpcNames.has(`${base} ${i}`)) i += 1;
  const unique = `${base} ${i}`;
  usedNpcNames.add(unique);
  return unique;
}

export function randomNpcName() {
  // Retry a handful of times for a clean, unsuffixed unique first name.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = normalizeName(faker.person.firstName());
    if (candidate && !usedNpcNames.has(candidate)) {
      usedNpcNames.add(candidate);
      return candidate;
    }
  }

  // Fallback in case random generation repeats existing names.
  return reserveUniqueName(normalizeName(faker.person.firstName()) || 'Worker');
}
