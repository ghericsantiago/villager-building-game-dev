import { Building } from '../building.js';

export class StockpileBuilding extends Building {
  constructor(x, y) {
    super('stockpile', x, y, {
      name: 'Stockpile',
      icon: '🪵',
      mapSymbol: 'P',
      blocksMovement: false
    });

    // Keep render props on the instance so this building can be themed or customized later.
    this.palette = {
      frame: '#6d4d30',
      fill: '#8c6642',
      stroke: '#4a311f',
      text: '#f0dfbf'
    };
  }
}
