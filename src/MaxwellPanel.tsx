import { useEffect, useRef, useState } from 'react';
import { mountMaxwellScene } from './scene';

export function MaxwellPanel() {
  const stage = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>('Loading Maxwell');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStatus('Loading Maxwell');
    setFailed(false);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Maxwell the cat rotating from right to left');
    stage.current!.prepend(canvas);
    const dispose = mountMaxwellScene(stage.current!, canvas, (message) => {
      setStatus(message);
      setFailed(message !== null);
    });
    return () => { dispose(); canvas.remove(); };
  }, []);

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
