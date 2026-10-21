# Changelog

## 1.9.1
- Eye template bundled: Eye View works fully.

## 1.9.0
- New looks: Eye View, CRT Lines, CRT TV, Video Wall.
- Lens Tube template bundled.
- One After Effects script builds both the Scanlines and Eye templates.

## 1.8.0
- New looks: Neon (palette swatches + custom hue), Light Rays, Lens Tube.
- LED Pixel goes up to 1080 rows.
- When a slider can't find an effect setting, the log lists the setting names the effect has.
- After Effects script for the Lens Tube template.

## 1.7.1
- LED grid template bundled: LED Pixel now has gaps and subpixel lines.

## 1.7.0
- New looks: LED Pixel (pixel count by rows, square pixels on any frame shape) and Diamond X-Ray.
- Live sliders per look: Pixels, Gap, RGB split, Glow, Saturation / Sparkle, Crystal size, Crush, Brightness, Glow.
- After Effects script for the LED grid template.

## 1.6.0
- Film Grain look, matched to a reference flyer (fine, monochrome).
- Grain slider updates grain live on selected clips; re-applying updates instead of stacking.

## 1.5.2
- Thermal: "Save LUT file…" puts the LUT where you choose, instead of a hidden plugin path.

## 1.5.1
- HUD template bundled: Tracking HUD works without After Effects.

## 1.5.0
- New looks: Low Shutter, Thermal, Tracking HUD.
- Thermal LUT tuned to reference footage; After Effects script that builds the HUD template.
- Prefers Legacy effects on Premiere 26 so settings apply reliably.

## 1.4.1
- Responsive panel: cards reflow from 1 to 4 columns, rows wrap instead of overlapping, panel resizes down to 200px.

## 1.4.0
- Renamed to VizzFX. New minimal panel: look cards, one status line, Settings and Log drawers.
- High-contrast text throughout.
- Looks are data-driven: a new `LOOKS` entry gets a card automatically.

## 1.3.0
- Finds free tracks above the clip; asks before covering existing clips.
- Experimental automatic track adding; otherwise offers a lighter build.
- Warns before applying a look twice. All questions come before any change.

## 1.2.0
- Premiere 26 support: Echo replaced with trail layers; effects looked up by flexible names; missing effects skipped.
- List effects diagnostic.

## 1.1.0
- Status line, Copy log, and fallbacks when adding effects.

## 1.0.0
- First release: Ghost Trail and Shattered Light.
