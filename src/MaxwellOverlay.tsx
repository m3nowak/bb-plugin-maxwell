import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBbContext, useRealtime, useSidebarSplitLayout } from '@get-bb/plugin-sdk/app';
import { flyAround } from './flight';
import { isModeCommand, MODE_CHANNEL } from './mode';
import { playMaxwellMusic } from './music';
import { mountMaxwellScene, type MaxwellScene } from './scene';
import { setMaxwellMode, useMaxwellMode } from './useMaxwellMode';
import { useThreadRpm } from './useThreadRpm';

/**
 * Receives free and capture commands for this tab, and shows Maxwell over the
 * whole BB interface while he is free. Mounted once per tab, independently of
 * panels and navigation.
 */
export function MaxwellOverlay() {
  const free = useMaxwellMode() === 'free';
  useRealtime(MODE_CHANNEL, (payload) => {
    if (isModeCommand(payload)) setMaxwellMode(payload.mode);
  });
  // Panels get the cat back when the overlay goes, as on plugin disable.
  useEffect(() => () => setMaxwellMode('panel'), []);
  return free ? createPortal(<FreeMaxwell />, document.body) : null;
}

/** The thread whose saved speed applies: the focused split pane's, or the route's. */
function useViewedThread(): string | null {
  const { threadId } = useBbContext();
  const split = useSidebarSplitLayout();
  if (!split) return threadId;
  return split.panes.find((pane) => pane.isFocused)?.threadId ?? null;
}

function FreeMaxwell() {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MaxwellScene | null>(null);
  const rpm = useThreadRpm(useViewedThread());
  const rpmRef = useRef(rpm ?? 0);
  rpmRef.current = rpm ?? 0;
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Maxwell the cat rotating from right to left');
    stage.current!.prepend(canvas);
    const flight = flyAround(stage.current!);
    const mounted = mountMaxwellScene(stage.current!, canvas, {
      report: setStatus,
      onCatClick: playMaxwellMusic,
      retry: 'Capture and free Maxwell to try again.',
      onFrame: flight.advance,
    });
    mounted.setRpm(rpmRef.current);
    scene.current = mounted;
    return () => { scene.current = null; mounted.dispose(); flight.dispose(); canvas.remove(); };
  }, []);

  useEffect(() => { scene.current?.setRpm(rpm ?? 0); }, [rpm]);

  return (
    <div className="maxwell-free" ref={stage}>
      {status && <p className="maxwell-message" role="alert">{status}</p>}
    </div>
  );
}
