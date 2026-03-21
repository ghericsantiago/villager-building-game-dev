import { resourceIcons } from '../resources/resource_ui.js';
import { JOB_SKILL_DEFINITIONS } from './job_skills.js';

export const npcJobs = [
  { key: 'none', label: 'No Job (Manual)' },
  ...Object.values(JOB_SKILL_DEFINITIONS).map(({ key, jobLabel }) => ({
    key,
    label: jobLabel
  }))
];

export function npcSupportsJobs(npc) {
  return !!npc && (npc.type === 'player_worker' || typeof npc.job !== 'undefined');
}

export function getNpcJobsFor(npc) {
  if (!npcSupportsJobs(npc)) return [];
  return npcJobs;
}

export function npcDisplayName(n) {
  return (n && n.name) ? n.name : `Villager ${n.id}`;
}

export function formatTaskLabel(task, capitalizeFn) {
  if (!task) return '';
  const capitalize = typeof capitalizeFn === 'function' ? capitalizeFn : (s => s);

  if (task.kind === 'gatherType') {
    const type = task.target;
    const icon = resourceIcons[type] || '';
    const label = type === 'miner' ? 'Mine Mineral Deposit' : `Gather ${capitalize(type)}`;
    return `<span class="task-icon">${icon}</span><span class="task-text">${label}</span>`;
  }
  if (task.kind === 'gatherTile') {
    const tile = task.target;
    const visualType = typeof tile?.getVisualType === 'function' ? tile.getVisualType() : tile?.type;
    const icon = resourceIcons[visualType] || '';
    return `<span class="task-icon">${icon}</span><span class="task-text">Gather ${capitalize(visualType)} <small>@${tile.x},${tile.y}</small></span>`;
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
