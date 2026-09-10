import { OPERATION_HISTORY_KEY, RESOLVED_STATES, TERMINAL_STATES, pruneOperations, sanitizeOperation } from './operationModel';

export function createOperationStore({ storage, now = Date.now }) {
  let entries = [];
  let loading;
  let writes = Promise.resolve();
  let persistenceError = false;
  let readFailed = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  const persist = () => {
    if (readFailed) return Promise.reject(new Error('Activity history could not be recovered'));
    const serialized = JSON.stringify(entries);
    const write = writes.catch(() => {}).then(() => storage.setItem(OPERATION_HISTORY_KEY, serialized));
    writes = write;
    return write.then(() => { if (persistenceError) { persistenceError = false; emit(); } }, (error) => {
      persistenceError = true;
      emit();
      throw error;
    });
  };
  const hydrate = () => {
    loading ||= (async () => {
      try {
        const raw = await storage.getItem(OPERATION_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw new Error('Invalid activity history');
        entries = pruneOperations(parsed.map(sanitizeOperation).filter(Boolean).map((entry) => (
          entry.source === 'action' && !TERMINAL_STATES.has(entry.status)
            ? { ...entry, status: 'uncertain', stage: 'uncertain', acknowledged: false,
                message: 'האפליקציה נסגרה לפני שהתקבל אישור. בדקו את הפריט לפני ניסיון נוסף.' }
            : entry
        )), now());
      } catch {
        persistenceError = true;
        readFailed = true;
      }
      emit();
    })();
    return loading;
  };
  const update = async (value, { durable = true } = {}) => {
    await hydrate();
    const previous = entries.find((entry) => entry.id === value.id && entry.ownerUid === value.ownerUid);
    const next = sanitizeOperation({ ...previous, createdAt: previous?.createdAt || now(), updatedAt: now(), ...value });
    if (!next) return null;
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return previous;
    entries = pruneOperations([next, ...entries.filter((entry) => entry.id !== next.id || entry.ownerUid !== next.ownerUid)], now());
    emit();
    if (durable) await persist();
    return next;
  };
  return {
    hydrate, update,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => entries,
    hasPersistenceError: () => persistenceError,
    async remove(id, ownerUid) {
      await hydrate();
      entries = entries.filter((entry) => entry.id !== id || entry.ownerUid !== ownerUid);
      emit();
      await persist();
    },
    async acknowledge(id, ownerUid) {
      const entry = entries.find((value) => value.id === id && value.ownerUid === ownerUid);
      if (entry) await update({ ...entry, acknowledged: true });
    },
    async clearResolved(ownerUid) {
      await hydrate();
      entries = entries.filter((entry) => entry.ownerUid !== ownerUid || !RESOLVED_STATES.has(entry.status));
      emit();
      await persist();
    },
    flush: () => writes,
  };
}
