# Broadcast free and capture as commands to the tabs connected now

`maxwell_free` and `maxwell_capture` publish one realtime command per call to
every connected BB tab, whatever the calling thread or project. Each tab keeps
its display mode in memory for its frontend generation, starting in panel
mode. Nothing is stored, and a tab that misses a command is not sent it again.

An agent tool call carries no tab identity, so BB cannot target the tab that
asked. A saved, shared mode would make every new and reloaded tab inherit
it. That would leave no local way back to panel mode, and replaying missed
commands would bring delayed mode changes. Because the server does not know
each tab's mode, it publishes every repeat. Tabs ignore a command for the mode
they already have, so a repeated free never restarts a flight.

The free cat is drawn by an `experimental_appOverlay` component. BB mounts it
once per window, outside panels and routes, so it survives panel closing and
navigation. The same component receives the commands.

The feature contract is tracked in [issue #7](https://github.com/m3nowak/bb-plugin-maxwell/issues/7).
