// Observe browser graphics calls, without reading scene or component internals.
(() => {
  const renderCallbacks = new Set();
  const pending = new Map();
  const contexts = new Set();
  const modelViewUniforms = new WeakSet();
  const modelViews = new WeakMap();
  let activeCallback;
  let held;
  let time = 0;
  let frameTime = 0;
  // Each scene's clock starts at its context's first drawn frame.
  const firstDraws = new WeakMap();
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
    const getUniformLocation = prototype.getUniformLocation;
    prototype.getUniformLocation = function (program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (location && name === 'modelViewMatrix') modelViewUniforms.add(location);
      return location;
    };
    const uniformMatrix4fv = prototype.uniformMatrix4fv;
    prototype.uniformMatrix4fv = function (location, transpose, values, ...args) {
      if (modelViewUniforms.has(location)) {
        const offset = args[0] ?? 0;
        modelViews.set(this.canvas, Array.from(values).slice(offset, offset + 16));
      }
      return uniformMatrix4fv.call(this, location, transpose, values, ...args);
    };
    for (const name of ['drawArrays', 'drawElements']) {
      const original = prototype[name];
      prototype[name] = function (...args) {
        probe.draws++;
        if (!firstDraws.has(this)) firstDraws.set(this, frameTime);
        if (activeCallback) renderCallbacks.add(activeCallback);
        return original.apply(this, args);
      };
    }
  }
  function invoke(callback, timestamp) {
    activeCallback = callback;
    frameTime = timestamp;
    if (renderCallbacks.has(callback)) time = timestamp;
    try { callback(timestamp); }
    finally {
      activeCallback = undefined;
      if (renderCallbacks.has(callback)) {
        time = timestamp;
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
  probe.freeze = () => { probe.hold = true; };
  probe.isHeld = () => Boolean(held);
  probe.step = (milliseconds) => {
    if (!held) throw new Error('No rendering frame is waiting');
    const { callback } = held;
    held = undefined;
    time += milliseconds;
    frameTime = time;
    callback(time);
    const canvas = document.querySelector('canvas[aria-label^="Maxwell the cat"]');
    return canvas.toDataURL('image/png');
  };
  // Milliseconds the shown scene has drawn for, by the timestamps it was given.
  probe.sceneTime = () => {
    const canvas = document.querySelector('canvas[aria-label^="Maxwell the cat"]');
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    return context && firstDraws.has(context) ? time - firstDraws.get(context) : null;
  };
  // The transform actually sent to WebGL, not scene or component state.
  probe.modelView = () => modelViews.get(document.querySelector('canvas[aria-label^="Maxwell the cat"]'));
  probe.resume = () => {
    probe.hold = false;
    if (held) {
      const { callback } = held;
      held = undefined;
      window.requestAnimationFrame(callback);
    }
  };
  // Observe media through browser playback events, not the player's code.
  // A play() call alone is not evidence: only `playing` and advancing
  // `timeupdate` positions count as sound.
  const media = new Map();
  probe.audio = { starts: 0, ends: 0, rewinds: 0, maxConcurrent: 0, errors: 0 };
  const observe = (element) => {
    if (media.has(element)) return;
    const record = { element, position: 0 };
    media.set(element, record);
    element.addEventListener('playing', () => {
      if (element.currentTime < 0.25) probe.audio.starts++;
      record.position = element.currentTime;
      const playing = [...media.keys()].filter((item) => !item.paused && !item.ended).length;
      probe.audio.maxConcurrent = Math.max(probe.audio.maxConcurrent, playing);
    });
    element.addEventListener('timeupdate', () => {
      if (element.currentTime + 0.05 < record.position && !element.paused) probe.audio.rewinds++;
      record.position = element.currentTime;
    });
    element.addEventListener('ended', () => { probe.audio.ends++; record.position = 0; });
    element.addEventListener('emptied', () => { record.position = 0; });
    element.addEventListener('error', () => probe.audio.errors++);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    observe(this);
    return play.apply(this, args);
  };
  probe.media = () => [...media.keys()].map((element) => ({
    src: element.currentSrc,
    currentTime: element.currentTime,
    duration: element.duration,
    paused: element.paused,
    ended: element.ended,
    networkState: element.networkState,
    readyState: element.readyState,
  }));
  probe.audible = () => [...media.keys()].filter((element) => !element.paused && !element.ended && element.currentTime > 0).length;
  window.maxwellBrowserProbe = probe;
})();
