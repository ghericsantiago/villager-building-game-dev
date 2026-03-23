export function initSidebarTabs() {
  const menu = document.getElementById('sidebarMenu');
  if (!menu) return;
  const buttons = Array.from(menu.querySelectorAll('.menu-btn'));
  const panels = buttons
    .map(btn => document.getElementById(btn.dataset.panel))
    .filter(Boolean);

  function setActive(panelId) {
    for (const btn of buttons) {
      const active = btn.dataset.panel === panelId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of panels) {
      panel.classList.toggle('active', panel.id === panelId);
    }
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => setActive(btn.dataset.panel));
  }

  const activeBtn = buttons.find(b => b.classList.contains('active')) || buttons[0];
  if (activeBtn) setActive(activeBtn.dataset.panel);
}
