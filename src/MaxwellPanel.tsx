import { useEffect, useRef, useState } from 'react';
import { catLabel } from './motion';
import { playMaxwellMusic } from './music';
import { mountMaxwellScene, type MaxwellScene } from './scene';
import { useMaxwellMode } from './useMaxwellMode';
import { useMaxwellMotion } from './threadMotion';

/** Maxwell for a thread, or for New thread when there is no thread yet. */
export function MaxwellPanel({ threadId = null }: { threadId?: string | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scene = useRef<MaxwellScene | null>(null);
  // The panel follows the conversation it belongs to.
  const motion = useMaxwellMotion(threadId);
  const motionRef = useRef(motion);
  motionRef.current = motion;
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
    canvas.setAttribute('aria-label', catLabel(motionRef.current));
    stage.current!.prepend(canvas);
    const mounted = mountMaxwellScene(stage.current!, canvas, {
      report: (message) => {
        setStatus(message);
        setFailed(message !== null);
      },
      onCatClick: playMaxwellMusic,
      retry: 'Reopen the panel to try again.',
    });
    mounted.setMotion(motionRef.current);
    scene.current = mounted;
    canvasRef.current = canvas;
    return () => { scene.current = null; canvasRef.current = null; mounted.dispose(); canvas.remove(); };
  }, [free]);

  useEffect(() => {
    scene.current?.setMotion(motion);
    canvasRef.current?.setAttribute('aria-label', catLabel(motion));
  }, [motion]);

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
