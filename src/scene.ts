import {
  BufferGeometryLoader, DirectionalLight, DoubleSide, Group, HemisphereLight,
  Mesh, MeshLambertMaterial, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace,
  Texture, Vector2, WebGLRenderer,
} from 'three';
import model from '../assets/maxwell.json';

const TURN_PER_MS = 2 * Math.PI / 2500;
const BOB_PER_MS = 2 * Math.PI / 3000;
const BOB_HEIGHT_RATIO = 0.105;
const ELEVATION = 14 * Math.PI / 180;
const FOV = 30;
const WHISKER_ALPHA_TEST = 0.05;

/** Owns one visible scene and all of its graphics resources. */
export function mountMaxwellScene(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  report: (message: string | null) => void,
  onCatClick: () => void,
) {
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
  let bobPhase = 0;
  let bobAmplitude = 0;
  let whiskerAlpha: ImageData | undefined;
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  const frame = (time: number) => {
    if (!running) return;
    if (previousTime !== null) {
      const elapsed = time - previousTime;
      cat.rotation.y = (cat.rotation.y - elapsed * TURN_PER_MS) % (2 * Math.PI);
      bobPhase = (bobPhase + elapsed * BOB_PER_MS) % (2 * Math.PI);
      cat.position.y = Math.sin(bobPhase) * bobAmplitude;
    }
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
      // including whiskers and the full vertical bob. Use the narrower field of view.
      const radius = geometry!.boundingSphere!.radius + bobAmplitude;
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
  // Hit the silhouette as last drawn: the body's front faces, and whisker
  // texels that survive the same alpha test the renderer applies.
  const whiskerOpaque = ({ x, y }: Vector2) => {
    const { width: columns, height: rows, data } = whiskerAlpha!;
    const column = Math.min(columns - 1, Math.max(0, Math.floor(x * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((1 - y) * rows)));
    return data[(row * columns + column) * 4 + 3] / 255 >= WHISKER_ALPHA_TEST;
  };
  const click = (event: MouseEvent) => {
    if (disposed || !ready) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, (rect.top - event.clientY) / rect.height * 2 + 1);
    // A resize can reframe the camera before the next frame is drawn.
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(cat);
    if (hits.some(({ face, uv }) => face?.materialIndex === 0 || (uv !== undefined && whiskerOpaque(uv)))) onCatClick();
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
    canvas.removeEventListener('click', click);
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
  canvas.addEventListener('click', click);
  document.addEventListener('visibilitychange', updateLoop);
  window.addEventListener('pagehide', dispose);
  sizeObserver.observe(stage);
  visibilityObserver.observe(stage);

  const load = async () => {
    try {
      geometry = new BufferGeometryLoader().parse(model.geometry);
      geometry.computeBoundingSphere();
      bobAmplitude = geometry.boundingSphere!.radius * BOB_HEIGHT_RATIO;
      const images = await Promise.all([model.body, model.whiskers].map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
      }));
      if (disposed) return;
      const whiskers = images[1];
      const sampler = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      sampler.canvas.width = whiskers.naturalWidth;
      sampler.canvas.height = whiskers.naturalHeight;
      sampler.drawImage(whiskers, 0, 0);
      whiskerAlpha = sampler.getImageData(0, 0, whiskers.naturalWidth, whiskers.naturalHeight);
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
