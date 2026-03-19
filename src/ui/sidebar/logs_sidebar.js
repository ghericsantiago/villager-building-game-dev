function toClockString(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function createLogsSidebarController() {
  let logsListEl = null;
  const issuesByKey = new Map();

  function normalizeIssueKey(alert) {
    const fallback = `${alert.level || 'warning'}:${alert.title || ''}:${alert.message || ''}`;
    return String(alert.issueKey || alert.uniqueKey || alert.dedupeKey || fallback).trim();
  }

  function ingestAlert(alert = {}) {
    if (!alert || !alert.trackIssue) return;
    const level = String(alert.level || 'warning').toLowerCase();
    const key = normalizeIssueKey(alert);
    if (!key) return;

    const now = Date.now();
    const existing = issuesByKey.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      existing.count += 1;
      existing.message = String(alert.message || existing.message || '');
      existing.title = String(alert.title || existing.title || 'Warning');
      existing.level = level;
      if (typeof alert.resolveWhen === 'function') existing.resolveWhen = alert.resolveWhen;
    } else {
      issuesByKey.set(key, {
        key,
        level,
        title: String(alert.title || 'Warning'),
        message: String(alert.message || ''),
        createdAt: now,
        lastSeenAt: now,
        count: 1,
        resolveWhen: (typeof alert.resolveWhen === 'function') ? alert.resolveWhen : null
      });
    }

    refresh();
  }

  function tickResolve() {
    let changed = false;
    for (const [key, issue] of issuesByKey.entries()) {
      if (typeof issue.resolveWhen !== 'function') continue;
      let resolved = false;
      try {
        resolved = !!issue.resolveWhen();
      } catch (err) {
        resolved = false;
      }
      if (resolved) {
        issuesByKey.delete(key);
        changed = true;
      }
    }
    if (changed) refresh();
  }

  function refresh() {
    if (!logsListEl) return;
    const entries = Array.from(issuesByKey.values())
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    if (entries.length === 0) {
      logsListEl.innerHTML = '<div class="log-empty">No active issues.</div>';
      return;
    }

    logsListEl.innerHTML = entries.map(issue => {
      const repeatText = issue.count > 1 ? `<span class="log-repeat">x${issue.count}</span>` : '';
      return `<div class="log-item log-item-${escapeHtml(issue.level)}"><div class="log-head"><span class="log-level">${escapeHtml(issue.level.toUpperCase())}</span><span class="log-time">${toClockString(issue.lastSeenAt)}</span>${repeatText}</div><div class="log-title">${escapeHtml(issue.title)}</div><div class="log-msg">${escapeHtml(issue.message)}</div></div>`;
    }).join('');
  }

  function init(elements) {
    logsListEl = elements.logsListEl || null;
    refresh();
  }

  return {
    init,
    ingestAlert,
    tickResolve,
    refresh
  };
}
