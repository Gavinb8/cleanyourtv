# PADDOCK

A custom "pit wall at night" home screen for Gavin's onn 4K Plus (Google TV), replacing the
stock launcher on the Vizio D40f-J09. See `DESIGN.md` for what it looks like and why, `SPEC.md`
for how it was built phase by phase.

## What's installed where

- **`launcher-paddock/`** - the real launcher. Package `com.gavin.paddock`, installed as Home.
  This is what's actually running on the box.
- **`paddock/preview/`** - the browser prototype (open `index.html` through
  `python -m http.server` from that folder). Same HTML/CSS/JS as the real launcher's `assets/`,
  kept in sync by hand when either changes. Useful for iterating on the look without touching
  the box.
- **`paddock/spike/`** - the throwaway Phase 2 performance-test app. No longer installed on the
  box (uninstalled once the real launcher worked) and gitignored; safe to delete.

## Rebuilding and reinstalling

```
cd launcher-paddock
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

If `local.properties` is missing, create it with `sdk.dir=` pointing at your Android SDK, using
forward slashes even on Windows (backslashes get mangled by Java's `.properties` parser - this
bit us once already, see the commit history).

The install script does **not** touch Home - a plain `adb install -r` over an already-installed
app that already owns Home keeps it as Home. Only use
`adb shell cmd package set-home-activity --user 0 com.gavin.paddock/.MainActivity` if Home ever
gets reset (it can happen if the app crashes right after a fresh install, before Android has a
single preferred hander - you'll see Android's own "Select a Home app" chooser instead of PADDOCK
if that happens).

## Pushing new photos or config (no rebuild needed)

1. Drop new originals in `paddock/assets/cars-src/` (never committed).
2. `python tools/paddock-prep-photos.py` - resizes, desaturates, darkens, compresses to
   `paddock/assets/photos-prepped/` (also never committed).
3. Edit `paddock/garage.json` (car names, captions, which photos belong to which car - see
   DESIGN.md section 9 for the schema) or `paddock/paddock.config.json` (favorites, clock
   format, night hours) as needed.
4. `TV_HOST=<box ip> tools/paddock-push.sh` (or `.ps1` on Windows) - pushes everything to the
   box's app-specific external storage and reloads the launcher. Takes a few seconds.

Config and garage data on the box live at
`/sdcard/Android/data/com.gavin.paddock/files/paddock/` - plain app-specific external storage,
not true internal storage, specifically so it's writable with a plain `adb push`/the push
script, no `run-as` or debuggable build needed.

## Restoring the box to stock

The Phase 0 debloat list is `paddock/debloat-gavin.txt`. To fully undo everything PADDOCK and
the debloat pass did:

```
TV_HOST=<box ip> tools/restore.sh paddock/debloat-gavin.txt com.google.android.apps.tv.launcherx
```

This brings back every disabled package (including the original stock launcher) and hands Home
back to it. PADDOCK itself stays installed; remove it from Settings > Apps if you want it fully
gone, or `adb uninstall com.gavin.paddock`.

To go back to just the Phase 0 baseline (the repo's own plain launcher, `com.gathin.tvhome`)
without reverting the debloat: `adb shell pm enable com.gathin.tvhome` then
`adb shell cmd package set-home-activity --user 0 com.gathin.tvhome/.MainActivity`.

## Known losses

Things the stock Google TV launcher did that PADDOCK does not:

- **Google Home / smart-home device panel.** No dedicated app or reachable panel was found on
  this box once the stock launcher (`launcherx`) was disabled - `pm list packages` has nothing
  matching "home" or "assistant" beyond system packages. If you use Google Home to control
  smart-home devices from the TV, that's gone. (Worth re-checking after a firmware update, in
  case Google ships it as part of a system package rather than a separate app on this box.)
- **Remote hardware shortcut buttons** (YouTube, Netflix, Disney+, Paramount+ buttons on the
  physical remote) **do nothing.** On the stock launcher these were wired through its own
  accessibility service; PADDOCK doesn't have the equivalent yet (`InputKeyService`, same idea
  as the upstream `launcher/` module's). D-pad, OK, Back, Home and the mic button all work fine
  - just not these specific shortcut buttons. Fixing this is the next piece of work, whenever
  it's picked back up; it needs the physical remote in hand to verify properly (the button codes
  only come from real hardware, not `adb shell input keyevent`), so it wasn't done in the same
  overnight session as everything else.
- **Sport mode's app list uses real installed apps on the real box** via `Paddock.getApps()),
  but in the browser prototype it's still a mock list - that's expected and fine, just don't be
  surprised the two don't match if you're comparing them side by side.

## Performance notes (Phase 2 finding, 2026-10-24)

The WebView was leaking memory on rapid mode switches - not from the photos, from a cleanup
callback (`transitionend`) that silently never fires if a CSS transition gets interrupted by a
fast key-mash. Fixed with a plain timer instead. If memory ever looks wrong again after a future
change to the mode-switching code, check that fix is still in place first
(`paddock/preview/js/app.js`, `showMode`/`hideMode`) before assuming it's something else -
there's a full writeup in the Obsidian vault
(`troubleshooting/webview-display-none-vs-transitionend-memory.md`) if this ever needs debugging
again from scratch.

Idle CPU is noticeably above the plain baseline launcher (roughly 2x), traced to WebView's own
baseline overhead rather than anything PADDOCK's code does (confirmed by turning the photo-drift
animation and the 1-second clock tick off individually - neither changed the number). Still well
under the hard "10% of one core" budget, just over the softer "1.5x the native baseline" one.
Not investigated further.
