import { initUI, startLoop, selectFirstNpc } from './ui.js';
import { game } from './gameState.js';

// entry
window.addEventListener('load', ()=>{
  initUI();
  selectFirstNpc();
  startLoop();
});
