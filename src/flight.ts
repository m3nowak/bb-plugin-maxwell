/** Side of the flying cat's square, close to the cat in a panel. */
const SIZE = 300;
/** Pixels per millisecond along each axis, a 45° diagonal. */
const SPEED = 0.1;

/** Reflect a position that may have passed either edge of [0, max]. */
function bounce(position: number, direction: number, max: number): [number, number] {
  if (max <= 0) return [0, direction];
  const unfolded = ((position % (2 * max)) + 2 * max) % (2 * max);
  return unfolded <= max ? [unfolded, direction] : [2 * max - unfolded, -direction];
}

/**
 * Moves a fixed element in straight diagonal lines at a constant pace,
 * bouncing off the edges of the page like the DVD logo.
 */
export function flyAround(element: HTMLElement) {
  let size = 0;
  let maxX = 0;
  let maxY = 0;
  const measure = () => {
    const { clientWidth, clientHeight } = document.documentElement;
    // A page smaller than the cat shrinks it to fit.
    size = Math.max(0, Math.min(SIZE, clientWidth, clientHeight));
    maxX = clientWidth - size;
    maxY = clientHeight - size;
  };
  measure();
  let x = Math.random() * maxX;
  let y = Math.random() * maxY;
  let dx = Math.random() < 0.5 ? -1 : 1;
  let dy = Math.random() < 0.5 ? -1 : 1;
  const place = () => {
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    element.style.transform = `translate(${x}px, ${y}px)`;
  };
  const resize = () => {
    measure();
    x = Math.min(Math.max(x, 0), maxX);
    y = Math.min(Math.max(y, 0), maxY);
    place();
  };
  place();
  window.addEventListener('resize', resize);
  return {
    advance(elapsed: number) {
      [x, dx] = bounce(x + dx * SPEED * elapsed, dx, maxX);
      [y, dy] = bounce(y + dy * SPEED * elapsed, dy, maxY);
      place();
    },
    dispose() { window.removeEventListener('resize', resize); },
  };
}
