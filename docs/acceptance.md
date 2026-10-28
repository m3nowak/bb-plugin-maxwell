# Acceptance checks

The agreed test boundary is the installed plugin through BB. Tests use real
Actions entries on New thread and an existing thread, the bundled renderer,
browser graphics calls and rendered pixels. They do not import panel internals.

Run `npm run build`, install or reload `maxwell` in BB, then run `npm test`.
`tool.test.mjs` loads the built server bundle into the Plugin SDK's fake host
and calls the registered agent tool as a provider tool call would.
Set `MAXWELL_BB_URL` for the host and `MAXWELL_THREAD_ID` for an existing thread.
BB threads supply `BB_SERVER_URL` and `BB_THREAD_ID` as defaults.

The suite covers locally bundled assets, missing WebGL, invalid image data,
context loss, attribution retention, 24 rpm rotation and vertical motion at 20 cycles per minute under both
motion preferences, framing, theme changes, hidden views and repeated closing.
Rendering tests fail on unusable graphics hardware, rather than skipping.

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
