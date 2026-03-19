import { resourceIcons } from '../resources/resource_ui.js';

export const npcJobs = [
  { key: 'none', label: 'No Job (Manual)' },
  { key: 'builder', label: 'Builder' },
  { key: 'tree', label: 'Woodcutter' },
  { key: 'stone', label: 'Stone Miner' },
  { key: 'iron', label: 'Iron Miner' },
  { key: 'copper', label: 'Copper Miner' },
  { key: 'gold', label: 'Gold Miner' }
];

export function npcDisplayName(n) {
  return (n && n.name) ? n.name : `NPC ${n.id}`;
}

export function formatTaskLabel(task, capitalizeFn) {
  if (!task) return '';
  const capitalize = typeof capitalizeFn === 'function' ? capitalizeFn : (s => s);

  if (task.kind === 'gatherType') {
    const type = task.target;
    const icon = resourceIcons[type] || '';
    return `<span class="task-icon">${icon}</span><span class="task-text">Gather ${capitalize(type)}</span>`;
  }
  if (task.kind === 'gatherTile') {
    const tile = task.target;
    const icon = resourceIcons[tile.type] || '';
    return `<span class="task-icon">${icon}</span><span class="task-text">Gather ${capitalize(tile.type)} <small>@${tile.x},${tile.y}</small></span>`;
  }
  if (task.kind === 'move') {
    return `<span class="task-icon">🔜</span><span class="task-text">Move @${task.target.x},${task.target.y}</span>`;
  }
  if (task.kind === 'deposit') {
    return `<span class="task-icon">${resourceIcons.storage}</span><span class="task-text">Deposit</span>`;
  }
  if (task.kind === 'buildBuilding') {
    const b = task.target;
    const title = b?.name || capitalize(b?.kind || 'Building');
    const progress = b ? Math.round((b.buildCompletion || 0) * 100) : 0;
    return `<span class="task-icon">🛠️</span><span class="task-text">Build ${title} <small>${progress}%</small></span>`;
  }
  return `<span class="task-text">${task.kind}</span>`;
}
