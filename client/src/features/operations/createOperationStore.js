import { OPERATION_HISTORY_KEY, RESOLVED_STATES, TERMINAL_STATES, pruneOperations, sanitizeOperation } from './operationModel';

export function createOperationStore({ storage, now = Date.now }) {
  let entries = [];
  let loading;
  let writes = Promise.resolve();
  let mutations = Promise.resolve();
  let persistenceError = false;
  let readFailed = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((listener) => listener());
  // Serialize mutations as well as writes: a slow dismissal cannot overwrite a
  // newer producer update, and later snapshots cannot undo a durable dismissal.
  const enqueue = (work) => {
    const result = mutations.catch(() => {}).then(work);
    mutations = result;
    return result;
  };
  const withDismissal = (entry) => {
    const outcomes = entry.dismissedOutcomes;
    const dismissed = outcomes.includes(entry.status)
      || (!TERMINAL_STATES.has(entry.status) && outcomes.length > 0);
    return { ...entry, dismissed, acknowledged: dismissed || entry.acknowledged };
  };
  const persist = (snapshot = entries) => {
    if (readFailed) return Promise.reject(new Error('Activity history could not be recovered'));
    const serialized = JSON.stringify(snapshot);
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
        entries = pruneOperations(parsed.map(sanitizeOperation).filter(Boolean).map((entry) => {
          // Migrate previous locally dismissed outcomes without deleting history.
          if (entry.dismissed && TERMINAL_STATES.has(entry.status)) {
            entry.dismissedOutcomes = [...new Set([...entry.dismissedOutcomes, entry.status])];
          }
          return withDismissal(entry.source === 'action' && !TERMINAL_STATES.has(entry.status)
            ? { ...entry, status: 'uncertain', stage: 'uncertain', acknowledged: false,
                message: 'האפליקציה נסגרה לפני שהתקבל אישור. בדקו את הפריט לפני ניסיון נוסף.' }
            : entry);
        }), now());
      } catch {
        persistenceError = true;
        readFailed = true;
      }
      emit();
    })();
    return loading;
  };
  const applyUpdate = async (value, { durable = true } = {}) => {
    await hydrate();
    const previous = entries.find((entry) => entry.id === value.id && entry.ownerUid === value.ownerUid);
    const sanitized = sanitizeOperation({ ...previous, createdAt: previous?.createdAt || now(), updatedAt: now(), ...value });
    if (!sanitized) return null;
    if (previous && sanitized.attempt < previous.attempt) return previous;
    const newAttempt = previous && sanitized.attempt > previous.attempt;
    const changedOutcome = previous && (newAttempt || previous.status !== sanitized.status);
    const next = withDismissal({ ...sanitized,
      // Producers own progress/results; only dismiss() owns acknowledgement of
      // dismissal. Restoring a queue must not reset it with an old boolean.
      dismissedOutcomes: newAttempt ? [] : previous?.dismissedOutcomes || [],
      acknowledged: changedOutcome ? false : previous?.acknowledged || sanitized.acknowledged,
      visibleMs: changedOutcome ? 0 : sanitized.visibleMs,
    });
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) return previous;
    entries = pruneOperations([next, ...entries.filter((entry) => entry.id !== next.id || entry.ownerUid !== next.ownerUid)], now());
    emit();
    if (durable) await persist();
    return next;
  };
  const update = (value, options) => enqueue(() => applyUpdate(value, options));
  return {
    hydrate, update,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => entries,
    hasPersistenceError: () => persistenceError,
    dismiss(id, ownerUid, expected) {
      return enqueue(async () => {
        await hydrate();
        const entry = entries.find((value) => value.id === id && value.ownerUid === ownerUid);
        if (!entry || !TERMINAL_STATES.has(entry.status)) return;
        if (expected && (entry.status !== expected.status || entry.attempt !== (expected.attempt || 1))) return;
        const next = withDismissal({ ...entry, acknowledged: true,
          dismissedOutcomes: [...new Set([...entry.dismissedOutcomes, entry.status])] });
        const snapshot = entries.map((value) => value === entry ? next : value);
        // Keep the message visible until storage confirms the dismissal.
        await persist(snapshot);
        entries = snapshot;
        emit();
      });
    },
    remove(id, ownerUid) { return enqueue(async () => {
      await hydrate();
      entries = entries.filter((entry) => entry.id !== id || entry.ownerUid !== ownerUid);
      emit();
      await persist();
    }); },
    acknowledge(id, ownerUid) { return enqueue(async () => {
      await hydrate();
      const entry = entries.find((value) => value.id === id && value.ownerUid === ownerUid);
      if (entry) await applyUpdate({ ...entry, acknowledged: true });
    }); },
    clearResolved(ownerUid) { return enqueue(async () => {
      await hydrate();
      entries = entries.filter((entry) => entry.ownerUid !== ownerUid || !RESOLVED_STATES.has(entry.status));
      emit();
      await persist();
    }); },
    flush: () => mutations,
  };
}
