import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSdk, type PluginBrowserBbSdk } from '@get-bb/plugin-sdk/app';
import { DANCE, rpmAt, utilizationOf, type MaxwellMotion } from './motion';

/** What this tab knows about one conversation's motion. */
interface Known {
  /** Whether its first message was sent; null until BB has said. */
  started: boolean | null;
  /** The last valid context utilization, until a confirmed clear invalidates it. */
  utilization: number | null;
}

interface Watched {
  known: Known;
  listeners: Set<() => void>;
  /** Ends the live subscription and abandons its reads. */
  stop?: () => void;
  /** Numbers of the latest context read issued and applied. */
  issued: number;
  applied: number;
  /** Sequence of the newest confirmed clear seen, and of the latest clear the reading postdates. */
  clear: number;
  readingClear: number;
  outlineIssued: number;
  outlineApplied: number;
}

const UNKNOWN: Known = { started: null, utilization: null };

// Held by this frontend generation only, so a reload asks BB again and no
// earlier setting outlives it. Kept after views close, so returning to a
// conversation starts from its last reading while a fresh one is requested.
const watched = new Map<string, Watched>();

// Events after which BB may report a different context reading.
const CONTEXT_EVENTS = new Set([
  'thread/contextWindowUsage/updated', 'thread/compacted', 'thread/context/cleared',
  'system/operation', 'thread/started', 'turn/completed',
]);
// A clear is confirmed by BB's completed operation, or by the provider.
const CLEAR_EVENTS = ['system/operation', 'thread/context/cleared'] as const;
const CLEAR_PAGE = 20;
const isClear = ({ type, data }: { type: string; data: unknown }) => type === 'thread/context/cleared'
  || (type === 'system/operation' && (data as { operation?: unknown }).operation === 'context_clear' && (data as { status?: unknown }).status === 'completed');

function entry(threadId: string) {
  let item = watched.get(threadId);
  if (!item) {
    item = { known: UNKNOWN, listeners: new Set(), issued: 0, applied: 0, clear: -1, readingClear: -1, outlineIssued: 0, outlineApplied: 0 };
    watched.set(threadId, item);
  }
  return item;
}

function update(item: Watched, change: Partial<Known>) {
  const next = { ...item.known, ...change };
  if (next.started === item.known.started && next.utilization === item.known.utilization) return;
  item.known = next;
  for (const listener of item.listeners) listener();
}

function start(sdk: PluginBrowserBbSdk, threadId: string, item: Watched) {
  const abort = new AbortController();
  const { signal } = abort;

  // The newest clear, and a sequence no clear has followed. Without a clear
  // among the most recent operations, the oldest of them is such a sequence.
  const latestClear = async () => {
    const events = await sdk.threads.events.list({ threadId, types: [...CLEAR_EVENTS], order: 'desc', limit: String(CLEAR_PAGE), signal });
    const clear = events.find(isClear)?.seq;
    return { clear: clear ?? -1, since: clear ?? (events.length === CLEAR_PAGE ? events[CLEAR_PAGE - 1].seq : -1) };
  };
  const readContext = () => {
    const number = ++item.issued;
    (async () => {
      // Ask about clears first: a clear between the two replies is then
      // reported by a later read, not hidden by this one.
      const { clear, since } = await latestClear();
      const { usage } = await sdk.threads.context({ threadId, signal });
      if (signal.aborted) return;
      if (clear > item.clear) {
        item.clear = clear;
        // A confirmed clear invalidates the reading taken before it.
        if (item.readingClear < clear) update(item, { utilization: null });
      }
      // A late reply must not replace a newer one, nor outlive a clear.
      if (number <= item.applied || since < item.clear) return;
      item.applied = number;
      const utilization = utilizationOf(usage);
      // Without a valid reading, the last valid one stands.
      if (utilization === null) return;
      item.readingClear = since;
      update(item, { utilization });
    })().catch(() => {});
  };
  const readStarted = () => {
    if (item.known.started) return;
    const number = ++item.outlineIssued;
    sdk.threads.conversationOutline({ threadId, role: 'user', signal }).then(({ items }) => {
      if (signal.aborted || number <= item.outlineApplied) return;
      item.outlineApplied = number;
      // A sent message stays sent.
      update(item, { started: item.known.started === true || items.length > 0 });
    }, () => {});
  };

  const unsubscribeThread = sdk.subscribe({
    event: 'thread:changed',
    threadId,
    callback: ({ changes, metadata }) => {
      readStarted();
      const types = changes.includes('events-appended') ? metadata?.eventTypes ?? null : [];
      if (types === null || types.some((type) => CONTEXT_EVENTS.has(type))
        || changes.includes('history-compacted') || changes.includes('history-rewritten')) readContext();
    },
  });
  // Changes are not replayed after a lost connection, so ask again.
  const unsubscribeConnection = sdk.subscribe({
    event: 'realtime:connection',
    callback: ({ state, reconnected }) => {
      if (state !== 'connected' || !reconnected) return;
      readStarted();
      readContext();
    },
  });
  readStarted();
  readContext();
  return () => {
    unsubscribeThread();
    unsubscribeConnection();
    abort.abort();
  };
}

/** Follow one conversation while a listener is subscribed. */
function watch(sdk: PluginBrowserBbSdk, threadId: string, listener: () => void) {
  const item = entry(threadId);
  item.listeners.add(listener);
  if (item.listeners.size === 1) item.stop = start(sdk, threadId, item);
  return () => {
    item.listeners.delete(listener);
    if (item.listeners.size > 0) return;
    item.stop?.();
    item.stop = undefined;
  };
}

/**
 * Maxwell's motion for a viewed conversation: Obrót Maxwella in an Aktywny
 * czat, at the speed of its context fill, and Taniec Maxwella without one.
 * Readings belong to their conversation in this tab and never carry over.
 */
export function useMaxwellMotion(threadId: string | null): MaxwellMotion {
  const sdk = useSdk();
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;
  const subscribe = useCallback(
    (listener: () => void) => threadId === null ? () => {} : watch(sdkRef.current, threadId, listener),
    [threadId],
  );
  const known = useSyncExternalStore(subscribe, () => threadId === null ? null : watched.get(threadId)?.known ?? UNKNOWN);
  // Until BB says whether a message was sent, keep dancing if already
  // dancing; otherwise an existing thread most likely has one.
  const dancing = useRef(false);
  const dance = known === null || known.started === false || (known.started === null && dancing.current);
  dancing.current = dance;
  const rpm = known === null || dance ? null : rpmAt(known.utilization);
  return useMemo(() => rpm === null ? DANCE : { kind: 'spin', rpm }, [rpm]);
}
