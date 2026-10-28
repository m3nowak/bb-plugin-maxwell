import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the distributable includes local assets, compatible bundles and required notices', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maxwell-package-'));
  try {
    const output = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], {
      encoding: 'utf8', env: { ...process.env, npm_config_cache: join(directory, 'cache') },
    }));
    const packed = Object.values(output)[0];
    const archive = join(directory, packed.filename);
    const names = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n');
    for (const name of ['assets/maxwell.json', 'assets/maxwell-source.zip', 'dist/app.js', 'dist/app.css', 'dist/app.meta.json', 'dist/server.js', 'dist/server.meta.json', 'LICENSE', 'NOTICE.md', 'README.md']) {
      assert.ok(names.includes(`package/${name}`), `Package is missing ${name}`);
    }
    assert.ok(!names.includes('package/THIRD_PARTY_LICENSES.txt'));
    assert.ok(!names.some((name) => /rat.*\.(zip|fbx|png|jpg)$/.test(name)));
    const contents = (name) => execFileSync('tar', ['-xOzf', archive, `package/${name}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const meta = JSON.parse(contents('dist/app.meta.json'));
    assert.equal(meta.pluginId, 'maxwell');
    assert.match(contents('dist/app.js'), /data:image\/jpeg;base64,/);
    assert.match(contents('dist/app.js'), /data:image\/png;base64,/);
    assert.match(contents('NOTICE.md'), /CC BY 4\.0/);
    assert.match(contents('LICENSE'), /Copyright \(c\) 2026 Mikołaj Nowak/);
    const threeLicense = await readFile(new URL('../../node_modules/three/LICENSE', import.meta.url), 'utf8');
    assert.ok(contents('NOTICE.md').includes(threeLicense), 'The full Three.js license must be included in NOTICE.md');
    const zodLicense = await readFile(new URL('../../node_modules/zod/LICENSE', import.meta.url), 'utf8');
    assert.ok(contents('NOTICE.md').includes(zodLicense), 'The full Zod license must be included in NOTICE.md');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
