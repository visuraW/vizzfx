# VizzFX handover

Where the project stands, how it works, and what's left. Written so a new session (or another developer) can pick up without the original chat.

## What it is

A Premiere Pro UXP panel (Premiere 25.6+, built against 26.3.2). Select a clip, click a look, and VizzFX builds it from Premiere's own effects, plus a few After Effects templates (.mogrt) for overlays. Everything stays editable in Effect Controls / Essential Graphics.

Repo: https://github.com/visuraW/vizzfx · Installer: `dist/VizzFX.ccx` (double-click to install).

## Repo layout

```
plugin/                 the plugin (no build step)
  manifest.json         id com.vizzfx.premiere, version, permissions
  index.html/styles.css panel UI: look cards, status line, sliders, Settings/Log drawers, dialog
  index.js              everything else
  luts/                 VizzFX_Thermal.cube
  mogrt/                bundled templates: HUD, LED grid, Lens Tube (Scanlines pending)
after-effects/          ExtendScript that builds each template and exports it to the Desktop
tests/mock-premiere.js  fake Premiere API + DOM to test the logic without Premiere
scripts/build.sh        zips plugin/ into dist/VizzFX.ccx
```

## How index.js is organized

- **`LOOKS`**: one entry per card (`name`, `desc`, `signature`, and `apply` for custom looks). Adding an entry adds a card.
- **`EFFECTS`**: effect key → display names and match names. Effects are found by match name first, then by name. Legacy versions are preferred on Premiere 26, because their setting names are known.
- **`CONTROL_DEFS`**: the sliders for each look. Each slider has an `apply(ctx, value)` that updates the selected clips live. Values persist in localStorage.
- **Helpers**:
  - `addEffects` inserts effects (with fallbacks).
  - `configure` / `setParams` set settings by display name (`"a|b"` tries alternatives). If a name isn't found, they log the effect's real setting names.
- **Tracks**:
  - `assignTracks` / `prepareTracks` find free tracks, ask before covering clips, and try to auto-add tracks.
  - `cloneTo` duplicates the clip onto another track for the layered looks.
- **Overlays**:
  - `addOverlay` inserts a 1920-square template above the clip, passes in the frame size, and scales it for 4K.
  - `findOverlay` / `setOverlayParam` drive the template's controls from the sliders.

## Looks (14)

| Look | How it's built |
|---|---|
| Ghost Trail / Shattered Light | Lumetri B&W, Directional Blur, Noise, Crop. Trail layers replace Echo (removed in Premiere 26). Shattered adds a delayed, zoomed slice layer cut by two Linear Wipes. A glow layer goes on top. |
| Low Shutter | Posterize Time at 6 fps, Gaussian + Directional Blur, Noise, Dip to Black at the start |
| Thermal | Gaussian, Lumetri, Noise. The LUT has to be picked by hand once: VizzFX saves `VizzFX_Thermal.cube` where the user chooses. |
| Tracking HUD | `VizzFX_HUD.mogrt`: editable text, box position and size (keyframe Box Center to track a face) |
| LED Pixel | Mosaic (rows 8–1080, square pixels on any frame shape), Lumetri, RGB Split, Wonder Glow, plus the `VizzFX_LED_Grid.mogrt` overlay |
| Diamond X-Ray | B&W, Lumetri, Noise (sparkle), Gaussian (crystal size), Brightness & Contrast (crush), Sharpen, Glint, Wonder Glow |
| Film Grain | Noise (Legacy), mono. A global Grain slider updates live. |
| Neon | Tint (palette swatches or a custom hue), Lumetri, RGB Split, Wonder Glow |
| Light Rays | Glint and Volumetric Rays, both driven by the clip's highlights |
| Lens Tube | Lens Distortion, a Lumetri vignette, and the `VizzFX_Lens_Tube.mogrt` overlay (ring and bokeh) |
| CRT Lines / CRT TV | the `VizzFX_Scanlines.mogrt` overlay. CRT TV also adds Gaussian, RGB Split, Lumetri and Noise. |
| Video Wall | Replicate (2×2 or 3×3) |

## Things learned about Premiere 26 (don't re-discover these)

- **Removed effects:** Echo is gone. Noise, Gaussian Blur and Directional Blur were replaced by Film Impact versions, but the originals still exist as "(Legacy)".
- **LUTs:** plugins can't load them. In Lumetri, Input LUT and Look are menu positions, and the LUT data (LUTAsset/Blob) is unreadable.
- **Tracks:** there's no add-track API. Auto-add puts a probe copy just above the top track and checks whether a new track appeared.
- **Dropdown values:** Opacity Blend Mode reads **18** on a normal clip, so the enum isn't the menu order. The value for Screen is still unknown (Settings → Advanced, default guess 8).
- **Templates:** `insertMogrtFromPath(path, time, videoTrack, audioTrack)` works, and template controls can be set by display name. The plugin finds its own bundled files with `getPluginFolder().getEntry()`, because `nativePath` isn't reliable.
- **After Effects scripting:**
  - Adding effects or layers invalidates earlier property references, so look properties up by name each time.
  - 2D layer rotation is `ADBE Rotate Z`.
  - The template preview video renders transparency wrongly; trust `thumb.png`.
- **Colors:** set them with `new ppro.Color(r, g, b, 1)`, values 0–1.

## Labels, Remove and Applied (v1.11)

- Every effect VizzFX adds is labeled with its instance name, `VizzFX · <Look>`, which shows in Effect Controls.
- Copies and templates are named the same way on the timeline.
- **Remove** (under a look's sliders) and the **Applied** tab find items only by those labels, so they never touch the user's own effects.
- Premiere has no API to switch an effect on or off, so Applied can only switch **layers** on and off; effects can only be removed.

## Open items

1. **Scanlines template:** `VizzFX_Scanlines.mogrt` was exported to the user's Desktop but hasn't been sent yet. Bundle it into `plugin/mogrt/` to complete CRT Lines and CRT TV.
2. **Film Impact setting names** (Glint, Volumetric Rays, Wonder Glow, RGB Split) are partly guesses. A blog lists RGB Split as Channel Shift, Vertical Split, Position, Feather, Lightness and Softness. Volumetric Rays has Intensity and Ray Length. Glint may have no ray-count setting at all, which would explain why the Rays slider does nothing. Get one real log (the missing-setting warnings list the actual names) and fix `SPLIT_PARAM`, `GLOW_PARAM` and `RAYS`.
3. **Screen blend value:** set a glow layer to Screen by hand, run Inspect, and put the number in the default.
4. **Keyframe timing** (Shattered slice drift) is assumed to be measured from the clip's in point. Unverified.
5. **Verify in Premiere:**
   - LED grid lines line up with the pixels
   - Diamond X-Ray defaults (preview looked too dark)
   - Grain default (4) compared with the reference flyer
6. **Thermal without the manual step:** try installing the LUT into Premiere's LUT folder and selecting it in Lumetri's Look menu. The real fix is a native C++ effect with a built-in gradient map (phase 3).
7. **Phase 2:** transitions (e.g. flash, zoom punch, smoke). The API can add built-in transitions but can't change their settings. Custom ones would need keyframed effects at the cut.

## Working on it

```bash
# test without Premiere (env: PR26=1, VTRACKS=n, BUSY=1, FRAME=1080x1920, AUTOADD=create|throw|clamp, DIALOG=cancel, CTRL="Label=value", SWATCH=i)
PR26=1 node tests/mock-premiere.js plugin/index.js led
./scripts/build.sh            # dist/VizzFX.ccx
```

Bump the version in both `plugin/index.js` (`VERSION`) and `plugin/manifest.json`, add a CHANGELOG entry, build, commit, push. Commits go out under the owner's name only, with no co-author lines.

To resume in a new Claude Code session, attach `visuraW/vizzfx` and start with:
> Read HANDOVER.md, then continue VizzFX. Next: <what you want>.
