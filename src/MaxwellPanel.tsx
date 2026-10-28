import { useEffect, useRef, useState } from 'react';
import { playMaxwellMusic } from './music';
import { mountMaxwellScene, type MaxwellScene } from './scene';
import { useMaxwellMode } from './useMaxwellMode';
import { useThreadRpm } from './useThreadRpm';

/** Maxwell for a thread, or for New thread when there is no thread yet. */
export function MaxwellPanel({ threadId = null }: { threadId?: string | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MaxwellScene | null>(null);
  const rpm = useThreadRpm(threadId);
  // Hold still until the thread's saved speed is known.
  const rpmRef = useRef(rpm ?? 0);
  rpmRef.current = rpm ?? 0;
  const free = useMaxwellMode() === 'free';
  const [status, setStatus] = useState<string | null>('Loading Maxwell');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // While Maxwell is free, the tab's overlay is his only scene.
    if (free) return;
    setStatus('Loading Maxwell');
    setFailed(false);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Maxwell the cat rotating from right to left');
    stage.current!.prepend(canvas);
    const mounted = mountMaxwellScene(stage.current!, canvas, {
      report: (message) => {
        setStatus(message);
        setFailed(message !== null);
      },
      onCatClick: playMaxwellMusic,
      retry: 'Reopen the panel to try again.',
    });
    mounted.setRpm(rpmRef.current);
    scene.current = mounted;
    return () => { scene.current = null; mounted.dispose(); canvas.remove(); };
  }, [free]);

  useEffect(() => { scene.current?.setRpm(rpm ?? 0); }, [rpm]);

  const message = free ? 'Maxwell is roaming free.' : status;
  return (
    <section className="maxwell-panel" aria-label="maxwell">
      <div className="maxwell-stage" ref={stage}>
        {message && <p className="maxwell-message" role={failed && !free ? 'alert' : 'status'}>{message}</p>}
      </div>
      <p className="maxwell-attribution">
        <a href="https://sketchfab.com/3d-models/maxwell-the-cat-dingus-2ca7f3c1957847d6a145fc35de9046b0" target="_blank" rel="noreferrer">Maxwell the cat (Dingus)</a>
        {' by '}<a href="https://sketchfab.com/alwayshasbean" target="_blank" rel="noreferrer">bean(alwayshasbean)</a>
        {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
      </p>
    </section>
  );
}
