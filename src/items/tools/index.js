import { AxeTool } from './AxeTool.js';
import { PickaxeTool } from './PickaxeTool.js';

export { ToolItem } from './ToolItem.js';
export { AxeTool } from './AxeTool.js';
export { PickaxeTool } from './PickaxeTool.js';

export const TOOL_CLASS_BY_KEY = {
  [AxeTool.key]: AxeTool,
  [PickaxeTool.key]: PickaxeTool
};

export function getToolClass(key) {
  return TOOL_CLASS_BY_KEY[key] || null;
}
