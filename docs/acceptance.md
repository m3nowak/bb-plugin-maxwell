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
context loss, attribution retention, 24 rpm rotation and vertical motion at 20 cycles per minute under both
motion preferences, framing, theme changes, hidden views and repeated closing.
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

`tool.test.mjs` covers the agent tool contract at the SDK host boundary: one
registered setter exposed without selection rules, the saved rpm returned
unrounded for 0, 0.5, 240.25 and extreme finite values, the 24 rpm default,
rejection of missing, negative, non-numeric, non-finite and thread-targeting
input without a state change, a missing thread identity, an injected save
failure, thread sharing and isolation, competing saves converging on the last
saved value and revision, and retention across a plugin reload.

BB's live tool route accepts only authenticated host daemon sessions, so the
browser suite cannot call the tool directly. One manual live check in BB
0.47.1 asked a Claude Code agent in a scratch thread to call the installed
tool with 0.5 rpm. The tool returned `{"rpm":0.5}`, the thread's saved speed
became 0.5, a browser viewing that thread's panel received the update on the
thread's channel and a second client viewing another thread kept 24 rpm.

Not verified here:

- Rendered speed: 0.5 rpm taking two minutes per revolution, 60 rpm after
  opening a panel, angle retention on change, zero rpm with bobbing, and
  extreme speeds. The rendering limitation above still applies.
- An actual BB restart and an agent-session reset. Speed is keyed only by
  thread in BB's plugin storage, and reload retention is tested.
- Two browser clients converging on competing live changes. The panel keeps
  the highest revision from its read and from realtime signals, and rereads
  after every reconnection.

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
- Speed from the route's thread, the focused split pane, live changes, and
  24 rpm on New thread. At 0 rpm the cat still bobs and flies.
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
