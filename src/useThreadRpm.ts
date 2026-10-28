import { useEffect, useRef, useState } from 'react';
import { useRealtime, useRealtimeConnectionState, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from '../server';
import { DEFAULT_SPEED, isThreadSpeed, speedChannel, type ThreadSpeed } from './speed';

type Known = { threadId: string; speed: ThreadSpeed };

/**
 * The saved rotation speed of one thread, following later changes. Null until
 * the thread's first value arrives. Without a thread, the default speed applies.
 */
export function useThreadRpm(threadId: string | null): number | null {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const connection = useRealtimeConnectionState();
  const [known, setKnown] = useState<Known | null>(null);
  const readThread = useRef<string | null>(null);

  // Reads and signals can arrive in any order; the higher revision wins, and
  // a value for another thread never replaces this thread's.
  const adopt = (owner: string, speed: ThreadSpeed) => setKnown((current) =>
    current?.threadId === owner && current.speed.revision > speed.revision ? current : { threadId: owner, speed });

  // Subscribe before reading, so a change saved during the read is not lost.
  useRealtime(speedChannel(threadId ?? ''), (payload) => {
    if (threadId !== null && isThreadSpeed(payload)) adopt(threadId, payload);
  });

  useEffect(() => {
    if (threadId === null) return;
    // Signals are not replayed, so reread after every reconnection.
    if (readThread.current === threadId && connection !== 'connected') return;
    readThread.current = threadId;
    let current = true;
    rpcRef.current.call('speed', { threadId }).then(
      (saved) => { if (current) adopt(threadId, saved); },
      // Use the default until a later signal or reconnection supplies the value.
      () => {
        if (current) setKnown((existing) => existing?.threadId === threadId ? existing : { threadId, speed: { ...DEFAULT_SPEED, revision: -1 } });
      },
    );
    return () => { current = false; };
  }, [threadId, connection]);

  if (threadId === null) return DEFAULT_SPEED.rpm;
  return known?.threadId === threadId ? known.speed.rpm : null;
}
