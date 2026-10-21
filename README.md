# VizzFX

One-click looks for Premiere Pro. Select a clip, click a look, and VizzFX builds it from Premiere's own effects. Everything stays editable in Effect Controls.

<img src="docs/panel-preview.png" width="340" alt="VizzFX panel">

**Looks:** Ghost Trail (soft black and white, dreamy trails) and Shattered Light (blown-out black and white, diagonal glass slices). More are coming.

## Install

Needs Premiere Pro 25.6 or newer.

1. Download `VizzFX.ccx` from [Releases](https://github.com/visuraW/vizzfx/releases/latest).
2. Double-click it and click Install.
3. Restart Premiere and open **Window → UXP Plugins → VizzFX**.

## Use

Select a clip on the timeline and click a look.

VizzFX adds layers on free tracks above your clip, and adds tracks if it needs more. It asks before covering other clips. Cancel changes nothing, and Ctrl/Cmd+Z undoes everything.

To reuse a look as a preset: select the effects in Effect Controls, right-click, and choose **Save Preset**.

## Problems

Open **Log** in the panel, click **Copy log**, and paste it into an [issue](https://github.com/visuraW/vizzfx/issues).

## Development

Plain HTML/CSS/JS, no build step. Looks are defined in `LOOKS` in `plugin/index.js`.

```bash
./scripts/build.sh                                        # makes dist/VizzFX.ccx
PR26=1 node tests/mock-premiere.js plugin/index.js ghost  # test without Premiere
```

MIT License.
