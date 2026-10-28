# Play Maxwell's music from one tab-scoped player served by a plugin route

Maxwell's music outlives panels, threads and scene failures, so the player belongs to a frontend content script rather than to the panel. BB mounts one content-script generation per tab and disposes it on disable, removal, a changed bundle and tab teardown. That gives one player per tab and a stop at each of those lifecycle ends. Panels only ask that player to start.

The recording is served by a plugin HTTP route from the unmodified `assets/stockmarket.wav`, rather than embedded as a data URL like the model's textures. Embedding would add about 3.4 MB to every app bundle load, and the package would no longer ship the checksummed original file.

The feature contract is tracked in [issue #5](https://github.com/m3nowak/bb-plugin-maxwell/issues/5).
