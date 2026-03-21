import { NPC_TYPES } from '../types.js';

const VILLAGER_JOB_SPRITES = {
  none: 'src/sprites/villager_job_none_32x32.png',
  carpenter: 'src/sprites/villager_job_carpenter_32x32.svg',
  stonemason: 'src/sprites/villager_job_stonemason_32x32.svg',
  builder: 'src/sprites/villager_job_builder_32x32.png',
  tree: 'src/sprites/villager_job_tree_32x32.png',
  miner: 'src/sprites/villager_job_stone_32x32.png',
  stone: 'src/sprites/villager_job_stone_32x32.png',
  iron: 'src/sprites/villager_job_iron_32x32.png',
  copper: 'src/sprites/villager_job_copper_32x32.png',
  forager: 'src/sprites/villager_job_forager_32x32.png',
  gold: 'src/sprites/villager_job_gold_32x32.png'
};

const VILLAGER_SPRITES = [
  VILLAGER_JOB_SPRITES.none,
  'src/sprites/woodcutter_32x32.png',
  'src/sprites/npc_villager_32x32.png'
];

const NPC_TYPE_SPRITES = {
  [NPC_TYPES.PLAYER_WORKER]: VILLAGER_SPRITES,
  [NPC_TYPES.ANIMAL]: 'src/sprites/npc_animal_32x32.png',
  [NPC_TYPES.ENEMY]: 'src/sprites/npc_enemy_32x32.png'
};

function randomFrom(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list[Math.floor(Math.random() * list.length)] || '';
}

export function randomNpcSpriteFrame() {
  return getNpcSpriteForType(NPC_TYPES.PLAYER_WORKER);
}

export function getVillagerSpriteForJob(job) {
  const key = String(job || 'none').trim().toLowerCase();
  const src = VILLAGER_JOB_SPRITES[key] || VILLAGER_JOB_SPRITES.none;
  return { src };
}

export function getNpcSpriteForType(type) {
  const entry = NPC_TYPE_SPRITES[type];
  const src = Array.isArray(entry) ? randomFrom(entry) : String(entry || '').trim();
  if (!src) return { src: 'src/sprites/woodcutter_32x32.png' };
  return {
    src
  };
}
