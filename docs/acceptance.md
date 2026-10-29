# Acceptance checks

The agreed test boundary is the installed plugin through BB. Tests use real
Actions entries on New thread and an existing thread, the bundled renderer,
browser graphics calls and rendered pixels. They do not import panel internals.

Run `npm run build`, install or reload `maxwell` in BB, then run `npm test`.
`tool.test.mjs` loads the built server bundle into the Plugin SDK's fake host
and calls the registered agent tool as a provider tool call would.
Set `MAXWELL_BB_URL` for the host and `MAXWELL_THREAD_ID` for an existing thread.
BB threads supply `BB_SERVER_URL` and `BB_THREAD_ID` as defaults.
`MAXWELL_CHROME` selects the browser binary. `MAXWELL_CHROME_ARGS` replaces the
default SwiftShader flags, for example with
`--no-sandbox --use-angle=gl-egl --ignore-gpu-blocklist` for a hardware GPU.

The suite covers locally bundled assets, missing WebGL, invalid image data,
context loss, attribution retention, rotation with its vertical bob at 20
cycles per minute under both motion preferences, the dance, framing, theme
changes, hidden views and repeated closing.
Rendering tests fail on unusable graphics hardware, rather than skipping.

Music checks observe the browser media boundary: `playing` events, advancing
positions, rewinds, natural ends and concurrent playback. They click real
rendered cat pixels found in the frame, at four poses and three panel sizes.
Background and attribution clicks must stay silent. Repeated clicks while the
recording starts or plays must not reload, restart, queue or overlap it.
The recording must play once to its end and replay from the start. Playback
must continue across panel closing, reopening, a thread change and a lost
graphics context, with one player for the tab. A failed load and a refused
play must allow retrying. Tab reload and plugin disable must stop playback and
release the media without resuming it. The pose and size check substitutes a
short silent WAV, so each hit is observed as its own complete playback.
Listen to the bundled recording once to confirm it is the expected music.

Rendered quarter-turn images are written to `artifacts/` by the timing check.
Review those images in chronological order to verify that the face moves from
right to left. Check the body texture and transparent whiskers against the
supplied artwork. A numeric angle or rotation sign is insufficient evidence.
The automated period check compares actual rendered pixels 2.5 seconds apart
at matching heights of the three-second bob. It also requires a visibly
different image after a quarter turn and a half turn, a lower position at the
opposite bob phase with the same orientation, and both motions repeating
together after 15 seconds.

For a wall-clock timing check, watch the open panel for several cycles and
measure the interval between matching orientations. It should take 2.5
seconds. The vertical bob should complete a cycle in three seconds. Allow for
browser scheduling, and repeat with reduced motion enabled.

## Verification in this checkout

- BB 0.47.1, Plugin SDK 0.6.79. Both entry bundles build and typecheck.
- The installed plugin registers both Actions entries and shows attribution.
- Unavailable WebGL, invalid bundled texture and thrown-draw tests pass,
  retaining credit and stopping graphics calls, decoding attempts and animation
  scheduling. All three attribution links open their expected destinations.
- The distributable contains both bundles, the original archive, the prepared
  self-contained model, code license, and model/dependency notices in NOTICE.md.
- Rendering acceptance remains blocked on this machine. Headless Chromium's
  GPU process loses its graphics context on a minimal shader-drawn triangle,
  including outside BB. Chromium 120, 141 and 156 and both BB's native terminal
  and the agent command runner reproduce the failure. A successful context
  creation or clear operation alone does not establish working rendering.
- Consequently no visual direction, period, whisker appearance, resize framing
  or rendered lifecycle result is claimed as verified here. Run the rendering
  checks on a browser with functioning WebGL before release.

The full suite ran 11 tests: 5 passed and 6 failed. A launcher selector collision
found on an existing thread was corrected and that workflow was rerun separately.
The remaining rendering-dependent checks need functioning WebGL.

For the 24 rpm rotation and 20-cycle vertical bob update, build and typecheck
pass, as do the unavailable-WebGL, thrown-draw and package checks. The updated
rendered-motion check still cannot reach a visible scene on this host.

## Rotation speed tool (issue #3)

Removed by [issue #9](https://github.com/m3nowak/bb-plugin-maxwell/issues/9):
the speed now follows the viewed chat's context, as recorded in
[ADR 0004](adr/0004-context-driven-maxwell-motion.md). `tool.test.mjs` checks
that the setter is gone and that speeds saved by earlier versions are not read.

## Music verification (issue #5)

BB 0.47.1, Plugin SDK 0.6.79, Chromium 150 with hardware ANGLE
(`--use-angle=gl-egl --ignore-gpu-blocklist`) on the host's AMD GPU. A minimal
shader-drawn triangle renders correctly with these flags. It still renders
nothing with the default SwiftShader flags.

- Build, typecheck and the package check pass. The packed WAV has the issue's
  SHA-256, and the BB route serves identical bytes from both the source and
  the built server entry.
- All five music checks pass, along with the rotation timing, framing,
  attribution and failure checks.
- A plugin reload with an unchanged bundle keeps BB's frontend generation, so
  playback continues by host design. A manual check rebuilt a changed bundle
  and reloaded it during playback. The old generation stopped and released
  the recording within a second and did not resume.
- Two existing checks failed for reasons outside the music. The visibility
  check found a persisted New thread "New tab" active after re-showing the
  panel. The existing-thread check found no "Ask anything." composer in a
  thread with a running turn.
- Nobody listened to the recording during this verification.

## Free and capture (issue #7)

`free.test.mjs` drives Uwolnienie and Schwytanie Maxwella through real agent
turns. `tests/acceptance/driver/agent.mjs` is a scripted ACP agent. It reads
each prompt's last line as a tool name with optional JSON arguments and calls
that tool through the MCP server BB gives its session. The command therefore
takes BB's own path: provider, host daemon, server, the plugin's tool, then BB
realtime to the tabs. Tests never set frontend state directly.

The suite disables the plugin, navigates every connected BB window with
`bb thread open` and spawns threads. Run it against a dedicated BB, not one
in daily use:

```sh
bb-app --bundled --no-in-app-updates --data-dir /tmp/bb-maxwell-test \
  --server-bind-host 127.0.0.1 --server-port 39888 --host-daemon-port 39889 &
export BB_SERVER_URL=http://127.0.0.1:39888 MAXWELL_BB_URL=http://127.0.0.1:39888
bb plugin install "$PWD" --yes
bb plugin config provider-acp set customAgents \
  "[{\"id\":\"maxwell-driver\",\"displayName\":\"Maxwell driver\",\"command\":\"node\",\"args\":[\"$PWD/tests/acceptance/driver/agent.mjs\"]}]"
bb project create --name proj-a --root /tmp/maxwell-proj-a --machine <host-id>
bb project create --name proj-b --root /tmp/maxwell-proj-b --machine <host-id>
export MAXWELL_DRIVER_PROJECTS=<proj-a-id>,<proj-b-id>
```

Skip onboarding once in the browser. Each test spawns two driver threads,
one per project, and archives them when it ends.

The browser checks cover:

- Delivery to tabs viewing different projects, a reload and a new tab starting
  in panel mode, repeated free and capture reaching those tabs, and capture
  opening no panels.
- A capture missed while the realtime socket is cut, which is not replayed
  after reconnecting, followed by a capture that applies.
- One free scene per tab, which persists while a panel opens and closes
  during free, and through navigation between projects, split view and New
  thread.
- Diagonal flight at a constant pace, edge-only reversals on both axes,
  unchanged images across bounces, and resizing down to 240×180.
- Motion from the route's chat and the focused split pane, and the dance on
  New thread and in settings (see issue #9 below).
- Clicks on the cat, not its empty square, playing music. Playback continues
  across free, capture and repeated free. Free after a reload stays silent.
- The cat above BB's Ctrl+K dialog, with the dialog keeping the pointer
  elsewhere.
- Repeated transitions, hiding the tab and disabling the plugin, with no
  leftover scenes, render loops or contexts. Re-enabling starts in panel mode.

`tool.test.mjs` adds the SDK host contract for both tools: registration
without selection rules, rejected arguments, a published `mode` command for
every call whatever the thread or project, and a failed publication reported
as an error.

### Verification in this checkout

BB 0.47.1 and Plugin SDK 0.6.79 ran in a dedicated instance, with Chromium
using hardware ANGLE (`--no-sandbox --use-angle=gl-egl --ignore-gpu-blocklist`).
Build and typecheck pass. The full suite ran 36 tests: 34 passed and 2 failed.
All eight free tests and all twelve tool tests pass. The two failures are the
existing visibility check (`lifecycle.test.mjs:27`) and the existing-thread
check's missing "Ask anything." composer (`panel.test.mjs:84`). The same
checks fail identically against `main` on the same BB.

A real Claude Code or Codex agent did not call the tools. The scripted agent
reached them through BB's provider path, and both appeared in its session's
tool list with their descriptions.

## Context-driven motion and the dance (issue #9)

`motion.test.mjs` and the two motion tests in `free.test.mjs` supply known
context readings at BB's public thread routes. Playwright answers
`/api/v1/threads/:id/context` with a chosen reading, a failure or a delayed
reply, and `/conversation-outline` with no messages for an empty thread.
Thread changes come from real driver turns (`bb thread tell`) and a real
`bb thread clear`. The motion is measured in rendered pixels with frames held
by the probe, which also reports each scene's clock from its first drawn frame.

A speed is accepted only when one and twenty whole turns return the same
image and 1/2, 1/3, 1/4 and 1/5 of a turn do not. Twenty turns expose an
error of about 1%, such as rounding to whole percents. Both images are taken
where the three-second bob is at the same height. The chest's light pixels must cross the
view from right to left. The dance must repeat after 903 ms and after 20 more
periods, visibly lean to both sides, and keep the chest
in view in every frame. The probe also observes the model-view matrices sent
to WebGL. The model's head-to-tail direction must stay fixed while it rolls
to both sides. Angles half a period apart must be equal and opposite, and
its centre must stay fixed in all three dimensions. These are body-relative assertions, not
screen-relative ones. It must also fit the frame. A change
must start repeating its new motion within 250–700 ms. Consecutive frames,
and frames taken either side of a new target in mid-change, must not jump.
Turning to face the viewer, from 24 or 120 rpm, must not change the image
between frames much more than a full context's rotation does.

The dance period was measured from the swaying parts of the
[reference video](https://www.youtube.com/watch?v=rXh8Hvo7gfs) (0–3.6 s and
7.2–14.5 s at 24 fps). The cat's horizontal centre was fitted against
candidate periods: 0.9055 s over the first part and 0.9030 s over the longer
second part. One full sway takes 903 ms. The initial choreography also
copied the reference's asymmetric hop and lean. The user subsequently asked
for a symmetric sway in place instead, so only the reference's tempo is
retained. The plugin keeps Maxwell facing the viewer, as the issue requires.

The plugin uses roll around the model's local Z axis, which runs along its
body, with a sinusoidal amplitude of ±0.2 radians and no translation or hop.
Both modes use the same camera framing, avoiding a zoom during transitions.
Yaw and pitch oscillations are not part of the dance. The screen projection can change
shape during a body-relative lean, so constant silhouette area is not an
acceptance criterion.

The dance test writes one period of frames to `artifacts/dance-*.png`, and
the speed test writes quarter turns to `artifacts/rotation-*.png`. Compare
the dance frames in order with one period of the reference's swaying part.

The checks cover:

- 24, 48, 72, 96 and 120 rpm at 0, 25, 50, 75 and 100% of the window, 54 rpm
  at 31.25% of a 128k window, and 120 rpm beyond the window. 24 rpm and its
  direction are also checked with reduced motion.
- A failed read before any reading (24 rpm). After a valid reading, a failed
  read, no usage, negative tokens, a zero, negative or non-numeric window
  keep 72 rpm. A valid empty reading gives 24 rpm.
- A new reading in the middle of a speed change, which keeps the speed
  continuous and settles at the new reading.
- A drop after compaction, the same tokens in a smaller model window, and a
  clear. A read sent before the clear and answered after it is discarded,
  leaving 24 rpm until a new reading.
- Separate chats, a child agent's own chat, returning to a chat whose reads now
  fail (its last reading in the tab applies), a late reply for the chat just
  left, a second tab, and a reload.
- A missed change read again after the realtime socket reconnects.
- The dance on New thread, in an empty thread and with music playing, then
  rotation once the first message is sent and while the agent waits.
- The free cat following the route's chat, the focused split pane and
  settings, with one scene throughout. Its flight keeps its pace while the
  motion changes, and rapid navigation does not jump.

BB 0.48 shows one side panel in split view, so two Maxwell panels cannot be
placed side by side. A panel follows the thread its tab belongs to.

`tool.test.mjs` checks that `maxwell_set_rotation_speed` is no longer
registered and that no RPC serves the speeds earlier versions saved,
including 0 and 240.25 rpm.

### Verification in this checkout

BB 0.48.0 and Plugin SDK 0.6.79 ran in a dedicated instance with the driver
agent, with Chromium headless shell 1248 using hardware ANGLE
(`--no-sandbox --use-angle=gl-egl --ignore-gpu-blocklist`). Build and
typecheck pass. The full suite ran 37 tests: 34 passed and 3 failed. All
motion, free, music, failure-rendering and tool tests pass.

The three failures are not caused by this change:

- `lifecycle.test.mjs:27` and the existing-thread check's missing "Ask
  anything." composer (`panel.test.mjs:91`) are the failures recorded for
  issue #7.
- The attribution link check (`failures.test.mjs:78`) now opens a popup with
  no URL. It fails the same way when `main` is installed on the same BB
  0.48.0, which suggests BB's link handling changed since 0.47.1.

During the initial implementation, the dance frames were compared with the
reference's rest, hop, hold, return and lean. That shape has since been
replaced by the user's requested symmetric sway in place.

Turning to face the viewer was simulated separately for 5,000 random speeds,
angles and earlier changes. It never turned back, always ended facing the
camera, and took 0.4–0.7 s, peaking at 145 rpm only when entered from close
to 120 rpm. The browser checks bound its frame-to-frame change by that of a
full context.

Not verified here:

- Compaction and model changes made by a real provider. The driver agent
  does not support manual compaction (BB answers HTTP 409), so a compaction
  is a lower reading after a turn, and a model change a different window.
- Context readings reported by a real Claude Code or Codex agent.
- Two Maxwell panels side by side, which BB 0.48 does not offer.

### Body-relative dance correction in PR #11

The first correction removed dance yaw and pitch, but still applied roll
and sideways offsets relative to the viewer. Its silhouette-area assertion
checked the wrong requirement. The user clarified that the sway is relative
to Maxwell's own body, not the screen.

The replacement WebGL transform assertion fails on that version with
"The cat must roll about its own head-to-tail axis, not the viewer's axis".
Changing the Euler order from ZXY to YXZ makes roll follow the cat's heading;
rotating the sideways offset by that heading also keeps translation across
the body. The targeted browser test then passes on New thread, with music
and in an empty chat, and verifies rotation after the first message. The
hop, 903 ms tempo and smooth transitions are retained. Build and typecheck
pass, as do the six package and tool tests.

### Symmetric sway in place

The user removed the asymmetric hop and lateral displacement from the
requirements. The dance now uses a single sine wave, ±0.2 radians around
the same body axis, with the 903 ms period unchanged. Its centre stays at
rest; the vertical bob still applies during rotation only. Camera framing
is constant between modes.

The browser regression checks all 24 poses for a fixed WebGL translation,
and each pair half a period apart for equal and opposite roll. It rejects
the previous choreography with "The dancing cat must stay in place, without
sideways movement or hopping", then passes with the new sway, including
with music and in an empty chat. The two extreme poses must also differ in
rendered pixels. Build, typecheck and the six package/tool tests pass.
