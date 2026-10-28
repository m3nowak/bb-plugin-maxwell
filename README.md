# Maxwell
Maxwell for BB. Click the cat to play its music.

Music source and inspiration: [Maxwell on the KDE Store](https://store.kde.org/p/2274580).

Agents can set how fast Maxwell rotates with the `maxwell_set_rotation_speed`
tool. It takes a required `rpm`: any finite number of revolutions per minute
greater than or equal to 0. Zero stops rotation; bobbing continues. The speed
belongs to the calling thread, is shared by its agents and persists across
reloads and BB restarts. Threads without a saved speed, and New thread, use
24 rpm.
