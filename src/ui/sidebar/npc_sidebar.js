export function createNpcSidebarController(deps) {
  const {
    game,
    Task,
    npcSupportsJobs,
    getNpcJobsFor,
    npcDisplayName,
    formatTaskLabel,
    toolDisplayName,
    findNearestUnfinishedBuilding,
    findNearestResourceOfType,
    hideNpcInfo,
    getSelectedNpcId,
    setSelectedNpcId,
    focusCameraOnWorld
  } = deps;

  let npcListEl = null;
  let npcSearchEl = null;
  let npcSortNameBtn = null;
  let npcListRenderSignature = '';
  let npcListRefreshDeferred = false;
  const npcDetailsOpenById = new Map();
  let npcSearchQuery = '';
  let npcSortDir = 'asc';

  function normalizeNpcSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function npcNameOf(npc) {
    return String(npcDisplayName(npc) || '').trim();
  }

  function matchesNpcSearch(npc) {
    if (!npcSearchQuery) return true;
    const haystack = `${npcNameOf(npc)} ${npc.job || 'none'} ${npc.id}`.toLowerCase();
    return haystack.includes(npcSearchQuery);
  }

  function compareNpcByName(a, b) {
    const cmp = npcNameOf(a).localeCompare(npcNameOf(b));
    return npcSortDir === 'asc' ? cmp : -cmp;
  }

  function updateNpcSortHeadUI() {
    if (!npcSortNameBtn) return;
    npcSortNameBtn.classList.add('active');
    npcSortNameBtn.textContent = `Name${npcSortDir === 'asc' ? ' ▲' : ' ▼'}`;
  }

  function toggleNpcSortByName() {
    npcSortDir = npcSortDir === 'asc' ? 'desc' : 'asc';
    updateNpcSortHeadUI();
    refresh();
  }

  function isJobSelectFocused() {
    const active = document.activeElement;
    return !!(active && active.classList && active.classList.contains('npc-job-select'));
  }

  function isNpcDetailsOpen(npcId) {
    return npcDetailsOpenById.get(npcId) !== false;
  }

  function refresh() {
    if (!npcListEl) return;
    // Avoid replacing the active <select> while the user is interacting with it.
    if (isJobSelectFocused()) {
      npcListRefreshDeferred = true;
      return;
    }

    const selectedNpcId = getSelectedNpcId();
    const visibleNpcs = game.npcs.filter(matchesNpcSearch).sort(compareNpcByName);
    const signature = JSON.stringify({
      selectedNpcId,
      npcSearchQuery,
      npcSortDir,
      npcs: visibleNpcs.map(n => ({
        id: n.id,
        detailsOpen: n.id === selectedNpcId ? isNpcDetailsOpen(n.id) : undefined,
        job: n.job || 'none',
        carry: n.totalCarry(),
        capacity: n.capacity,
        currentTask: n.currentTask ? { kind: n.currentTask.kind, target: n.currentTask.target } : null,
        tools: Object.values(n.tools || {}).map(t => ({ key: t.key, durability: t.durability })),
        queued: n.tasks.map(t => ({ kind: t.kind, target: t.target }))
      }))
    });
    if (signature === npcListRenderSignature) {
      hideNpcInfo();
      return;
    }
    npcListRenderSignature = signature;

    npcListEl.innerHTML = '';
  visibleNpcs.forEach(n => {
      const isSelected = n.id === selectedNpcId;
      const div = document.createElement('div');
      div.className = 'npc-item' + (isSelected ? ' selected' : '');
      const headerRow = document.createElement('div');
      headerRow.className = 'npc-header-row';
      const header = document.createElement('div');
      header.className = 'npc-header';
      header.textContent = npcDisplayName(n);
      header.style.fontSize = '12px';
      headerRow.appendChild(header);
      if (isSelected) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'npc-info-toggle-btn';
        const detailsOpen = isNpcDetailsOpen(n.id);
        toggleBtn.textContent = detailsOpen ? 'Hide info' : 'Show info';
        toggleBtn.onclick = (e) => {
          e.stopPropagation();
          npcDetailsOpenById.set(n.id, !detailsOpen);
          refresh();
        };
        headerRow.appendChild(toggleBtn);
      }
      div.appendChild(headerRow);

      // show only current task inline (compact)
      if (n.currentTask) {
        const ct = document.createElement('div');
        ct.className = 'npc-current';
        ct.style.marginTop = '4px';
        const label = document.createElement('div');
        label.className = 'task-label';
        label.style.flex = '1';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        label.innerHTML = formatTaskLabel(n.currentTask);
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'npc-cancel-btn';
        cancelBtn.title = 'Cancel current task';
        cancelBtn.innerHTML = '✖';
        cancelBtn.onclick = (e) => {
          e.stopPropagation();
          n.currentTask = null;
          n.target = null;
          refresh();
        };
        ct.style.display = 'flex';
        ct.style.alignItems = 'center';
        ct.style.gap = '8px';
        ct.appendChild(label);
        ct.appendChild(cancelBtn);
        div.appendChild(ct);
      }

      if (isSelected && isNpcDetailsOpen(n.id)) {
        const details = document.createElement('div');
        details.className = 'npc-details';

        if (npcSupportsJobs(n)) {
          const jobRow = document.createElement('div');
          jobRow.className = 'npc-job-row';
          const jobLabel = document.createElement('label');
          jobLabel.className = 'npc-job-label';
          jobLabel.textContent = 'Job';
          jobLabel.setAttribute('for', `npc-job-${n.id}`);
          const jobSelect = document.createElement('select');
          jobSelect.id = `npc-job-${n.id}`;
          jobSelect.className = 'npc-job-select';
          for (const job of getNpcJobsFor(n)) {
            const option = document.createElement('option');
            option.value = job.key;
            option.textContent = job.label;
            if ((n.job || 'none') === job.key) option.selected = true;
            jobSelect.appendChild(option);
          }
          jobSelect.addEventListener('mousedown', (e) => e.stopPropagation());
          jobSelect.addEventListener('click', (e) => e.stopPropagation());
          jobSelect.addEventListener('focus', () => {
            npcListRefreshDeferred = false;
          });
          jobSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const newJob = jobSelect.value;
            n.job = newJob;
            // Switch jobs immediately: clear active/queued work and start new gather loop.
            n.tasks = [];
            n.currentTask = null;
            n.target = null;
            n.gatherProgress = 0;
            n.buildProgress = 0;
            if (newJob === 'builder') {
              const site = findNearestUnfinishedBuilding(n);
              if (site) {
                n.currentTask = new Task('buildBuilding', site);
                n.target = site;
              } else {
                n.currentTask = null;
                n.target = null;
              }
            } else if (newJob !== 'none') {
              n.currentTask = new Task('gatherType', newJob);
              n.target = findNearestResourceOfType(n, newJob);
            }
            refresh();
          });
          jobSelect.addEventListener('blur', () => {
            if (npcListRefreshDeferred) {
              npcListRefreshDeferred = false;
              refresh();
            }
          });
          jobRow.appendChild(jobLabel);
          jobRow.appendChild(jobSelect);
          details.appendChild(jobRow);
        }

        const carryWrap = document.createElement('div');
        carryWrap.style.marginTop = '6px';
        const carryTitle = document.createElement('div');
        carryTitle.style.fontWeight = '700';
        carryTitle.style.fontSize = '12px';
        carryTitle.textContent = `Carry ${n.totalCarry()}/${n.capacity}`;
        carryWrap.appendChild(carryTitle);
        details.appendChild(carryWrap);

        const toolEntries = Object.values(n.tools || {}).filter(Boolean);
        if (toolEntries.length) {
          const toolWrap = document.createElement('div');
          toolWrap.style.marginTop = '8px';
          const toolTitle = document.createElement('div');
          toolTitle.style.fontWeight = '700';
          toolTitle.style.fontSize = '12px';
          toolTitle.textContent = 'Tools';
          toolWrap.appendChild(toolTitle);
          for (const t of toolEntries) {
            const row = document.createElement('div');
            row.style.fontSize = '11px';
            row.style.opacity = Number(t.durability || 0) > 0 ? '0.95' : '0.75';
            row.textContent = `${toolDisplayName(t.key)} ${Math.max(0, Math.round(t.durability || 0))}/${Math.max(1, Math.round(t.maxDurability || 1))}`;
            toolWrap.appendChild(row);
          }
          details.appendChild(toolWrap);
        }

        const queuedWrap = document.createElement('div');
        queuedWrap.style.marginTop = '8px';
        const qTitle = document.createElement('div');
        qTitle.style.fontWeight = '700';
        qTitle.style.fontSize = '12px';
        qTitle.textContent = 'Queued';
        queuedWrap.appendChild(qTitle);
        if (n.tasks.length === 0) {
          const none = document.createElement('div');
          none.style.color = 'var(--muted)';
          none.style.fontSize = '12px';
          none.textContent = '(none)';
          queuedWrap.appendChild(none);
        } else {
          n.tasks.forEach(t => {
            const tr = document.createElement('div');
            tr.style.marginTop = '6px';
            tr.innerHTML = formatTaskLabel(t);
            queuedWrap.appendChild(tr);
          });
        }
        details.appendChild(queuedWrap);
        div.appendChild(details);
      }

      div.onclick = () => {
        setSelectedNpcId(n.id);
        focusCameraOnWorld(n.x, n.y);
        refresh();
      };
      npcListEl.appendChild(div);
    });

    hideNpcInfo();
  }

  function init(elements) {
    npcListEl = elements.npcListEl || null;
    npcSearchEl = elements.npcSearchEl || null;
    npcSortNameBtn = elements.npcSortNameBtn || null;

    if (npcSearchEl) {
      npcSearchEl.addEventListener('input', () => {
        npcSearchQuery = normalizeNpcSearch(npcSearchEl.value);
        refresh();
      });
    }
    if (npcSortNameBtn) npcSortNameBtn.addEventListener('click', toggleNpcSortByName);
    updateNpcSortHeadUI();
  }

  return {
    init,
    refresh
  };
}
