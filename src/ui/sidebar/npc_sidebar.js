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
    focusCameraOnWorld,
    onQueueMarkedResources,
    getMarkedResourceCount
  } = deps;

  let npcListSectionEl = null;
  let npcListEl = null;
  let npcSearchEl = null;
  let npcSortNameBtn = null;
  let npcSelectedPanelEl = null;
  let npcSelectedSummaryEl = null;
  let npcSelectedActionsEl = null;
  let npcSelectedSettingsEl = null;

  let npcListRenderSignature = '';
  let npcListRefreshDeferred = false;
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

  function renderSelectedNpcSummary(npc) {
    if (!npcSelectedSummaryEl) return;
    if (!npc) {
      npcSelectedSummaryEl.innerHTML = '';
      return;
    }

    npcSelectedSummaryEl.innerHTML = `
      <div class="npc-selected-title">${npcDisplayName(npc)}</div>
      <div class="npc-selected-meta">Villager Profile</div>
    `;
  }

  function formatAttributes(attrs) {
    if (!attrs || typeof attrs !== 'object') return '(none)';
    const entries = Object.entries(attrs)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => `${key}: ${Math.max(1, Math.round(Number(value)))}`);
    return entries.length ? entries.join(' | ') : '(none)';
  }

  function renderSelectedNpcActions(npc) {
    if (!npcSelectedActionsEl) return;
    npcSelectedActionsEl.innerHTML = '';
    if (!npc) return;

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'npc-back-btn';
    backBtn.textContent = '←';
    backBtn.title = 'Back to Villagers';
    backBtn.setAttribute('aria-label', 'Back to Villagers');
    backBtn.addEventListener('click', () => {
      setSelectedNpcId(null);
      refresh();
    });
    npcSelectedActionsEl.appendChild(backBtn);

    const queueMarkedBtn = document.createElement('button');
    queueMarkedBtn.type = 'button';
    queueMarkedBtn.className = 'npc-queue-marked-btn';
    queueMarkedBtn.textContent = '➕';
    const markedCount = Math.max(0, Number((typeof getMarkedResourceCount === 'function') ? getMarkedResourceCount() : 0) || 0);
    queueMarkedBtn.title = markedCount > 0
      ? `Queue ${markedCount} marked resource${markedCount === 1 ? '' : 's'}`
      : 'Queue marked resources (Shift+Left Click resources to mark)';
    queueMarkedBtn.setAttribute('aria-label', 'Queue marked resources');
    queueMarkedBtn.disabled = markedCount <= 0;
    queueMarkedBtn.addEventListener('click', () => {
      if (typeof onQueueMarkedResources === 'function') onQueueMarkedResources();
    });
    npcSelectedActionsEl.appendChild(queueMarkedBtn);
  }

  function renderSelectedNpcSettings(npc) {
    if (!npcSelectedSettingsEl) return;
    npcSelectedSettingsEl.innerHTML = '';
    if (!npc) return;

    const settings = document.createElement('div');
    settings.className = 'npc-settings-wrap';

    const sectionInfo = document.createElement('div');
    sectionInfo.className = 'npc-settings-section';
    sectionInfo.innerHTML = `
      <div class="npc-settings-title">NPC Information</div>
      <div class="npc-settings-line"><strong>Name:</strong> ${npcDisplayName(npc)}</div>
      <div class="npc-settings-line"><strong>Age:</strong> ${Math.max(16, Math.round(Number(npc.age) || 0))}</div>
      <div class="npc-settings-line"><strong>Attributes:</strong> ${formatAttributes(npc.attributes)}</div>
    `;
    settings.appendChild(sectionInfo);

    const toolEntries = Object.values(npc.tools || {}).filter(Boolean);
    const armorEntries = Array.isArray(npc.armors) ? npc.armors : [];
    const weaponEntries = Array.isArray(npc.weapons) ? npc.weapons : [];
    const sectionInventory = document.createElement('div');
    sectionInventory.className = 'npc-settings-section';
    sectionInventory.innerHTML = `<div class="npc-settings-title">Inventory</div><div class="npc-settings-line"><strong>Carry:</strong> ${npc.totalCarry()}/${npc.capacity}</div>`;

    const toolsTitle = document.createElement('div');
    toolsTitle.className = 'npc-settings-title npc-subtitle';
    toolsTitle.textContent = 'Tools';
    sectionInventory.appendChild(toolsTitle);
    if (!toolEntries.length) {
      const none = document.createElement('div');
      none.className = 'npc-settings-line';
      none.textContent = '(none)';
      sectionInventory.appendChild(none);
    } else {
      for (const tool of toolEntries) {
        const line = document.createElement('div');
        line.className = 'npc-settings-line';
        line.textContent = `${toolDisplayName(tool.key)} ${Math.max(0, Math.round(tool.durability || 0))}/${Math.max(1, Math.round(tool.maxDurability || 1))}`;
        sectionInventory.appendChild(line);
      }
    }

    const armorsTitle = document.createElement('div');
    armorsTitle.className = 'npc-settings-title npc-subtitle';
    armorsTitle.textContent = 'Armors';
    sectionInventory.appendChild(armorsTitle);
    const armorsLine = document.createElement('div');
    armorsLine.className = 'npc-settings-line';
    armorsLine.textContent = armorEntries.length ? armorEntries.join(', ') : '(none yet)';
    sectionInventory.appendChild(armorsLine);

    const weaponsTitle = document.createElement('div');
    weaponsTitle.className = 'npc-settings-title npc-subtitle';
    weaponsTitle.textContent = 'Weapons';
    sectionInventory.appendChild(weaponsTitle);
    const weaponsLine = document.createElement('div');
    weaponsLine.className = 'npc-settings-line';
    weaponsLine.textContent = weaponEntries.length ? weaponEntries.join(', ') : '(none yet)';
    sectionInventory.appendChild(weaponsLine);

    settings.appendChild(sectionInventory);

    const sectionWork = document.createElement('div');
    sectionWork.className = 'npc-settings-section';
    sectionWork.innerHTML = '<div class="npc-settings-title">Work</div>';

    if (npcSupportsJobs(npc)) {
      const jobRow = document.createElement('div');
      jobRow.className = 'npc-job-row';
      const jobLabel = document.createElement('label');
      jobLabel.className = 'npc-job-label';
      jobLabel.textContent = 'Job';
      jobLabel.setAttribute('for', `npc-job-${npc.id}`);
      const jobSelect = document.createElement('select');
      jobSelect.id = `npc-job-${npc.id}`;
      jobSelect.className = 'npc-job-select';
      for (const job of getNpcJobsFor(npc)) {
        const option = document.createElement('option');
        option.value = job.key;
        option.textContent = job.label;
        if ((npc.job || 'none') === job.key) option.selected = true;
        jobSelect.appendChild(option);
      }
      jobSelect.addEventListener('change', () => {
        const newJob = jobSelect.value;
        npc.job = newJob;
        npc.tasks = [];
        npc.currentTask = null;
        npc.target = null;
        npc.gatherProgress = 0;
        npc.buildProgress = 0;

        if (newJob === 'builder') {
          const site = findNearestUnfinishedBuilding(npc);
          if (site) {
            npc.currentTask = new Task('buildBuilding', site);
            npc.target = site;
          }
        } else if (newJob !== 'none') {
          npc.currentTask = new Task('gatherType', newJob);
          npc.target = findNearestResourceOfType(npc, newJob);
        }

        refresh();
      });
      jobRow.appendChild(jobLabel);
      jobRow.appendChild(jobSelect);
      sectionWork.appendChild(jobRow);
    }
    settings.appendChild(sectionWork);

    const sectionQueued = document.createElement('div');
    sectionQueued.className = 'npc-settings-section';
    const queuedTitle = document.createElement('div');
    queuedTitle.className = 'npc-settings-title';
    queuedTitle.textContent = 'Queued';
    sectionQueued.appendChild(queuedTitle);

    const hasQueuedOnly = npc.tasks.length > 0;
    if (hasQueuedOnly) {
      const cancelAllBtn = document.createElement('button');
      cancelAllBtn.type = 'button';
      cancelAllBtn.className = 'npc-queue-clear-btn';
      cancelAllBtn.textContent = 'Cancel All Queue';
      cancelAllBtn.title = 'Remove all queued tasks';
      cancelAllBtn.addEventListener('click', () => {
        const activeTask = npc.currentTask || null;
        const activeTarget = npc.target || null;

        // Clear only future queued work; keep the active task running.
        npc.tasks = Array.isArray(npc.tasks)
          ? npc.tasks.filter(task => task === activeTask)
          : [];

        if (activeTask) {
          npc.currentTask = activeTask;
          if (!npc.target && activeTarget) npc.target = activeTarget;
        }
        refresh();
      });
      sectionQueued.appendChild(cancelAllBtn);
    }

    const hasCurrent = !!npc.currentTask;
    const hasQueued = npc.tasks.length > 0;

    if (!hasCurrent && !hasQueued) {
      const none = document.createElement('div');
      none.className = 'npc-settings-line';
      none.textContent = '(none)';
      sectionQueued.appendChild(none);
    } else {
      if (hasCurrent) {
        const currentRow = document.createElement('div');
        currentRow.className = 'npc-current-task-row';

        const currentLine = document.createElement('div');
        currentLine.className = 'npc-settings-line';
        currentLine.innerHTML = `<strong>Current:</strong> ${formatTaskLabel(npc.currentTask)}`;
        currentRow.appendChild(currentLine);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'npc-task-cancel-btn';
        cancelBtn.title = 'Cancel current task';
        cancelBtn.setAttribute('aria-label', 'Cancel current task');
        cancelBtn.innerHTML = '✖';
        cancelBtn.addEventListener('click', () => {
          npc.currentTask = null;
          npc.target = null;
          refresh();
        });
        currentRow.appendChild(cancelBtn);

        sectionQueued.appendChild(currentRow);
      }

      for (const t of npc.tasks) {
        const line = document.createElement('div');
        line.className = 'npc-settings-line';
        line.innerHTML = formatTaskLabel(t);
        sectionQueued.appendChild(line);
      }
    }

    settings.appendChild(sectionQueued);
    npcSelectedSettingsEl.appendChild(settings);
  }

  function renderNpcList(visibleNpcs) {
    if (!npcListEl) return;
    npcListEl.innerHTML = '';

    for (const npc of visibleNpcs) {
      const div = document.createElement('div');
      div.className = 'npc-item';

      const header = document.createElement('div');
      header.className = 'npc-header';
      header.textContent = npcDisplayName(npc);
      header.style.fontSize = '12px';
      div.appendChild(header);

      if (npc.currentTask) {
        const ct = document.createElement('div');
        ct.className = 'npc-current';
        ct.style.marginTop = '4px';
        const label = document.createElement('div');
        label.className = 'task-label';
        label.style.flex = '1';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.whiteSpace = 'nowrap';
        label.innerHTML = formatTaskLabel(npc.currentTask);
        ct.appendChild(label);
        div.appendChild(ct);
      }

      div.addEventListener('click', () => {
        setSelectedNpcId(npc.id);
        focusCameraOnWorld(npc.x, npc.y);
        refresh();
      });

      npcListEl.appendChild(div);
    }
  }

  function refresh() {
    if (!npcListEl) return;

    if (isJobSelectFocused()) {
      npcListRefreshDeferred = true;
      return;
    }

    const selectedNpcId = getSelectedNpcId();
    const selectedNpc = game.npcs.find(n => n.id === selectedNpcId) || null;
    const visibleNpcs = game.npcs.filter(matchesNpcSearch).sort(compareNpcByName);

    const signature = JSON.stringify({
      selectedNpcId,
      npcSearchQuery,
      npcSortDir,
      selectedNpc: selectedNpc ? {
        id: selectedNpc.id,
        age: selectedNpc.age,
        attributes: selectedNpc.attributes,
        job: selectedNpc.job || 'none',
        carry: selectedNpc.totalCarry(),
        capacity: selectedNpc.capacity,
        currentTask: selectedNpc.currentTask ? { kind: selectedNpc.currentTask.kind, target: selectedNpc.currentTask.target } : null,
        tools: Object.values(selectedNpc.tools || {}).map(t => ({ key: t.key, durability: t.durability })),
        armors: Array.isArray(selectedNpc.armors) ? [...selectedNpc.armors] : [],
        weapons: Array.isArray(selectedNpc.weapons) ? [...selectedNpc.weapons] : [],
        queued: selectedNpc.tasks.map(t => ({ kind: t.kind, target: t.target }))
      } : null,
      visibleNpcs: visibleNpcs.map(n => ({
        id: n.id,
        name: npcNameOf(n),
        task: n.currentTask ? { kind: n.currentTask.kind, target: n.currentTask.target } : null
      }))
    });

    if (signature === npcListRenderSignature) {
      hideNpcInfo();
      return;
    }
    npcListRenderSignature = signature;

    const hasSelection = !!selectedNpc;
    if (npcListSectionEl) npcListSectionEl.classList.toggle('hidden', hasSelection);
    if (npcSelectedPanelEl) npcSelectedPanelEl.classList.toggle('active', hasSelection);

    if (hasSelection) {
      renderSelectedNpcSummary(selectedNpc);
      renderSelectedNpcActions(selectedNpc);
      renderSelectedNpcSettings(selectedNpc);
    } else {
      if (npcSelectedSummaryEl) npcSelectedSummaryEl.innerHTML = '';
      if (npcSelectedActionsEl) npcSelectedActionsEl.innerHTML = '';
      if (npcSelectedSettingsEl) npcSelectedSettingsEl.innerHTML = '';
      renderNpcList(visibleNpcs);
    }

    hideNpcInfo();
  }

  function init(elements) {
    npcListSectionEl = elements.npcListSectionEl || null;
    npcListEl = elements.npcListEl || null;
    npcSearchEl = elements.npcSearchEl || null;
    npcSortNameBtn = elements.npcSortNameBtn || null;
    npcSelectedPanelEl = elements.npcSelectedPanelEl || null;
    npcSelectedSummaryEl = elements.npcSelectedSummaryEl || null;
    npcSelectedActionsEl = elements.npcSelectedActionsEl || null;
    npcSelectedSettingsEl = elements.npcSelectedSettingsEl || null;

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
