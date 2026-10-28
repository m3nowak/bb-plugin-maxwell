# Maxwell for BB

Open **maxwell** from the right panel's **Actions** list to watch Maxwell
beside your conversation. It also works on **New thread**, before sending a
message. BB owns the panel tabs, resizing and closing.

Maxwell turns from right to left at 12 rpm, one turn every five seconds,
including when the system requests reduced motion. The camera stays fixed.
The scene pauses while the panel or page is hidden and resumes from the same
orientation. There are no settings, playback controls or sound.

The model, textures and renderer are bundled locally. Attribution below the
scene links to the creator, model and license. Those links only contact
external sites when you open them. WebGL or asset failures leave a readable
message and the attribution. Close and reopen the tab to try again.

## Install from a checkout

Requires BB 0.47 or newer with Plugin SDK 0.6.79 or newer in the 0.x series,
and Node.js 22 or newer for development.

```sh
npm ci
npm run build
bb plugin install .
```

For development, use `bb plugin dev` after installation. `npm run typecheck`
checks both entries and the panel. Runtime dependencies belong in
`dependencies`; BB supplies React and the SDK through its frontend runtime.
No external service or persistent storage is needed.

## Verify

Acceptance tests exercise the installed plugin in a running BB, using its
actual Actions menu, renderer, asset bundle and panel lifecycle. They do not
send messages or create agent threads.

```sh
npx playwright install chromium --only-shell
MAXWELL_BB_URL=http://127.0.0.1:38888 MAXWELL_THREAD_ID=thr_example npm test
```

Set `MAXWELL_BB_URL` to your BB server's local URL and `MAXWELL_THREAD_ID` to an
existing thread. In a BB thread it defaults
to `BB_SERVER_URL`. Set `MAXWELL_CHROME` to use another Chromium executable.
The harness uses software WebGL for headless tests. A functioning WebGL
implementation is required for rendering checks; graphics failures are test
failures, not skips. Build before running the package delivery check.

## Assets and licenses

The plugin code uses the MIT license and retains the original och-plugin-demo
notice. Maxwell's model and textures use CC BY 4.0. See [NOTICE.md](NOTICE.md)
for the creator, source, archive checksum and actual asset changes, and
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt) for the bundled renderer's
notice.

The checked-in `assets/maxwell.json` embeds geometry and both original image
files. Regenerate it from `assets/maxwell-source.zip` with
`npm run prepare:model`, which requires the `unzip` command. No download or
asset conversion runs during install or normal builds.
