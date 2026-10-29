interface Point { x: number; y: number }

/** Rock a body's cross-section on a fixed floor, without slipping. */
export function createRockingSupport(points: Point[], maxRoll: number) {
  // Only the lower convex hull can touch the floor. Whiskers are excluded
  // by the caller; the support must come from solid body geometry.
  const hull: Point[] = [];
  for (const point of [...points].sort((a, b) => a.x - b.x || a.y - b.y)) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
      hull.pop();
    }
    hull.push(point);
  }
  if (!hull.length) throw new Error('The body has no supporting vertices.');

  const height = (point: Point, angle: number) => point.x * Math.sin(angle) + point.y * Math.cos(angle);
  const contactAt = (angle: number) => hull.reduce((lowest, point) => height(point, angle) < height(lowest, angle) ? point : lowest);
  const floor = height(contactAt(0), 0);
  // The supporting vertex changes only when an edge becomes horizontal.
  const breaks = [-maxRoll, maxRoll, 0];
  for (let i = 1; i < hull.length; i++) {
    const angle = -Math.atan2(hull[i].y - hull[i - 1].y, hull[i].x - hull[i - 1].x);
    if (angle > -maxRoll && angle < maxRoll) breaks.push(angle);
  }
  breaks.sort((a, b) => a - b);
  const segments = breaks.slice(1).map((end, i) => ({ start: breaks[i], end, point: contactAt((breaks[i] + end) / 2) }));
  // No-slip rolling requires dx/d(angle) = the contact's rotated height.
  // Integrating each supporting vertex exactly gives a fixed edge pivot
  // for a box, and continuous motion as a rounded body changes contact.
  const primitive = (point: Point, angle: number) => -point.x * Math.cos(angle) + point.y * Math.sin(angle);
  const integral = (angle: number) => segments.reduce((sum, { start, end, point }) =>
    sum + (angle > start ? primitive(point, Math.min(angle, end)) - primitive(point, start) : 0), 0);
  const origin = integral(0);
  const at = (angle: number): Point => ({ x: integral(angle) - origin, y: floor - height(contactAt(angle), angle) });

  // Bound each coordinate over the supported range, including any interior
  // height extrema, to keep the same camera framing in both motion modes.
  const candidates = [...breaks, ...hull.map(({ x, y }) => Math.atan(x / y)).filter((angle) => Math.abs(angle) < maxRoll)];
  const offsets = candidates.map(at);
  const reach = Math.hypot(Math.max(...offsets.map(({ x }) => Math.abs(x))), Math.max(...offsets.map(({ y }) => Math.abs(y))));
  return { at, reach };
}
