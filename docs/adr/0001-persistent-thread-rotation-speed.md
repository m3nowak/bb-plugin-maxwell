# Persist Maxwell's rotation speed per BB thread

Superseded by [ADR 0004](0004-context-driven-maxwell-motion.md).

Maxwell's rotation speed belongs to the BB thread and is shared by its agents. Persist the setting across panel closes, reloads, and BB restarts so reopening a thread restores its speed. Agents can change it while the panel is closed; keeping speed only in a panel or agent session would lose that thread-wide state.

This extends the original fixed-speed, non-persistent design in [issue #1](https://github.com/m3nowak/bb-plugin-maxwell/issues/1).
The feature contract is tracked in [issue #3](https://github.com/m3nowak/bb-plugin-maxwell/issues/3).
