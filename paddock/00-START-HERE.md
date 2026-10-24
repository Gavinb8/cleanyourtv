# PADDOCK: start here

PADDOCK is a custom home screen for an onn 4K Plus (Google TV) that sits on the HDMI input of Gavin's Vizio D40f-J09. The TV is only a 1080p display. All the apps, the phone remote and the home screen live on the box.

The home screen is built by forking the launcher from Clean Your TV (github.com/Gathin23/cleanyourtv, MIT license). It is meant to stay on screen all day. It is not a grid of tiles. It is a dark "pit wall at night" screen: a lap clock, a tach-style needle for picking apps, and a rotating garage of car photos.

## Files in this pack

| File | What it is |
|---|---|
| `00-START-HERE.md` | This file. How to run the job and what to paste into Claude Code. |
| `DESIGN.md` | The look and feel. Modes, layout, type, color, motion, car integration. |
| `SPEC.md` | The build plan. Architecture, phases, stop points, budgets, acceptance tests, safety rules. |

## Before you start (Gavin does this)

1. Fork `Gathin23/cleanyourtv` to your own GitHub account (private is fine) and clone the fork. Work in the fork, never in upstream.
2. Copy this `paddock/` folder into the root of the clone.
3. Put 6 to 12 of your own car photos in `paddock/assets/cars-src/`. Phone photos are fine. Do not commit them if the repo is public (the `.gitignore` step in SPEC.md covers this).
4. Unbox the box, plug it into the Vizio, finish Google TV setup on your network (Ethernet if you have the hub, otherwise Wi-Fi).
5. On the box (menu names can differ a little by firmware): Settings, System, About, press OK on **Android TV OS build** seven times until it says you are a developer. Back up to System, open **Developer options**, turn on **USB debugging**, then turn on **Wireless debugging**. The Plus has no data USB port, so Wi-Fi is the only way in. Open Wireless debugging and note the IP address and port it shows. Then choose **Pair device with pairing code** and note the pairing IP:port and the 6 digit code. On your desktop run `adb pair <pairing ip:port>` and type the code, then `adb connect <ip:port from the main Wireless debugging screen>`. Accept the prompt on the TV and tick Always allow. Run `adb devices` and make sure the box shows as `device`. The pairing port and the connect port are different, and the connect port can change after a restart or after toggling Wireless debugging. This flow is the normal Android 11+ one and was not tested on this exact box.
6. On your desktop, which must be on the same network as the box, install: Python 3, JDK 17, Android SDK platform 34 (Android Studio covers it on Windows), and Claude Code.

## What to paste into Claude Code

Open Claude Code in the repo root and paste this:

```
Read these files in this order before doing anything else:
README.md, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, PROMPT.md,
then paddock/SPEC.md and paddock/DESIGN.md.

Goal: build PADDOCK, a custom Home launcher for my onn 4K Plus, using the
phases in paddock/SPEC.md. My TV box is at TV_HOST=<paste ip:port from the
Wireless debugging screen>. It is already paired and `adb devices` shows it.
The repo may assume port 5555. Use the port I gave you instead.

Rules:
- Do the phases in order. Stop at the end of each phase, show me what you
  did (screenshots where possible), and wait for my OK before the next one.
- Ask me before disabling any package, changing any system setting, or
  doing anything the SPEC does not cover.
- Never disable the only Home app. Follow the repo's own safe ordering.
- If something in SPEC.md or DESIGN.md disagrees with what the repo
  actually does, tell me and propose a fix. Do not silently pick one.
- Do not use em dashes in anything you write for me (docs, comments,
  commit messages, UI text).
```

## The order of work in one paragraph

Phase 0 gets the box debloated and stable using the repo's normal flow and its default launcher, and takes baseline measurements. Phase 1 builds the whole UI as a plain HTML prototype you can open in Chrome on your desktop and drive with the arrow keys, so you can approve the look before touching the TV. Phase 2 is a short test to prove the UI runs smoothly on the actual box. Phase 3 wraps the UI in the launcher and installs it as Home. Phase 4 hardens it (overnight test, remote tests, restore rehearsal). Phase 5 cleans up and closes the debugging port.

## How you control it

The phone is the remote. The Google TV app and the Google Home app on your phone can both act as a remote for a Google TV box. They send the same D-pad, OK and Back keys as the physical remote, so PADDOCK only has to handle normal remote keys. Test with the phone at least once in Phase 4.

## One thing that is not in the design

The box cannot switch the Vizio's HDMI input. An earlier idea was a shortcut on the home screen to jump to your desktop's input. That cannot work, because the box only controls itself. Use the Vizio remote for that. Also set the Vizio's own "Input at Power On" to the box's HDMI port so the TV always wakes into PADDOCK.

## What was not verified when this pack was written

The pack was written from the repo's README and the web, not from the source code. Claude Code should check these early and report:

- The real layout of `launcher/` (build files, package name, how `build-and-install.sh` picks the package).
- Whether `examples/` already has an onn 4K Plus entry with a tested debloat list.
- Whether the Google Home smart home panel can be opened from a custom launcher, or is lost when the stock launcher is disabled.
- Whether the box has a working WebView (`com.google.android.webview`) and that no debloat list disables it.
- Whether the 2026 firmware on the box changes anything the repo assumes about Google TV 14.
