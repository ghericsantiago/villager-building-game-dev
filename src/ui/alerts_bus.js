const gameAlertListeners = new Set();

export function subscribeGameAlerts(listener) {
  if (typeof listener !== 'function') return () => {};
  gameAlertListeners.add(listener);
  return () => gameAlertListeners.delete(listener);
}

export function publishGameAlert(alert) {
  const payload = {
    level: 'warning',
    ttlMs: 0,
    trackIssue: false,
    ...alert
  };
  for (const listener of gameAlertListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('Alert listener failed', err);
    }
  }
}
