import { NPC, PlayerWorkerNpc } from './player/PlayerWorkerNpc.js';
import { NPC_TYPES, NPC_FACTIONS } from './types.js';
import { NpcBase } from './core/NpcBase.js';

export { NPC, PlayerWorkerNpc, NpcBase, NPC_TYPES, NPC_FACTIONS };

export const NPC_CLASS_BY_TYPE = {
  [NPC_TYPES.PLAYER_WORKER]: PlayerWorkerNpc
};

export function createNpcByType(type, id, x, y, options = {}) {
  const Ctor = NPC_CLASS_BY_TYPE[type] || PlayerWorkerNpc;
  if (Ctor === PlayerWorkerNpc) {
    return new PlayerWorkerNpc(id, x, y, options.name || null);
  }
  return new Ctor(id, x, y, options);
}
