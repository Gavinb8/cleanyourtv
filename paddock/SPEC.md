# PADDOCK: build spec

Read `DESIGN.md` for what it should look like. This file is how to build it, in what order, and how to know it works.

## 1. Goal and scope

Build a custom Home launcher called PADDOCK for an onn 4K Plus running Google TV, based on the launcher in this repo (Clean Your TV). It replaces the stock Google TV home screen. It is offline, light, and meant to stay on screen all day.

**In scope:** the launcher, a browser prototype of it, a push script for config and photos, a photo prep script, docs.

**Out of scope:** anything on the Vizio TV itself, weather or any other network feature, sound, smart home control, Plex or Jellyfin integration (those apps are launched like any other app).

## 2. Target

| Item | Value |
|---|---|
| Box | onn 4K Plus, Google TV 14, Amlogic S905X5M, 2GB RAM, 16GB storage, Wi-Fi 6, USB-C power only |
| Display | Vizio D40f-J09, 1080p LCD. The box outputs 4K, the TV downscales. Design at 1920 x 1080. |
| Control | Physical remote and the phone (Google TV app / Google Home app). Both send standard D-pad, OK, Back keys. |
| Build host | Gavin's Windows desktop, same network as the box. Repo ships PowerShell twins of its scripts. |

The box cannot switch the Vizio's input and PADDOCK must not pretend it can.

## 3. Rules that override everything else

1. **Never leave the box without a Home app.** Use the repo's own ordering: install the new launcher, make it Home, confirm it answers HOME, and only then touch the stock launcher. The repo's scripts already protect this. Do not bypass them with `FORCE_HOME`.
2. **Ask before** disabling any package, changing any system setting (screensaver, sleep, animation scales), or enabling anything not in this spec. Show the exact list or command first.
3. **Every change must be undoable.** Use the repo's recovery record and `restore.sh`. Settings you change get their original value written to the record first.
4. **No network in the launcher.** No `INTERNET` permission, no analytics, no crash reporter, no remote fonts or scripts. Check the built APK with `aapt dump permissions` (or `apkanalyzer`) and fail the build if it lists INTERNET.
5. **Only touch the box at `TV_HOST`.** Never scan the network for other devices. Never open the ADB port to the internet or the router.
6. **Close debugging at the end** with the repo's `tools/adb-closed.py` check.
7. **Keep Google Play services, Play Store, WebView and the system updater on** unless Gavin says otherwise. Streaming apps and WebView updates depend on them.
8. **No em dashes** in any text you write for Gavin (docs, comments, commit messages, UI strings).
9. **Licenses.** Keep the repo's MIT notice. Include the license files for any bundled font. Keep `paddock/assets/CREDITS.md` for photos.
10. **No brand marks or recreated car designs** (see DESIGN.md section 3).

## 4. Architecture

### 4.1 Shape

Fork the repo's `launcher/` into a sibling module, for example `launcher-paddock/`. Do not edit upstream files except for small hooks the build needs (for example, letting the install script take a package name). Keeping our code in its own folder means upstream improvements can be merged later without conflicts.

- New `applicationId`, for example `com.gavin.paddock`. Check that it does not collide with the repo's launcher. Label: `Paddock`.
- One Activity, `singleTask`, with the HOME and LEANBACK_LAUNCHER categories so it can be the default Home. Handle `onNewIntent` for HOME: it resets to mode N.
- Native Java shell handles: key events, the list of launchable apps, launching apps, opening settings, network state, loading config and garage files, lifecycle, and the safe Home handoff.
- The UI is rendered in a **WebView** that loads local HTML, CSS and JS only. This lets the same code run in Chrome during Phase 1, which is how the design gets iterated quickly.

### 4.2 WebView setup

- Serve assets with `androidx.webkit.WebViewAssetLoader` at `https://appassets.androidplatform.net/`. Use an assets handler for the bundled UI and an internal storage handler for `files/paddock/` (config, garage, photos).
- `setBlockNetworkLoads(true)`, `setAllowFileAccess(false)`, `setAllowContentAccess(false)`. Any request outside `appassets.androidplatform.net` is blocked in `shouldInterceptRequest`.
- Hardware acceleration on. Page background `#0B0C0D` set natively as well, so there is no white flash while it loads.
- Do not let the WebView take focus traversal. The Activity catches every key in `dispatchKeyEvent`, forwards it to JS, and consumes it. JS owns navigation.

### 4.3 Bridge (JavaScript to native)

Expose one object, `Paddock`, with `@JavascriptInterface` methods. Local content only.

| Method | Returns / does |
|---|---|
| `getApps()` | JSON list of launchable leanback apps: `{pkg, label}` |
| `launch(pkg)` | Starts that app's launch intent |
| `openSettings(section)` | Opens system settings (`"main"`, `"network"`) |
| `getNetwork()` | `{type: "eth" or "wifi" or "none", connected: bool}`. No SSID (it needs a location permission). |
| `getInstallTime()` | Epoch ms of first run, for the odometer |
| `storageGet(key)` / `storageSet(key, value)` | Small key-value store backed by SharedPreferences (favorites order) |
| `log(msg)` | Writes to logcat under the tag `Paddock` |

App icons are not passed as base64. Add a path handler so the page can load `https://appassets.androidplatform.net/icon/<pkg>.png`, and have it stream the app's banner or icon.

Native to JS: `window.paddock.onKey(name)` for `up, down, left, right, ok, back, okHold`, and `window.paddock.onLifecycle("resume" | "pause")`. On `pause`, JS stops all timers and animation. On `resume`, JS decides whether to play the startup sweep (screen off more than 10 minutes, or cold start).

### 4.4 Data on the box

Everything the user can change lives in the app's files dir, so changes do not need a rebuild:

```
files/paddock/paddock.config.json
files/paddock/garage.json
files/paddock/photos/*.jpg
```

Defaults for first run are bundled in assets. If a file is missing or the JSON is bad, use defaults, show `CONFIG ERROR` in the bottom readout, and keep running.

### 4.5 Config schema

```json
{
  "version": 1,
  "clock": { "format": "12h", "show_seconds": false },
  "favorites": [],
  "labels": {},
  "sublabels": {},
  "night": { "start": "23:00", "end": "06:00", "park_after_idle_min": 30 },
  "garage": { "advance_minutes": 10, "showroom_advance_seconds": 12 },
  "odometer": { "enabled": true },
  "motion": { "reduced": false },
  "accent": "#FF6B1A"
}
```

`favorites` is a list of package names, in arc order. Claude Code finds the real names on the box with `pm list packages` and asks Gavin which ones he wants. Up to 9 positions plus `ALL` and `SET`. If `favorites` is empty, auto-fill with the first installed streaming apps found.

### 4.6 Fallback renderer

If the WebView cannot meet the budgets in section 7 on the real box, build the same screens with a native custom `View` drawing on a Canvas instead, using the Phase 1 prototype as the visual reference. Decide this at the Phase 2 gate, not later.

## 5. Phases

Stop at the end of each phase. Show Gavin what exists, then wait.

### Phase 0: Baseline

1. Read the repo docs listed in 00-START-HERE.md. Report anything in them that conflicts with this spec.
2. Run the repo's probe against `TV_HOST`. Report model, Android version, RAM, firmware, which launcher owns Home, whether a WebView is installed.
3. Check `examples/` for an onn 4K Plus entry and for similar Google TV 14 entries. Prefer a tested list over discovering from scratch.
4. Back up per the repo's flow. Show Gavin the debloat list before applying. Keep updates, Play services, Play Store and WebView on.
5. Apply the debloat and the repo's default launcher as the safe baseline. Confirm HOME works, the remote and voice button work, and the phone remote works.
6. Run `tools/bench.py` on the default launcher and save the numbers to `paddock/baseline.json`. Those numbers are the baseline for every budget below.
7. Rehearse restore on a couple of packages and confirm they come back.

**Stop.** Report the baseline.

### Phase 1: Browser prototype

Build the entire UI as a static page at `paddock/preview/`: HTML, CSS and JS only, no build step, no libraries from the internet (vendor anything needed, and prefer none). It runs by opening `index.html` through `python -m http.server`.

- Fixed 1920 x 1080 stage scaled to fit the browser window.
- Arrow keys, Enter and Escape stand in for the remote. Hold Enter for 0.5s for hold OK.
- Mock app list and mock icons (plain colored letter squares are fine for mock data).
- Query string dev controls: `?time=17:42`, `?mode=D`, `?night=1`, `?car=2`, `?reduced=1`.
- Real garage data path: it loads `garage.json` and photos the same way the box will (relative to a files folder).
- Bundled fonts (Barlow Condensed, IBM Plex Mono) with license files.
- All modes and transitions from DESIGN.md: N, D, S, P, showroom, startup sweep, hour rollover, typography plates.
- Save screenshots of each mode at 1920 x 1080 to `paddock/preview/shots/` (headless Chrome is fine). Include one of N at 23:59 to 00:00 for rollover, one of each car type, one of P.

**Stop.** Gavin looks at it in Chrome and approves or asks for changes. Iterate here as long as it takes. It is the cheapest place to change the design.

### Phase 2: On-box spike

1. Make a minimal Activity with the WebView loading the Phase 1 page. It does not have to be Home yet. Install it as a normal app and start it with an intent.
2. Run `tools/bench.py` while it sits in N, while moving the needle, and during mode changes. Also check `dumpsys meminfo` for the launcher process and the WebView renderer process.
3. Check the budgets in section 7. If they pass, WebView is the renderer. If they fail, try the cheap fixes first (fewer layers, smaller photos, drop any filter, lower ambient frame rate). If it still fails, switch to the Canvas fallback (4.6).

**Stop.** Report numbers and the decision.

### Phase 3: Integrate and install as Home

1. Build the real shell and bridge (4.1 to 4.4). Config and garage loading. Icon path handler. Key forwarding. Lifecycle.
2. Photo prep: write `tools/paddock-prep-photos.py` (resize, desaturate, darken, JPEG under 600KB) and `tools/paddock-push.ps1` plus a `.sh` twin (push config, garage and photos to `files/paddock/` over ADB, then tell the launcher to reload).
3. Add `paddock/assets/cars-src/` and `paddock/assets/photos-prepped/` to `.gitignore`.
4. Install with the repo's safe flow: install, set as Home, confirm HOME resolves to PADDOCK, only then disable the stock launcher if the repo's flow does that. Roll back automatically if HOME does not land on PADDOCK.
5. Ask Gavin for his favorites, his car entries (names, captions, any detail lines), and which photo goes with which. Do not invent any of it.
6. Check whether the Google Home panel can be opened. If it can, add a `HOME` position on the arc. If not, write it into the known losses list in `paddock/README.md`.

**Stop.** Gavin uses it with the real remote and his phone.

### Phase 4: Harden

- **Screensaver and sleep.** Discover the relevant settings keys on this box (for example with `settings list secure` and `settings list system`). Show Gavin the current values and the proposed values. On approval, turn off the system screensaver and extend the box's sleep timeout so PADDOCK stays on screen. Write original values to the recovery record first.
- **Overnight soak.** Leave it in N for 24 hours. Check for crashes, memory growth, and that the night rule moves it to P and any key wakes it.
- **Remote tests** (section 8).
- **Restore rehearsal.** Run `restore.sh`, confirm the stock Home returns and everything works, then re-apply PADDOCK.
- **Drift check.** Run the repo's `tools/check.py` and note how to run it after a firmware update.
- Also tell Gavin to set the Vizio's own Input at Power On to the box's HDMI port, and to check the Vizio's auto power off setting.

### Phase 5: Wrap up

- Write `paddock/README.md`: how to rebuild, how to push new photos and config, how to restore, known losses (anything the stock home screen did that PADDOCK cannot).
- Commit to the fork. No photos, no IP addresses, no recovery records in the commit. Check with `git status` and a grep for the box's IP.
- Close debugging on the box and verify with `tools/adb-closed.py`.

## 6. Push workflow

After Phase 3, changing photos or config never needs a rebuild:

1. Edit `paddock/garage.json` or `paddock.config.json`.
2. Put new originals in `paddock/assets/cars-src/` and run the prep script.
3. Run the push script with `TV_HOST` set. It copies files to `files/paddock/`, then the launcher reloads them.

ADB debugging has to be on for the push. After pushing, turn it off again and verify.

## 7. Performance budgets

These are starting targets. Measure the repo's default launcher first (Phase 0) and adjust once real numbers exist.

| Measure | Target |
|---|---|
| Key to first visible change | p95 under 100ms |
| Frames during transitions | At least 90 percent within 33ms (30 fps). Needle spring should look smooth. |
| Idle in N, CPU | No more than 1.5 times the baseline launcher's idle. If it averages above 10 percent of one core, find out why. |
| Memory, launcher plus WebView renderer | Under 250MB PSS total. The box has 2GB and streaming apps need room. |
| Memory growth over 24 hours in N | Under 10 percent |
| Cold start to first frame | Under 2 seconds, startup sweep excluded |
| Photo decode | At most 3 photos decoded in memory at once. Release the others. |
| APK size | Under 5MB including fonts and defaults. Photos are not in the APK. |

Tools: `tools/bench.py`, `tools/trace.py` for where time goes, `tools/screendiff.py` for before and after screenshots.

## 8. Acceptance checklist

Mark each with pass or fail and a note. Anything that fails goes back to its phase.

**Home and navigation**
- [ ] Pressing Home from any app returns to PADDOCK in N within 1 second.
- [ ] Reboot the box: it lands on PADDOCK with no manual step.
- [ ] Back in N does nothing (does not exit to the stock launcher or a chooser).
- [ ] Every streaming app Gavin picked launches from D and from S. Back from the app returns to PADDOCK.

**Input**
- [ ] The physical remote: D-pad, OK, Back, Home, voice button, any app shortcut buttons keep working.
- [ ] The phone remote (Google TV app) works for every mode, including hold OK.
- [ ] Hold OK menu: Move and Remove work and survive a reboot.

**Content**
- [ ] N shows correct local time, lap number, sector, and the dot position, checked at several times with `?time=`.
- [ ] Hour rollover does the counter flash and starts a new lap.
- [ ] Missing, corrupt or huge photo does not crash it. Empty garage shows the `GARAGE EMPTY` plate.
- [ ] Typography plates look right for cars with no photo.
- [ ] Bad JSON falls back to defaults and shows `CONFIG ERROR`.
- [ ] Photos and config can be changed with the push script without a rebuild.

**Offline and safety**
- [ ] The built APK has no INTERNET permission.
- [ ] A request to any other host from the page is blocked.
- [ ] Restore returns the stock Home and everything works.
- [ ] No photos, IPs or recovery records in the git history.

**Visual**
- [ ] All text is at least 26px at 1080p and readable from across the room.
- [ ] Text over the brightest photo reaches 4.5:1 contrast.
- [ ] Nothing clipped by TV overscan, checked on the real Vizio.
- [ ] Reduced motion setting works.

**Soak**
- [ ] 24 hours in N: no crash, memory within budget, night rule works, any key wakes it.

## 9. Questions to ask Gavin (at the start of Phase 1)

Ask these in one batch, not one at a time.

1. Which streaming apps should be on the arc, and in what order?
2. 12 hour or 24 hour clock? Show seconds?
3. Do you want a Kodi or VLC entry for local movies on the arc?
4. Which cars go in the garage, with what photo for each, and what do you want written under each name? (Give the text yourself. Do not let anyone fill in specs for you.)
5. Should the box stay on all night (night rule moves it to P) or sleep when idle?

## 10. Risks

| Risk | What to do |
|---|---|
| WebView is slow on this box | Phase 2 gate, then Canvas fallback |
| Firmware update brings back the stock home or the debloated apps | `tools/check.py --fix`, documented in the README |
| Google Home smart home panel is lost | Check in Phase 3. Document if lost. |
| The stock launcher is disabled and PADDOCK crashes at boot | Repo's HOME protection and the restore script. Also keep a way to reach Settings, Apps from the TV's own settings page. |
| A bad debloat list breaks an app Gavin uses | Apply in small batches, test after each, restore script ready |
| ADB left open on the network | Phase 5 close and verify |
| Photos with unclear rights get committed | `.gitignore` and `CREDITS.md`, check before the commit |
