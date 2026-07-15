import { useCallback, useMemo, useState } from 'react';

function userKey(user) {
  return user?._id || user?.id || user?.email || user?.role || 'anonymous';
}

export function usePanelDismissals(user, panel) {
  const storageKey = `crm_panel_dismissals:${userKey(user)}:${panel}`;
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });

  const dismissed = useMemo(() => new Set(items), [items]);

  const dismiss = useCallback((id) => {
    const key = String(id || '');
    if (!key) return;
    setItems(prev => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const isDismissed = useCallback((id) => dismissed.has(String(id || '')), [dismissed]);

  return { dismiss, isDismissed };
}
