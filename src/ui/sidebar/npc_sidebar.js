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
    getMarkedResourceCount,
    getGlobalQueuedResourceCount,
    isGlobalQueueCancelModeEnabled,
    setGlobalQueueCancelModeEnabled
  } = deps;

  let npcListSectionEl = null;
  let npcGlobalQueueSectionEl = null;
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
  let jobPickerNpcId = null;

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

    const strength = Math.max(1, Math.round(Number(npc.attributes?.strength) || 0));
    const agility = Math.max(1, Math.round(Number(npc.attributes?.agility) || 0));
    const intelligence = Math.max(1, Math.round(Number(npc.attributes?.intelligence) || 0));

    npcSelectedSummaryEl.innerHTML = `
      <div class="npc-selected-title">${npcDisplayName(npc)}</div>
      <div class="npc-selected-meta">Villager Profile</div>
      <div class="npc-summary-info">
        <div class="npc-settings-title">NPC Information</div>
        <div class="npc-info-grid">
          <div class="npc-info-cell"><strong>Age:</strong> ${Math.max(16, Math.round(Number(npc.age) || 0))}</div>
          <div class="npc-info-cell"><strong>Future:</strong> (coming soon)</div>
          <div class="npc-info-cell"><strong>Strength:</strong> ${strength}</div>
          <div class="npc-info-cell"><strong>Agility:</strong> ${agility}</div>
          <div class="npc-info-cell npc-info-cell-full"><strong>Intelligence:</strong> ${intelligence}</div>
        </div>
      </div>
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
    settings.className = 'npc-settings-stack';

    const toolEntries = Object.values(npc.tools || {}).filter(Boolean);
    const armorEntries = Array.isArray(npc.armors) ? npc.armors : [];
    const weaponEntries = Array.isArray(npc.weapons) ? npc.weapons : [];
    const sectionInventory = document.createElement('div');
    sectionInventory.className = 'npc-settings-section';
    sectionInventory.innerHTML = `<div class="npc-settings-title">Inventory</div>`;

    const inventoryGrid = document.createElement('div');
    inventoryGrid.className = 'npc-inventory-grid';
    const carryCell = document.createElement('div');
    carryCell.className = 'npc-inventory-cell';
    carryCell.innerHTML = `<strong>Carry:</strong> ${npc.totalCarry()}/${npc.capacity}`;
    inventoryGrid.appendChild(carryCell);
    const freeCell = document.createElement('div');
    freeCell.className = 'npc-inventory-cell';
    freeCell.innerHTML = `<strong>Free:</strong> ${Math.max(0, npc.capacity - npc.totalCarry())}`;
    inventoryGrid.appendChild(freeCell);
    sectionInventory.appendChild(inventoryGrid);

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
      const toolsGrid = document.createElement('div');
      toolsGrid.className = 'npc-inventory-grid';
      for (const tool of toolEntries) {
        const line = document.createElement('div');
        line.className = 'npc-inventory-cell';
        line.textContent = `${toolDisplayName(tool.key)} ${Math.max(0, Math.round(tool.durability || 0))}/${Math.max(1, Math.round(tool.maxDurability || 1))}`;
        toolsGrid.appendChild(line);
      }
      sectionInventory.appendChild(toolsGrid);
    }

    const armorsTitle = document.createElement('div');
    armorsTitle.className = 'npc-settings-title npc-subtitle';
    armorsTitle.textContent = 'Armors';
    sectionInventory.appendChild(armorsTitle);
    const armorsLine = document.createElement('div');
    armorsLine.className = 'npc-inventory-cell npc-info-cell-full';
    armorsLine.textContent = armorEntries.length ? armorEntries.join(', ') : '(none yet)';
    sectionInventory.appendChild(armorsLine);

    const weaponsTitle = document.createElement('div');
    weaponsTitle.className = 'npc-settings-title npc-subtitle';
    weaponsTitle.textContent = 'Weapons';
    sectionInventory.appendChild(weaponsTitle);
    const weaponsLine = document.createElement('div');
    weaponsLine.className = 'npc-inventory-cell npc-info-cell-full';
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
        applyNpcJobChange(npc, jobSelect.value);
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

    const hasAnyQueuedWork = !!npc.currentTask || npc.tasks.length > 0;
    if (hasAnyQueuedWork) {
      const cancelAllBtn = document.createElement('button');
      cancelAllBtn.type = 'button';
      cancelAllBtn.className = 'npc-queue-clear-btn';
      cancelAllBtn.textContent = 'Cancel All Queue';
      cancelAllBtn.title = 'Cancel current and queued tasks';
      cancelAllBtn.addEventListener('click', () => {
        npc.tasks = [];
        npc.currentTask = null;
        npc.target = null;
        refresh();
      });
      sectionQueued.appendChild(cancelAllBtn);
    }

    const hasCurrent = !!npc.currentTask;
    const hasQueued = npc.tasks.length > 0;

    const queueList = document.createElement('div');
    queueList.className = 'npc-queue-list';

    if (!hasCurrent && !hasQueued) {
      const none = document.createElement('div');
      none.className = 'npc-settings-line';
      none.textContent = '(none)';
      queueList.appendChild(none);
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

        queueList.appendChild(currentRow);
      }

      for (let i = 0; i < npc.tasks.length; i++) {
        const t = npc.tasks[i];
        const row = document.createElement('div');
        row.className = 'npc-queued-task-row';

        const line = document.createElement('div');
        line.className = 'npc-settings-line';
        line.innerHTML = formatTaskLabel(t);
        row.appendChild(line);

        const controls = document.createElement('div');
        controls.className = 'npc-queued-task-controls';

        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'task-btn';
        upBtn.title = i === 0 && hasCurrent ? 'Swap with current task' : 'Move up';
        upBtn.setAttribute('aria-label', 'Move up');
        upBtn.textContent = '↑';
        upBtn.disabled = i === 0 && !hasCurrent;
        upBtn.addEventListener('click', () => {
          if (i === 0) {
            if (!npc.currentTask) return;
            const firstQueued = npc.tasks[0];
            const previousCurrent = npc.currentTask;
            npc.currentTask = firstQueued;
            npc.tasks[0] = previousCurrent;
            npc.target = typeof npc.resolveTaskTarget === 'function'
              ? npc.resolveTaskTarget(npc.currentTask, game)
              : npc.currentTask?.target || null;
            npc.gatherProgress = 0;
            npc.buildProgress = 0;
            refresh();
            return;
          }
          const prev = npc.tasks[i - 1];
          npc.tasks[i - 1] = npc.tasks[i];
          npc.tasks[i] = prev;
          refresh();
        });
        controls.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'task-btn';
        downBtn.title = 'Move down';
        downBtn.setAttribute('aria-label', 'Move down');
        downBtn.textContent = '↓';
        downBtn.disabled = i === npc.tasks.length - 1;
        downBtn.addEventListener('click', () => {
          if (i >= npc.tasks.length - 1) return;
          const next = npc.tasks[i + 1];
          npc.tasks[i + 1] = npc.tasks[i];
          npc.tasks[i] = next;
          refresh();
        });
        controls.appendChild(downBtn);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'task-btn task-remove';
        removeBtn.title = 'Remove task';
        removeBtn.setAttribute('aria-label', 'Remove task');
        removeBtn.textContent = '✖';
        removeBtn.addEventListener('click', () => {
          npc.tasks.splice(i, 1);
          refresh();
        });
        controls.appendChild(removeBtn);

        row.appendChild(controls);
        queueList.appendChild(row);
      }
    }

    sectionQueued.appendChild(queueList);

    settings.appendChild(sectionQueued);
    npcSelectedSettingsEl.appendChild(settings);
  }

  function applyNpcJobChange(npc, newJob) {
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
  }

  function renderGlobalQueueSection() {
    if (!npcGlobalQueueSectionEl) return;
    npcGlobalQueueSectionEl.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'npc-settings-title';
    title.textContent = 'Global Queue';
    npcGlobalQueueSectionEl.appendChild(title);

    const cancelRow = document.createElement('div');
    cancelRow.className = 'npc-toggle-row';
    const cancelOn = !!(typeof isGlobalQueueCancelModeEnabled === 'function' && isGlobalQueueCancelModeEnabled());
    const cancelToggle = document.createElement('button');
    cancelToggle.type = 'button';
    cancelToggle.className = `npc-toggle-btn ${cancelOn ? 'active' : ''}`;
    cancelToggle.textContent = cancelOn ? '✖' : '🏗';
    cancelToggle.setAttribute('aria-pressed', cancelOn ? 'true' : 'false');
    cancelToggle.setAttribute('aria-label', cancelOn ? 'Cancel remove mode' : 'Enable remove mode');
    cancelToggle.addEventListener('click', () => {
      if (typeof setGlobalQueueCancelModeEnabled === 'function') {
        setGlobalQueueCancelModeEnabled(!cancelOn);
      }
      refresh();
    });
    cancelRow.appendChild(cancelToggle);
    npcGlobalQueueSectionEl.appendChild(cancelRow);
  }

  function renderNpcList(visibleNpcs) {
    if (!npcListEl) return;
    npcListEl.innerHTML = '';

    const jobIconByKey = {
      none: '🧭',
      builder: '🛠️',
      tree: '🌲',
      stone: '🪨',
      iron: '⛓️',
      copper: '🟠',
      gold: '🪙'
    };

    for (const npc of visibleNpcs) {
      const div = document.createElement('div');
      div.className = 'npc-item';

      const headerRow = document.createElement('div');
      headerRow.className = 'npc-header-row';

      const header = document.createElement('div');
      header.className = 'npc-header';
      header.textContent = npcDisplayName(npc);
      header.style.fontSize = '12px';
      headerRow.appendChild(header);

      const jobKey = String(npc.job || 'none');
      const jobMeta = getNpcJobsFor(npc).find(j => j.key === jobKey) || null;
      if (jobPickerNpcId === npc.id && npcSupportsJobs(npc)) {
        const inlineSelect = document.createElement('select');
        inlineSelect.className = 'npc-job-select npc-inline-job-select';
        inlineSelect.title = 'Choose job';
        for (const job of getNpcJobsFor(npc)) {
          const option = document.createElement('option');
          option.value = job.key;
          option.textContent = job.label;
          if ((npc.job || 'none') === job.key) option.selected = true;
          inlineSelect.appendChild(option);
        }
        inlineSelect.addEventListener('click', (ev) => ev.stopPropagation());
        inlineSelect.addEventListener('mousedown', (ev) => ev.stopPropagation());
        inlineSelect.addEventListener('change', () => {
          jobPickerNpcId = null;
          applyNpcJobChange(npc, inlineSelect.value);
        });
        inlineSelect.addEventListener('blur', () => {
          jobPickerNpcId = null;
          refresh();
        });
        headerRow.appendChild(inlineSelect);
        setTimeout(() => {
          if (document.body.contains(inlineSelect)) inlineSelect.focus();
        }, 0);
      } else {
        const jobBadge = document.createElement('button');
        jobBadge.type = 'button';
        jobBadge.className = 'npc-job-badge npc-job-badge-btn';
        jobBadge.title = `Job: ${jobMeta?.label || 'No Job (Manual)'} (click to change)`;
        jobBadge.setAttribute('aria-label', 'Change villager job');
        const jobIcon = document.createElement('span');
        jobIcon.className = 'npc-job-badge-icon';
        jobIcon.textContent = jobIconByKey[jobKey] || '🧭';
        const jobText = document.createElement('span');
        jobText.className = 'npc-job-badge-text';
        jobText.textContent = jobMeta?.label || 'No Job';
        jobBadge.appendChild(jobIcon);
        jobBadge.appendChild(jobText);
        jobBadge.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!npcSupportsJobs(npc)) return;
          jobPickerNpcId = npc.id;
          refresh();
        });
        headerRow.appendChild(jobBadge);
      }

      div.appendChild(headerRow);

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
        jobPickerNpcId = null;
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
    if (jobPickerNpcId && !game.npcs.some(n => n.id === jobPickerNpcId)) jobPickerNpcId = null;
    const selectedNpc = game.npcs.find(n => n.id === selectedNpcId) || null;
    const visibleNpcs = game.npcs.filter(matchesNpcSearch).sort(compareNpcByName);

    const signature = JSON.stringify({
      selectedNpcId,
      jobPickerNpcId,
      npcSearchQuery,
      npcSortDir,
      globalQueue: {
        count: Math.max(0, Number((typeof getGlobalQueuedResourceCount === 'function') ? getGlobalQueuedResourceCount() : 0) || 0),
        cancelMode: !!(typeof isGlobalQueueCancelModeEnabled === 'function' && isGlobalQueueCancelModeEnabled())
      },
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

    renderGlobalQueueSection();

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
    npcGlobalQueueSectionEl = elements.npcGlobalQueueSectionEl || null;
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
