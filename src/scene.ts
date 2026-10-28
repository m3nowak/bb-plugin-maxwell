import {
  BufferGeometryLoader, DirectionalLight, DoubleSide, Group, HemisphereLight,
  Mesh, MeshLambertMaterial, PerspectiveCamera, Scene, SRGBColorSpace, Texture,
  WebGLRenderer,
} from 'three';
import model from '../assets/maxwell.json';

const TURN_PER_MS = 2 * Math.PI / 5000;
const ELEVATION = 14 * Math.PI / 180;
const FOV = 30;

/** Owns one visible scene and all of its graphics resources. */
export function mountMaxwellScene(stage: HTMLElement, canvas: HTMLCanvasElement, report: (message: string | null) => void) {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    canvas.hidden = true;
    report('The 3D view needs WebGL, which is not available here.');
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new Scene();
  const cat = new Group();
  scene.add(cat, new HemisphereLight(0xffffff, 0x5a5048, 1.6));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(-2, 4, 3);
  scene.add(key);
  const camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
  const textures: Texture[] = [];
  const materials: MeshLambertMaterial[] = [];
  let geometry: ReturnType<BufferGeometryLoader['parse']> | undefined;
  let disposed = false;
  let ready = false;
  let inView = false;
  let width = 0;
  let height = 0;
  let running = false;
  let previousTime: number | null = null;

  const frame = (time: number) => {
    if (!running) return;
    if (previousTime !== null) cat.rotation.y = (cat.rotation.y - (time - previousTime) * TURN_PER_MS) % (2 * Math.PI);
    previousTime = time;
    try { renderer.render(scene, camera); }
    catch {
      // Three schedules its next frame after this callback returns. Cancel
      // after that scheduling so a thrown draw cannot leave an idle RAF loop.
      queueMicrotask(() => fail('The 3D view stopped because rendering failed. Reopen the panel to try again.'));
    }
  };
  const updateLoop = () => {
    const visible = !disposed && ready && inView && width > 0 && height > 0 && document.visibilityState === 'visible';
    if (visible === running) return;
    running = visible;
    previousTime = null;
    renderer.setAnimationLoop(visible ? frame : null);
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    width = Math.floor(rect.width);
    height = Math.floor(rect.height);
    if (!disposed && ready && width > 0 && height > 0) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // A sphere enclosing every vertex also encloses every angle of rotation,
      // including transparent whisker planes. Use the narrower field of view.
      const radius = geometry!.boundingSphere!.radius;
      const halfFov = Math.min(FOV * Math.PI / 360, Math.atan(Math.tan(FOV * Math.PI / 360) * camera.aspect));
      const distance = radius * 1.1 / Math.sin(halfFov);
      camera.position.set(0, Math.sin(ELEVATION), Math.cos(ELEVATION)).multiplyScalar(distance);
      camera.near = distance / 10;
      camera.far = distance * 10;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
    updateLoop();
  };
  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    updateLoop();
  });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    updateLoop();
    sizeObserver.disconnect();
    visibilityObserver.disconnect();
    document.removeEventListener('visibilitychange', updateLoop);
    window.removeEventListener('pagehide', dispose);
    canvas.removeEventListener('webglcontextlost', contextLost);
    geometry?.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  const fail = (message: string) => {
    if (disposed) return;
    dispose();
    canvas.hidden = true;
    report(message);
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    fail('The 3D view stopped because the graphics device was reset. Reopen the panel to try again.');
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', updateLoop);
  window.addEventListener('pagehide', dispose);
  sizeObserver.observe(stage);
  visibilityObserver.observe(stage);

  const load = async () => {
    try {
      geometry = new BufferGeometryLoader().parse(model.geometry);
      geometry.computeBoundingSphere();
      const images = await Promise.all([model.body, model.whiskers].map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      }));
      if (disposed) return;
      for (const image of images) {
        const texture = new Texture(image);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
        textures.push(texture);
      }
      materials.push(
        new MeshLambertMaterial({ map: textures[0] }),
        new MeshLambertMaterial({ map: textures[1], transparent: true, alphaTest: 0.05, side: DoubleSide, depthWrite: false }),
      );
      cat.add(new Mesh(geometry, materials));
      ready = true;
      resize();
      report(null);
    } catch { fail('The Maxwell model could not be loaded. Reopen the panel to try again.'); }
  };
  void load();
  return dispose;
}
