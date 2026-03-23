import { ToolItem } from './ToolItem.js';

export class AxeTool extends ToolItem {
  static key = 'axe';
  static displayName = 'Axe';
  static maxDurability = 280;
  static durabilityCostPerUnit = 1;
}
