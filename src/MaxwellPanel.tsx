import { useEffect, useRef, useState } from 'react';
import { playMaxwellMusic } from './music';
import { mountMaxwellScene, type MaxwellScene } from './scene';
import { useThreadRpm } from './useThreadRpm';

/** Maxwell for a thread, or for New thread when there is no thread yet. */
export function MaxwellPanel({ threadId = null }: { threadId?: string | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MaxwellScene | null>(null);
  const rpm = useThreadRpm(threadId);
  const [status, setStatus] = useState<string | null>('Loading Maxwell');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStatus('Loading Maxwell');
    setFailed(false);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Maxwell the cat rotating from right to left');
    stage.current!.prepend(canvas);
    const mounted = mountMaxwellScene(stage.current!, canvas, (message) => {
      setStatus(message);
      setFailed(message !== null);
    }, playMaxwellMusic);
    scene.current = mounted;
    return () => { scene.current = null; mounted.dispose(); canvas.remove(); };
  }, []);

  // Hold still until the thread's saved speed is known.
  useEffect(() => { scene.current?.setRpm(rpm ?? 0); }, [rpm]);

  return (
    <section className="maxwell-panel" aria-label="maxwell">
      <div className="maxwell-stage" ref={stage}>
        {status && <p className="maxwell-message" role={failed ? 'alert' : 'status'}>{status}</p>}
      </div>
      <p className="maxwell-attribution">
        <a href="https://sketchfab.com/3d-models/maxwell-the-cat-dingus-2ca7f3c1957847d6a145fc35de9046b0" target="_blank" rel="noreferrer">Maxwell the cat (Dingus)</a>
        {' by '}<a href="https://sketchfab.com/alwayshasbean" target="_blank" rel="noreferrer">bean(alwayshasbean)</a>
        {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
      </p>
    </section>
  );
}
