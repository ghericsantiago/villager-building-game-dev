import { initUI, startLoop, selectFirstNpc } from './ui.js';
import { game } from './gameState.js';

function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return Promise.resolve(false);

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(value)
      .then(() => true)
      .catch(() => false);
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve(!!ok);
  } catch {
    return Promise.resolve(false);
  }
}

// entry
window.addEventListener('load', ()=>{
  console.log(`[Map Seed] ${game.mapSeed}`);
  const seedBadge = document.getElementById('mapSeedBadge');
  const seedBadgeWrap = document.getElementById('mapSeedBadgeWrap');
  if (seedBadge) {
    seedBadge.textContent = game.mapSeed;
  }
  if (seedBadgeWrap) {
    seedBadgeWrap.setAttribute('title', 'Click to copy seed. Use ?seed=<value> in URL to replay.');
    seedBadgeWrap.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(game.mapSeed);
      seedBadgeWrap.classList.toggle('copied', copied);
      seedBadgeWrap.setAttribute('title', copied ? 'Copied seed to clipboard.' : 'Copy failed. You can still select and copy manually.');
      window.setTimeout(() => {
        seedBadgeWrap.classList.remove('copied');
        seedBadgeWrap.setAttribute('title', 'Click to copy seed. Use ?seed=<value> in URL to replay.');
      }, 1000);
    });
  }
  initUI();
  selectFirstNpc({ activateTab: false });
  startLoop();
});
