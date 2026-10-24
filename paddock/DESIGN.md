# PADDOCK: design

Reference screen: 1920 x 1080, viewed on a 40 inch TV from several feet away. Every size below is in px at that size. The UI is drawn on a fixed 1920 x 1080 stage and scaled to fit whatever the real resolution is.

## 1. The idea

**Metaphor:** a pit wall at night. A dark room, a few instruments, a timing screen, and the cars waiting in the garage.

**Foil (what it must not look like):** a streaming app. No rows of posters, no cards, no tiles, no "recommended for you", no ads, no menu bars.

Every decision gets one test: does this belong on a pit wall? If a label, shape or animation would look at home on a timing screen or an instrument cluster, keep it. If it looks like a phone home screen, cut it.

## 2. Rules

1. **Calm first.** It stays on for hours. Low contrast, slow motion, nothing flashes. Brightness peaks only on whatever is focused.
2. **Motion carries content.** The only things that move on their own are the lap dot (it is the time) and the slow drift on the car photo (it is the garage). Fast motion happens only in response to a key press. No decorative loops. The startup sweep (5.6) is the one sanctioned exception: a short, triggered, one-shot, skippable self-test on cold start or wake, not a loop and never shown on the ambient screen. Anything new that wants to animate without a key press or without being real data belongs there or nowhere - that is the test, not a case-by-case judgment call.
3. **One accent color.** Signal red (`--accent`). The launch flash is a separate, near-white "hot" color (`--flash`), not a brighter or more saturated red - the flash has to read as a different thing happening, not the same color turned up. (Earlier version of this rule used orange/red; changed 2026-10-24, see section 6.)
4. **Dark only.** No light theme.
5. **Type and line work, not boxes.** Thin 2px lines, big condensed type, tabular numbers. Photos are atmosphere behind everything, never in frames or cards.
6. **Everything on screen is real.** Time, lap number, network state and the car captions are true or typed by Gavin. No placeholder numbers, no invented specs.
7. **Straightforward words.** All caps condensed labels, short. No jokes, no marketing copy.

## 3. How cars show up

Cars are in the design in four ways, none of which involve drawing a specific car.

1. **Photos Gavin owns.** His own Audi and any car photos he took (meets, track days, driveways). Photos are the garage layer behind the ambient screen.
2. **Typography plates.** Cars he likes but has no photo of (GT4 RS, 911 GT3 RS, other 911s) get a text plate: the name in huge condensed type over a faint measurement grid (horizontal rules with tick marks, like a drawing sheet). Gavin writes any detail lines himself. No made-up specs.
3. **Instrument language.** The lap clock, the tach needle, the gear indicator, the odometer, the startup sweep. These make the whole screen feel like a cluster without showing a car.
4. **Racing structure.** The day is a 24 lap race. One lap is one hour, so `LAP 21 / 24` means it's the 21st hour of the day (9pm), not a countdown or a separate 24-lap timer. Each lap has three sectors of about 20 minutes each - not a "3 hour clock," three sectors *per lap*, and a lap is one hour (this tripped Gavin up reading it cold, 2026-10-24, so spelling it out here). The circuit shape is an original closed curve (see 5.1).

**Hard rules for Claude Code:**
- No manufacturer logos, crests, wordmarks or badges anywhere. Car names appear only as plain text in the app's own typeface.
- Do not draw, trace or recreate any real car's shape or silhouette, and do not generate "inspired by" car outlines. If a car has no photo, it gets a typography plate.
- Photos must be ones Gavin took or has the right to use. Keep a `paddock/assets/CREDITS.md` that says where each photo came from.
- The circuit is an original shape, not a copy of a real track's trademarked layout art. If Gavin wants a real circuit, he supplies a simple outline he is happy with.

## 4. Modes

There are four modes. A single letter in the top-left corner always says which one you are in, like a gear indicator.

| Letter | Name | What it is |
|---|---|---|
| N | Neutral | The ambient home screen. This is where it rests. |
| D | Drive | Pick an app with the needle. |
| S | Sport | Full app list. |
| P | Park | Night dim. Almost black, one tiny drifting clock. |

### Key map

| Key | In N | In D | In S | In P |
|---|---|---|---|---|
| Left / Right | Previous / next car | Move needle | (none) | Wake to N |
| OK | Go to D | Launch the app under the needle | Launch the selected app | Wake to N |
| Down | Go to D | Go to S | Next row | Wake to N |
| Up | Showroom (full screen cars) | Back to N | Previous row, or back to D at the top | Wake to N |
| Back | Nothing (swallow it) | Back to N | Back to D | Wake to N |
| Home | Nothing | Back to N | Back to N | Wake to N |
| Hold OK (0.5 s) | (none) | Small text menu: Move, Remove | Same | (none) |

Showroom (reached from N with Up) has its own keys: Left/Right changes car, and Back, Up or OK all return to N - Back alone being the only way out was a real complaint (Gavin, 2026-10-24), so Up (the same key that opened Showroom) and OK both work too.

Idle timers: D returns to N after 20 seconds of no keys. N goes to P after the night rule (section 8) is met.

## 5. Screens

### 5.1 N, ambient (the one it lives on)

```
 N                                                         LAP 18 / 24
 ........................................................................
 .  photo layer fades in from the right, scrim on the left side          .
 .   ______                                                              .
 .  /      \___        circuit outline, thin line,                       .
 . |   o      \         glowing dot = where you are in this hour         .
 .  \___    __/          S1 . . S2 . . S3  (current sector in orange)    .
 .      \__/                                                             .
 .                                                                       .
 .  5:42                                                  CAR NAME       .
 .  FRI  OCT 23                                           caption line   .
 .                                                         spec line      .
 ........................................................................
 ODO 1,284 LAPS                                        ETH   READY
```

- **Lap clock.** A closed circuit outline about 560 x 300, top left area (x 96, y 150). The line is `--line`. The part of the lap already driven is drawn in accent at 3px. The dot sits at the current position: `minute and second / 60` of the way around. Three sector ticks at one third and two thirds. The labels S1, S2, S3 sit near the ticks, with the current sector in accent and the others in dim text.
- **Time.** Big, left aligned under the circuit. 12 hour by default, no seconds, no AM/PM clutter (a small "PM" next to it is fine). 280px IBM Plex Mono Light. Date under it in condensed caps, 36px.
- **Lap counter (top right).** `LAP 18 / 24` where lap number = current hour + 1. At the top of every hour the dot completes its lap, and for 3 seconds the counter flashes accent and ticks up. This is the one tiny event the screen has.
- **Photo layer.** Right 65 percent of the screen, fading to the background color on the left and with a bottom scrim as well (text over a bright photo needs both to stay readable - check contrast with the brightest photo on the real TV). Slow drift: scale from 1.00 to 1.04 over 120 seconds toward the focus point of that photo, then restart on the next car. The garage rotates through every photo, not one per car: a car can list several (`photos: [...]` in `garage.json`), and the rotation walks through all of them in order before moving to the next car. Crossfade happens on the lap clock's own sector structure - 6 fixed checkpoints per lap (every 1/6 of the hour, about 10 minutes: the two real sector ticks at 1/3 and 2/3 plus their midpoints), not an independent timer, so the photo and the clock never drift apart. Or immediately when you press Left/Right.
- **Car caption (bottom right of the photo).** Name 44px condensed caps. One caption line and up to two detail lines, 28px mono, written by Gavin in `garage.json`.
- **Bottom left readout.** `ODO 1,284 LAPS`. Counts hours since the launcher was installed. Optional.
- **Bottom right readout.** Network type (`ETH` or `WIFI`) and `READY` or `OFFLINE`.
- **Typography plate cars** (no photo): replace the photo layer with the car name at 220px condensed caps, very faint (accent at 10 percent opacity) over the measurement grid, and the caption block as normal. The name on a plate is allowed to run off the right edge.

### 5.2 D, drive

```
 D                                                         LAP 18 / 24
 5:42    (clock shrinks to the top left, circuit hidden entirely - it read as a stray
          leftover shape when just dimmed, Gavin 2026-10-24)

                      N E T F L I X
                      STREAMING

          .  .  .  .  .  .  .  .  .  .       <- shallow arc, ticks at each app
         YT   NF   PR   KD   ...  ALL   SET    <- tick labels under the arc
                      |
                    (needle, a short radial line pointing at the focused tick)
```

- The arc is a very shallow tach sweep along the lower third. Start values: radius 2600, spans plus and minus 20 degrees around vertical. The arc top sits near y 790, ends near y 950. Needle pivot is off screen below. Only the part of the needle between radius R minus 260 and R plus 10 is drawn.
- A thin `--line` arc traces the track the ticks sit on and the needle sweeps - this is the real path, not decoration, the same idea as the circuit line in N.
- Positions: up to 9. Favorites in the order set in config, then `ALL` (opens S) then `SET` (opens system settings). `ALL`'s sub label is "Every app on the box", `SET`'s is "System settings" - they didn't explain themselves before (Gavin, 2026-10-24).
- Each tick has the app's own icon (or a text label if the app has no icon), drawn desaturated white at 45 percent, with a small position number (01-09) under the label in `--text-faint`. The focused one is full color and 1.25x.
- The needle itself is a tapered gauge shape (narrower at the tip), with a small ringed pivot dot where it meets the arc - detail Gavin asked for so Drive mode reads as more of an instrument and less like a plain line (2026-10-24).
- The focused app's name appears huge above the arc (120px Barlow Condensed semibold caps, with 0.02em tracking). Under it a 28px dim sub label (set in config, optional).
- Needle motion is a spring with a small overshoot. See section 7.
- OK launches. The needle swings a little past the item, the tick and needle flash to `--flash` (white-hot, not red - red is the base color now) for 120ms, the whole screen fades out as the app starts (total under 250ms, never delays the launch).

### 5.3 S, sport (all apps)

- The needle arc slides away. Left 40 percent keeps the dimmed photo and clock.
- Right 55 percent is a typographic wheel list of every launchable app, alphabetical. Seven rows visible. The focused row is 72px condensed caps in full text color. Neighbors fade with distance: 48px at 70 percent, 36px at 40 percent, then gone.
- Scroll with up and down. Holding a direction accelerates, and a large single letter shows on the left while fast scrolling.
- No icons in this list. Text only. It should feel like a gear list, not an app drawer.

### 5.4 Showroom (up from N)

- Photo goes full bleed, scrim drops to 25 percent, clock and circuit fade out.
- Thin corner brackets (like a viewfinder) 48px from each edge, in `--text-dim` at 40 percent.
- Caption block bottom left, same type as N.
- Auto advance every 12 seconds. Left/Right changes car. Back returns to N.

### 5.5 P, park (night)

- Background `#000000`. Nothing else but a single small clock (96px, 20 percent brightness) that moves to a new random position every 5 minutes (burn-in protection) and fades between positions over 3 seconds.
- Any key wakes to N with a 400ms fade.

### 5.6 Startup sweep (cold start and wake only)

When the launcher process starts, or when it comes back after the screen was off for more than 10 minutes, play a short cluster self test: the needle sweeps from the left end to the right end in 700ms, then back in 500ms, and the ticks light up in sequence as it passes. About 1.2 seconds total. Any key skips it. It does not play when you just press Home from an app.

Alongside the needle, a small flat-six ignition plays once: two rows of three pistons (line-art, 2px `--line` outlines) with a thin crank line between them, top row stroking down and bottom row stroking up in a staggered firing order, each piston flashing `--accent` briefly as it "fires." Pure `transform`/`opacity`, matches the needle sweep's timing, skipped by any key exactly like the sweep, `display:none` outside this screen so it costs nothing the rest of the time. This is the one place in the whole design an animated engine was approved (council review, 2026-10-24): an idling engine anywhere on the ambient screen is the textbook "decorative loop" rule 2 bans, but a triggered one-shot in this already-sanctioned slot is not. If reduced motion is on, this is skipped entirely, same as the rest of the flourish.

**Considered and rejected, 2026-10-24 (Gavin asleep, council-reviewed, write-up kept here so it's a recorded decision and not a silent drop):** a second dot racing around the circuit, separate from the real time-of-day lap dot, as a visual flourish tied to the photo rotation. Rejected unanimously - it duplicates information already shown (the current sector is already highlighted), and a second self-moving object is a direct violation of rule 2's "the only things that move on their own are the lap dot... and the slow drift on the car photo." If Gavin still wants that effect after reading this, the compliant version is syncing the sector tick's own color change with the photo crossfade (both already happen off the same event) rather than adding a new moving part.

## 6. Visual tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0C0D` | Background |
| `--bg-raise` | `#131517` | Rare subtle surfaces (list focus bar, menu) |
| `--line` | `#2B2F33` | Circuit, arc, rules |
| `--text` | `#E8EBED` | Primary text |
| `--text-dim` | `#8E979E` | Secondary text, unfocused labels |
| `--text-faint` | `#4D555B` | Decoration only (grid lines). Never for text that must be read. |
| `--accent` | `#D1392F` | Needle, lap dot, current sector, focus |
| `--accent-soft` | `rgba(209,57,47,0.18)` | Glow behind the dot and focused tick |
| `--flash` | `#FFF4EC` | Launch flash only - near-white, not another shade of red (see rule 3) |

Changed 2026-10-24 from orange/red to red/white-hot on Gavin's call, via council review: red/green was considered and rejected for the flash color specifically because red-green is the worst-case pairing for red-green color blindness, the most common form - white has no such collision. **Not yet verified on the real TV at night brightness** - do that before treating this as final, red as a constant multi-hour ambient color is a bigger swing than orange was.

Text on top of a photo must still reach 4.5:1 contrast. Use the left scrim and a bottom scrim, and test with the brightest photo.

### Type (bundle locally, both are SIL OFL, include the license files)

- **Display and labels:** Barlow Condensed, 500 and 600. All caps for labels. 0.04em to 0.08em tracking for small labels.
- **Numbers and readouts:** IBM Plex Mono, 300 and 400. Tabular figures so digits never jiggle.

| Role | Size |
|---|---|
| Clock numerals (N) | 280px Plex Mono 300 |
| Focused app name (D) | 120px Barlow Condensed 600 |
| Car name | 44px Barlow Condensed 600 |
| Date | 36px Barlow Condensed 500 |
| Lap counter, readouts, captions | 28px Plex Mono 400 |
| Tick labels | 26px Barlow Condensed 500 |
| Minimum for any text | 26px |

### Safe area

Keep all content inside 96px left and right, 54px top and bottom. TVs may crop the picture. The Vizio's own picture size should be set to show the full frame, and Claude Code should check for clipping on the real TV.

## 7. Motion

| What | How |
|---|---|
| Needle move | Spring. Start with stiffness 220, damping 18, mass 1. About 6 to 9 percent overshoot, settled in under 450ms. |
| N to D | 420ms. Clock scales to 0.42 and moves top left. Circuit hidden entirely (not dimmed - see 5.2). Arc rises 40px and fades in, ticks stagger in 30ms apart. Photo scrim darkens from 55 to 80 percent. |
| D to N | Reverse, 320ms. |
| Launch | Needle overshoots 6 percent, flash to `--flash` for 120ms, fade out 130ms. Launch the intent first, then animate. Never wait for the animation. |
| Lap dot | Updates every 5 seconds. It does not need smooth motion. It is about half a pixel per second. |
| Photo drift | Scale 1.00 to 1.04 over 120s, linear, GPU transform only. |
| Photo crossfade | 2.5s opacity, triggered by the sector checkpoints in 5.1 (not an independent timer). |
| Hour rollover | Counter flash 3s, dot reaches the finish tick, then a new lap starts. |
| Startup sweep | See 5.6. |
| Mode visibility | Every inactive mode is `display:none`, not just `opacity:0` - six full-screen mode containers all staying in the render tree at once was a real, measured GPU memory cost on the box (Phase 2 finding, 2026-10-24). JS sets `display:block` just before the opacity transition starts and `display:none` after it ends, timed with a plain timer rather than the `transitionend` event - a fast key-mash interrupts a CSS transition before it finishes, so `transitionend` never fires and the mode never gets hidden. That was the actual cause of memory climbing on repeated mode switches, not the photos. |

Only animate `transform` and `opacity`. No blur, no CSS filters, no animated shadows, no animated gradients. Bake the glow around the dot and the focused tick into a small pre-rendered radial gradient image.

A `reduced_motion` setting turns off the photo drift and springs, and uses plain 150ms fades.

## 8. Always on, night, and burn-in

- The system screensaver is turned off for this box so it does not cover the home screen (SPEC.md Phase 4 handles this, with a restore record).
- The Vizio is an LCD, so burn-in risk is low, but keep the habits: drift the photo, shift the clock a few pixels every 10 minutes (plus or minus 12px), never hold more than about 15 percent of the screen at pure white.
- **Night rule:** between 23:00 and 06:00 (configurable), after 30 minutes with no key, fade over 10 minutes to P. Any key wakes to N.
- The LCD backlight still burns when the picture is black. If Gavin does not need the TV on overnight, the Vizio's own sleep timer or auto power off should handle it. PADDOCK cannot turn the TV off.

## 9. Data and assets

### Photos

- Gavin drops originals in `paddock/assets/cars-src/` (never shipped or committed).
- `tools/paddock-prep-photos.py` (Claude Code writes this) makes 1920 x 1080 cover crops, desaturates 25 percent, darkens to about 60 percent brightness, and saves JPEG quality 82 under 600KB each. Max 12 photos. The treatment is baked in so the TV does no filtering at runtime.
- Prepared photos go to the box with a push script (SPEC.md section 6). They are not inside the APK.

### `garage.json`

```json
{
  "cars": [
    {
      "id": "daily",
      "name": "NAME YOU WRITE",
      "caption": "One short line you write.",
      "lines": ["DETAIL LINE ONE", "DETAIL LINE TWO"],
      "photos": ["daily-01.jpg", "daily-02.jpg", "daily-03.jpg"],
      "focus": { "x": 0.62, "y": 0.55 }
    },
    {
      "id": "dream-1",
      "name": "NAME YOU WRITE",
      "caption": "One short line you write.",
      "lines": [],
      "photos": [null]
    }
  ]
}
```

`photos` is a list - a car with several photos rotates through all of them (every photo gets its own slot in the rotation, in order, before moving to the next car) rather than only ever showing the first one. A single `null` entry means a typography plate for that car. The older single `"photo"` field (one photo, or `null`) still works and is read as a one-item list, for anything written before this changed (2026-10-24, so all 12 of Gavin's photos actually show up instead of 8 of them sitting unused). `focus` is where the slow drift aims, as fractions of the image - one `focus` per car still, not per photo, since Claude Code can't know the right framing for each shot without seeing it; ask Gavin to fine-tune per-photo if it matters. Claude Code should ask Gavin for the real entries. It must not fill in specs from memory.

### The circuit

`paddock/assets/circuit.svg`: one closed path, about 560 x 300. Original shape, drawn by hand or generated, not traced from anything. A short mark at the start and finish point. Sector ticks are drawn by code at one third and two thirds of the path length. Redrawn 2026-10-24 to be more winding (roughly 22 corners now, two weaving sections added to the long straight and the return leg) - Gavin asked for "Nurburgring energy" and DESIGN.md's own no-tracing rule (above) rules out literally copying that track's layout, so the fix was more corners and character in an original shape instead, not a real outline.

## 10. Copy

- All labels caps: `LAP 18 / 24`, `ODO 1,284 LAPS`, `ETH`, `READY`, `OFFLINE`, `ALL`, `SET`.
- Errors are one calm line in the bottom right readout: `CONFIG ERROR`, `NO PHOTOS`. Never a dialog.
- Empty garage: show a typography plate that says `GARAGE EMPTY`.

## 11. Not in this version

- Weather, calendar, news. They need a network. If added later they must be a separate add-on app using the repo's module cards system, so the launcher itself stays offline.
- A tile or grid layout.
- Any control of the Vizio (input switching, power).
- Smart home controls inside PADDOCK. If the Google Home panel can still be opened from the launcher, add a `HOME` entry on the arc. Otherwise note it as a known loss.
- Sound.
