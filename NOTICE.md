# Code

Maxwell adapts the scene and lifecycle approach of och-plugin-demo by Mikołaj
Nowak, inspected at commit 8d27445e1b410031ce0ea4d9f113156b6ba28d26.
The original MIT notice is retained in LICENSE. The BB panel, registrations,
asset preparation and acceptance harness are adaptations in this repository.
No rat assets are included.

# Model

"Maxwell the cat (Dingus)" by bean(alwayshasbean), licensed under CC BY 4.0.

- Creator: https://sketchfab.com/alwayshasbean
- Source: https://sketchfab.com/3d-models/maxwell-the-cat-dingus-2ca7f3c1957847d6a145fc35de9046b0
- License: https://creativecommons.org/licenses/by/4.0/
- License metadata: https://api.sketchfab.com/v3/models/2ca7f3c1957847d6a145fc35de9046b0
- Supplied archive: https://pc.miknowak.pl/s/H4gRK5j9kSi2DYg
- Archive SHA-256: 74eadc0121b84655693dcbbea86d45ebdf31f2aa2222db1023a46747f6ac2818

The original archive is preserved in assets/maxwell-source.zip. It contains
an FBX, a JPEG body texture and a PNG whisker texture, with no license file.
The source model's metadata identifies the CC BY 4.0 license.

scripts/prepare-model.mjs bakes the FBX node transform into geometry, centers
it at its bounding-box midpoint, rotates its long axis toward the camera and
scales it to scene units. It preserves positions, normals, UVs and the two
material groups in assets/maxwell.json, along with the original texture bytes
as data URLs. This JSON format avoids a runtime FBX parser and external asset
requests. It is used instead of the suggested GLB conversion.

The original absolute Windows texture paths are replaced with the supplied
images. The whisker reference dingus_whiskers.tga resolves to the actual
supplied dingus_whiskers.tga.png. Runtime materials use sRGB textures and a
Lambert lighting model; whiskers use the PNG alpha channel, double-sided
rendering, alpha testing at 0.05 and disabled depth writing. No texture pixels
are edited. Rotation is applied around the normalized vertical axis.

The panel displays creator, source and license credit below the scene, including
when rendering fails. This notice records the modifications.
