// Asset preparation only. Runtime uses the checked-in, self-contained JSON.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { Box3, LoadingManager, Matrix4, Texture, Vector3 } from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const source = new URL('../assets/maxwell-source.zip', import.meta.url);
const archive = await readFile(source);
const digest = createHash('sha256').update(archive).digest('hex');
if (digest !== '74eadc0121b84655693dcbbea86d45ebdf31f2aa2222db1023a46747f6ac2818') {
  throw new Error('The supplied Maxwell archive has changed. Review its provenance before converting.');
}
const extract = (path) => execFileSync('unzip', ['-p', fileURLToPath(source), path]);
// Read material assignments without requesting the original Windows texture paths.
const manager = new LoadingManager();
manager.addHandler(/.*/, { setPath() {}, load() { return new Texture(); } });
const fbx = extract('source/[[]etkjdoiqwhuiorhvuier.fbx');
const model = new FBXLoader(manager).parse(fbx.buffer.slice(fbx.byteOffset, fbx.byteOffset + fbx.byteLength), '');
model.updateMatrixWorld(true);
const meshes = [];
model.traverse((object) => { if (object.isMesh) meshes.push(object); });
if (meshes.length !== 1 || model.animations.length) throw new Error('Unexpected Maxwell model structure.');
const [mesh] = meshes;
const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
// Bake FBX's Z-up conversion, normalize size, then turn the long axis toward the camera.
const box = new Box3().setFromBufferAttribute(geometry.attributes.position);
const center = box.getCenter(new Vector3());
geometry.translate(-center.x, -center.y, -center.z);
geometry.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
geometry.scale(1 / 1000, 1 / 1000, 1 / 1000);
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
const dataURL = (path, mime) => `data:${mime};base64,${extract(path).toString('base64')}`;
// UUIDs are loader bookkeeping, not source identity. Omit them for reproducible output.
const { uuid, ...serialized } = geometry.toJSON();
await writeFile(new URL('../assets/maxwell.json', import.meta.url), JSON.stringify({
  geometry: serialized,
  body: dataURL('textures/dingus_nowhiskers.jpg', 'image/jpeg'),
  whiskers: dataURL('textures/dingus_whiskers.tga.png', 'image/png'),
}) + '\n');
console.log(`Prepared Maxwell: ${geometry.attributes.position.count} vertices, two local textures.`);
