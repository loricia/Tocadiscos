# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Tocadiscos": a static web music player (UI text in Spanish) whose player is an animated CSS turntable. Plain HTML/CSS/JS — no framework, no dependencies, no build step, no tests, no package.json. Node.js is not installed on this machine.

## Running

Open `index.html` directly in a browser (`start index.html` from PowerShell). It works over `file://`; songs are loaded by the user at runtime (file picker or drag & drop onto the window) via `URL.createObjectURL`, so there is no server and no hard-coded playlist.

Visual check without a GUI: Edge is available for headless screenshots:
```
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=700,1300 --screenshot=<out.png> "file:///C:/Cosas%20de%20Pablo/Trabajos/curso_claude/index.html"
```
To screenshot the playing state, use a copy of `index.html` with `class="deck is-playing"` and `style="--arm-angle:28deg"` on `<html>`.

## Architecture

The JS never animates anything directly; it only toggles state that CSS reacts to:
- `.is-playing` on `#deck` → `animation-play-state: running` on the vinyl spin (so pausing freezes it in place), power light on, smaller arm shadow ("needle lowered").
- `--arm-angle` on `:root` → the tonearm's `rotate()`, with a CSS transition. `updateArm()` in `script.js` sets it to `ARM_REST` when not playing, otherwise interpolates `ARM_START`→`ARM_END` by `currentTime / duration`, so the needle tracks song progress.
- `--label-hue` (per-track record label colour) and `--spin-duration` (33/45 RPM) are also root CSS variables.

The arm angle constants are tied to the turntable geometry in `styles.css` (platter at left 6%/top 8%/width 64%; arm pivot at left 84%/top 16%, arm height 65% of a 13:10 deck). Changing either side requires recalculating the other so the needle still lands between the vinyl edge and the label. `ARM_MOVE_MS` must match the `.arm` transition duration.

Track changes while playing go through `playIndex()`: it sets `state.changing`, pauses (arm lifts to rest), and after `ARM_MOVE_MS` loads and plays the new track, so the arm visibly returns and drops again.

## Visual design (cyberpunk)

Dark-only theme; palette tokens live on `:root` in `styles.css` and each colour has one job: magenta `--neon` only on the vinyl glow, `--cyan` for the needle and active/pressed states, `--sodium` amber for the strobe ring and 45 rpm. Label ring colours cycle through `LABEL_HUES` in `script.js` (keep them in that palette). Font is Chakra Petch from Google Fonts (falls back to system sans offline).

Chamfered corners use `clip-path`, which clips `outline` and outer `box-shadow`: focus states on clipped elements use `box-shadow: inset`, and the device's drop shadow is a `filter` on the unclipped `.device` wrapper. Use `radial-gradient(circle closest-side, …)` for masks on the round parts so percentages are relative to the radius.

Headless Edge has a minimum window width (~500px), so check mobile layout by loading the page in a 390px `<iframe>` (needs `--allow-file-access-from-files`).

45 RPM sets `playbackRate = 1.35` with `preservesPitch = false` intentionally (vinyl-like pitch shift).

## Canciones/

20 Creative Commons MP3s from Internet Archive netlabels, for testing. `Canciones/CREDITOS.txt` lists author, licence and source for each; keep it in sync if songs are added or removed. Only add music whose licence permits download — do not fetch copyrighted commercial tracks.
