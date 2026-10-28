// Observe browser graphics calls, without reading scene or component internals.
(() => {
  const renderCallbacks = new Set();
  const pending = new Map();
  const contexts = new Set();
  let activeCallback;
  let held;
  let time = 0;
  let firstDrawTime = null;
  let serial = 0;
  const callbacksAt = new Map();
  const probe = { draws: 0, hold: false, contexts: 0, lost: 0, imageDecodes: 0, maxRenderCallbacksPerFrame: 0 };
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const context = getContext.call(this, kind, ...args);
    if (context && /webgl/.test(kind) && !contexts.has(context)) {
      contexts.add(context);
      probe.contexts++;
      this.addEventListener('webglcontextlost', () => probe.lost++);
    }
    return context;
  };
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of ['drawArrays', 'drawElements']) {
      const original = prototype[name];
      prototype[name] = function (...args) {
        probe.draws++;
        if (activeCallback) renderCallbacks.add(activeCallback);
        return original.apply(this, args);
      };
    }
  }
  function invoke(callback, timestamp) {
    activeCallback = callback;
    if (renderCallbacks.has(callback)) time = timestamp;
    try { callback(timestamp); }
    finally {
      activeCallback = undefined;
      if (renderCallbacks.has(callback)) {
        time = timestamp;
        firstDrawTime ??= timestamp;
        const count = (callbacksAt.get(timestamp) ?? 0) + 1;
        callbacksAt.set(timestamp, count);
        probe.maxRenderCallbacksPerFrame = Math.max(probe.maxRenderCallbacksPerFrame, count);
        if (callbacksAt.size > 500) callbacksAt.clear();
      }
    }
  }
  window.requestAnimationFrame = (callback) => {
    if (probe.hold && renderCallbacks.has(callback)) {
      const id = --serial;
      held = { id, callback };
      return id;
    }
    const id = request((timestamp) => {
      pending.delete(id);
      invoke(callback, timestamp);
    });
    pending.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (held?.id === id) held = undefined;
    pending.delete(id);
    cancel(id);
  };
  const decode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function () { probe.imageDecodes++; return decode.call(this); };
  probe.pendingFrames = () => pending.size + (held ? 1 : 0);
  probe.elapsedRenderingTime = () => time - (firstDrawTime ?? time);
  probe.freeze = () => { probe.hold = true; };
  probe.isHeld = () => Boolean(held);
  probe.step = (milliseconds) => {
    if (!held) throw new Error('No rendering frame is waiting');
    const { callback } = held;
    held = undefined;
    time += milliseconds;
    callback(time);
    const canvas = document.querySelector('canvas[aria-label="Maxwell the cat rotating from right to left"]');
    return canvas.toDataURL('image/png');
  };
  probe.resume = () => {
    probe.hold = false;
    if (held) {
      const { callback } = held;
      held = undefined;
      window.requestAnimationFrame(callback);
    }
  };
  window.maxwellBrowserProbe = probe;
})();
