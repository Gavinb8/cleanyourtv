// PADDOCK browser prototype. Plain JS, no build step, no network libraries.
// Query string dev controls: ?time=17:42  ?mode=D  ?night=1  ?car=2  ?reduced=1

const qs = new URLSearchParams(location.search);

// ---------- time override ----------
// ?time=HH:MM sets a starting wall-clock time; it still ticks forward in real speed
// from that point, so rollover/night behaviour can be watched live.
let timeOffsetMs = 0;
(function setupTimeOverride() {
  const t = qs.get("time");
  if (!t) return;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return;
  const now = new Date();
  const wanted = new Date(now);
  wanted.setHours(+m[1], +m[2], +(m[3] || 0), 0);
  timeOffsetMs = wanted.getTime() - now.getTime();
})();
function now() { return new Date(Date.now() + timeOffsetMs); }

const REDUCED = qs.get("reduced") === "1";
if (REDUCED) document.body.classList.add("reduced-motion");

// ---------- stage scaling ----------
function fitStage() {
  const sx = window.innerWidth / 1920;
  const sy = window.innerHeight / 1080;
  const s = Math.min(sx, sy);
  document.getElementById("stage-outer").style.transform = `scale(${s})`;
}
window.addEventListener("resize", fitStage);
fitStage();

// ---------- data loading ----------
// Absolute path, not relative: on the real launcher this is served from a totally separate
// WebViewAssetLoader path handler (internal storage, editable without a rebuild) rooted at
// the origin, not nested under the bundled /assets/preview/ page. Works the same way for the
// browser prototype since `python -m http.server` is run from this folder, so "/files/..."
// resolves to the same place "files/..." did.
const FILES = "/files/paddock/";
let CONFIG = null;
let GARAGE = null;

async function loadJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("CONFIG ERROR loading", path, e);
    return fallback;
  }
}

const DEFAULT_CONFIG = {
  version: 1,
  clock: { format: "12h", show_seconds: false },
  favorites: [],
  labels: {},
  sublabels: {},
  night: { start: "23:00", end: "06:00", park_after_idle_min: 30 },
  garage: { showroom_advance_seconds: 12 }, // photo rotation is sector-tied now, see checkGarageRotation()
  odometer: { enabled: true },
  motion: { reduced: false },
  accent: "#D1392F"
};

let configError = false;

// Mock app catalogue for the prototype: the real favourites from config, plus a
// few plausible extra Android TV apps so Sport mode has something to scroll through.
// Replaced by the real on-device app list (Paddock.getApps()) in Phase 3.
const MOCK_EXTRA_APPS = [
  { pkg: "mock.spotify", label: "Spotify" },
  { pkg: "mock.twitch", label: "Twitch" },
  { pkg: "mock.plex", label: "Plex" },
  { pkg: "mock.hulu", label: "Hulu" },
  { pkg: "mock.peacock", label: "Peacock" }
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 45%, 32%)`;
}

function realInstalledApps() {
  // window.Paddock only exists on the real launcher (PaddockBridge, SPEC.md 4.3) - the
  // browser prototype and the Phase 2 spike never have it, so they keep using the mock list.
  if (typeof window.Paddock === "undefined") return null;
  try {
    return JSON.parse(window.Paddock.getApps()); // [{pkg, label}, ...]
  } catch (e) {
    console.warn("CONFIG ERROR Paddock.getApps()", e);
    return [];
  }
}

function buildAppList() {
  const favs = (CONFIG.favorites || []).map(pkg => ({
    pkg, label: CONFIG.labels[pkg] || pkg, sub: CONFIG.sublabels[pkg] || ""
  }));
  const real = realInstalledApps();
  const all = real
    ? real.map(a => ({ pkg: a.pkg, label: CONFIG.labels[a.pkg] || a.label, sub: "" }))
    : favs.concat(MOCK_EXTRA_APPS.map(a => ({ pkg: a.pkg, label: a.label, sub: "" })));
  all.sort((a, b) => a.label.localeCompare(b.label));
  return { favs, all };
}

// ---------- circuit geometry ----------
let circuitPath, circuitLen;
function initCircuit() {
  return fetch("assets/circuit.svg").then(r => r.text()).then(svgText => {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const d = doc.getElementById("circuit-path").getAttribute("d");
    document.getElementById("circuit-base").setAttribute("d", d);
    document.getElementById("circuit-progress").setAttribute("d", d);
    circuitPath = document.getElementById("circuit-progress");
    circuitLen = circuitPath.getTotalLength();
    circuitPath.setAttribute("stroke-dasharray", String(circuitLen));
    placeSectorTicks();
  });
}
function pointAt(frac) {
  return circuitPath.getPointAtLength(((frac % 1) + 1) % 1 * circuitLen);
}
function placeSectorTicks() {
  [1 / 3, 2 / 3].forEach((frac, i) => {
    const p = pointAt(frac);
    const p2 = pointAt(frac + 0.004);
    const dx = p2.x - p.x, dy = p2.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular
    const tick = document.getElementById(`tick-s${i + 1}`);
    tick.setAttribute("x1", p.x - nx * 9); tick.setAttribute("y1", p.y - ny * 9);
    tick.setAttribute("x2", p.x + nx * 9); tick.setAttribute("y2", p.y + ny * 9);
    const label = document.getElementById(`label-s${i + 1}`);
    label.setAttribute("x", p.x + nx * 20 - 10); label.setAttribute("y", p.y + ny * 20 + 6);
  });
  const p3 = pointAt(0.98);
  document.getElementById("label-s3").setAttribute("x", p3.x - 10);
  document.getElementById("label-s3").setAttribute("y", p3.y + 6);
}

// ---------- lap state ----------
function lapState(d) {
  const hour = d.getHours();
  const frac = (d.getMinutes() * 60 + d.getSeconds()) / 3600;
  const lap = hour + 1;
  const sector = frac < 1 / 3 ? 1 : frac < 2 / 3 ? 2 : 3;
  return { lap, frac, sector };
}

let lastLap = null;
function renderCircuit() {
  const { lap, frac, sector } = lapState(now());
  const offset = circuitLen * (1 - frac);
  circuitPath.setAttribute("stroke-dashoffset", String(offset));
  const p = pointAt(frac);
  document.getElementById("dot").setAttribute("cx", p.x);
  document.getElementById("dot").setAttribute("cy", p.y);
  document.getElementById("dot-glow").setAttribute("cx", p.x);
  document.getElementById("dot-glow").setAttribute("cy", p.y);

  for (let i = 1; i <= 2; i++) {
    document.getElementById(`tick-s${i}`).classList.toggle("current", sector === i);
    document.getElementById(`label-s${i}`).classList.toggle("current", sector === i);
  }
  document.getElementById("label-s3").classList.toggle("current", sector === 3);

  const counterEls = [n_lapCounter, d_lapCounter, s_lapCounter];
  const text = `LAP ${Math.min(lap, 24)} / 24`;
  counterEls.forEach(el => el.textContent = text);

  if (lastLap !== null && lap !== lastLap) {
    counterEls.forEach(el => {
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 3000);
    });
  }
  lastLap = lap;
}

// ---------- clock ----------
function pad2(n) { return String(n).padStart(2, "0"); }
function renderClock() {
  const d = now();
  let h = d.getHours();
  const pm = h >= 12;
  if (CONFIG.clock.format === "12h") {
    h = h % 12; if (h === 0) h = 12;
  }
  let text = CONFIG.clock.format === "12h" ? `${h}:${pad2(d.getMinutes())}` : `${pad2(h)}:${pad2(d.getMinutes())}`;
  if (CONFIG.clock.show_seconds) text += `:${pad2(d.getSeconds())}`;
  const pmHtml = CONFIG.clock.format === "12h" ? `<span class="clock-pm">${pm ? "PM" : "AM"}</span>` : "";
  n_time.innerHTML = text + pmHtml;
  d_time.textContent = text;
  s_time.textContent = text;

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  n_date.textContent = `${days[d.getDay()]}  ${months[d.getMonth()]} ${d.getDate()}`;
}

// ---------- odometer / network readouts ----------
const INSTALL_TIME = Date.now(); // stand-in for Paddock.getInstallTime()
function renderReadouts() {
  const hoursUp = Math.max(0, Math.floor((now().getTime() - INSTALL_TIME) / 3600000));
  n_odo.textContent = `ODO ${hoursUp.toLocaleString()} LAPS`;
  const online = navigator.onLine;
  n_net.innerHTML = `ETH&nbsp;&nbsp;<span class="${online ? "status-ready" : "status-offline"}">${online ? "READY" : "OFFLINE"}</span>`;
}

// ---------- garage / photo layer ----------
let carIndex = 0;

// Flattened rotation list: one slide per photo, not per car, so a car with several
// photos (e.g. all of Gavin's own S4 shots) rotates through every one of them instead
// of only ever showing its first photo. Each slide carries its car's name/caption/lines.
// garage.json keeps a "photos" array per car (or the older single "photo" field, read as
// a one-item list, for backward compatibility).
let SLIDES = [];
function buildSlides() {
  const cars = (GARAGE.cars || []);
  const slides = [];
  for (const car of cars) {
    const photos = (car.photos && car.photos.length) ? car.photos : (car.photo ? [car.photo] : [null]);
    photos.forEach((photo, i) => {
      slides.push({
        id: `${car.id}-${i}`,
        name: car.name, caption: car.caption, lines: car.lines,
        photo,
        focus: (car.focuses && car.focuses[i]) || car.focus || { x: 0.5, y: 0.5 }
      });
    });
  }
  // DESIGN.md section 9: "Max 12 photos." Defensive cap in case the garage grows past it.
  SLIDES = slides.slice(0, 12);
}
function currentCars() { return SLIDES.length ? SLIDES : null; }

// SPEC.md section 7: "At most 3 photos decoded in memory at once. Release the others."
// Each photo layer (N, Showroom) keeps its own small LRU of <img> elements; placePhoto()
// returns the element to show and evicts the oldest once the cache exceeds the limit.
const PHOTO_CACHE_LIMIT = 3;
const photoLayerOrder = new WeakMap(); // layer element -> array of car ids, most-recent last
function placePhoto(layer, car, src) {
  layer.querySelectorAll("img").forEach(img => img.classList.remove("visible"));
  let order = photoLayerOrder.get(layer);
  if (!order) { order = []; photoLayerOrder.set(layer, order); }

  let img = layer.querySelector(`img[data-id="${car.id}"]`);
  if (!img) {
    img = document.createElement("img");
    img.src = src;
    img.dataset.id = car.id;
    layer.appendChild(img);
  }
  order = order.filter(id => id !== car.id);
  order.push(car.id);
  while (order.length > PHOTO_CACHE_LIMIT) {
    const evictId = order.shift();
    const evictEl = layer.querySelector(`img[data-id="${evictId}"]`);
    if (evictEl) evictEl.remove();
  }
  photoLayerOrder.set(layer, order);
  return img;
}

function renderCar() {
  const cars = currentCars();
  const nMode = document.getElementById("mode-n");
  if (!cars) {
    nMode.classList.add("is-plate");
    document.getElementById("n-plate-name").textContent = "GARAGE EMPTY";
    n_car_name.textContent = "";
    n_car_caption.textContent = "";
    n_car_line0.textContent = ""; n_car_line1.textContent = "";
    return;
  }
  const car = cars[carIndex % cars.length];
  n_car_name.textContent = car.name || "";
  n_car_caption.textContent = car.caption || "";
  n_car_line0.textContent = (car.lines && car.lines[0]) || "";
  n_car_line1.textContent = (car.lines && car.lines[1]) || "";

  if (!car.photo) {
    nMode.classList.add("is-plate");
    document.getElementById("n-plate-name").textContent = car.name || "";
  } else {
    nMode.classList.remove("is-plate");
    const layer = document.getElementById("n-photo-layer");
    const img = placePhoto(layer, car, `${FILES}photos/${car.photo}`);
    requestAnimationFrame(() => img.classList.add("visible"));
    if (!REDUCED) {
      img.style.transition = "none";
      img.style.transform = "scale(1.00)";
      requestAnimationFrame(() => {
        img.style.transition = "transform 120s linear, opacity 2500ms ease";
        const fx = car.focus ? car.focus.x : 0.5, fy = car.focus ? car.focus.y : 0.5;
        img.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
        img.style.transform = "scale(1.04)";
      });
    }
    showroomSync(car, img.src);
  }
}

function showroomSync(car, src) {
  const layer = document.getElementById("showroom-photo-layer");
  const img = placePhoto(layer, car, src);
  img.classList.add("visible");
  document.getElementById("showroom-car-name").textContent = car.name || "";
  document.getElementById("showroom-car-caption").textContent = car.caption || "";
}

function advanceCar() {
  const cars = currentCars();
  if (!cars) return;
  carIndex = (carIndex + 1) % cars.length;
  renderCar();
}
// Council decision (2026-10-24): the photo crossfade used to run on its own independent
// 10-minute timer, unrelated to the lap clock already on screen - two clocks that could
// drift apart for no reason. It now fires off the SAME clock: 6 fixed checkpoints per lap
// (every 1/6 of the hour, ~10 min), which land exactly on the real sector ticks at 1/3 and
// 2/3 plus their midpoints. No new timer, no new moving element - reuses the one clock that
// was already being computed every second. Rejected: a second "racing" dot as the trigger -
// DESIGN.md section 2 limits self-moving elements to the lap dot and photo drift; a second
// dot would violate that rule for a purely decorative reason.
let lastRotationSlot = null;
function checkGarageRotation() {
  if (!currentCars()) return;
  const { frac } = lapState(now());
  const slot = Math.floor(frac * 6) % 6;
  if (lastRotationSlot !== null && slot !== lastRotationSlot) advanceCar();
  lastRotationSlot = slot;
}

// ---------- D mode: arc + needle ----------
// Redesigned 2026-10-25 per a 5-advisor council review (Gavin: "bland... needs to be more
// alive, more responsive, bolder, more clearly car-related"). The council's unanimous finding,
// independently re-derived four ways: the old geometry (radius 2600, +-20 deg) wasn't bland
// because it was small - the sagitta (how much the arc actually bows) was only
// 2600*(1-cos20deg) ~= 157px, so it read as a nearly-flat sagging line no matter how big the
// canvas around it was. The fix is radius DOWN and angle UP, not "scale everything up" (which
// would have made it an even flatter, bigger line - the opposite of the ask).
const ARC_SPREAD_DEG = 76; // was 40 (+-20deg) -> now +-38deg: real sweep, and ~3x the angular
                            // travel per tick, which alone reads as more responsive
const ARC_RADIUS = 1300; // was 2600
const ARC_BOTTOM_AT_CENTER = 610; // was 290 - gauge footprint goes from ~27% to ~57% of screen height
// The rim/track line is drawn on a WIDER angle than the icons sit on, and is allowed to run
// off the left/right canvas edges - a real dial implies it continues past what you can see.
// Same stroke, same draw call, zero extra render cost (council: "the single cheapest
// 'dominates the room' trick available").
const ARC_RIM_SPREAD_DEG = ARC_SPREAD_DEG + 24;
function angleForIndex(i, n) {
  return -ARC_SPREAD_DEG / 2 + (ARC_SPREAD_DEG * i) / (n - 1 || 1);
}
function arcPosition(i, n) {
  const angle = angleForIndex(i, n);
  const rad = angle * Math.PI / 180;
  return {
    angle,
    x: 960 + ARC_RADIUS * Math.sin(rad),
    bottom: ARC_BOTTOM_AT_CENTER - ARC_RADIUS * (1 - Math.cos(rad))
  };
}

let dApps = [];
let dFocus = 0;
function buildArc() {
  const { favs } = buildAppList();
  dApps = favs.map(a => ({ ...a })).concat([
    { pkg: "__all__", label: "ALL", sub: "Every app on the box" },
    { pkg: "__set__", label: "SET", sub: "System settings" }
  ]);
  const wrap = document.getElementById("d-arc");
  wrap.innerHTML = "";
  const n = dApps.length;
  dApps.forEach((app, i) => {
    const tick = document.createElement("div");
    tick.className = "arc-tick";
    const pos = arcPosition(i, n);
    tick.style.left = `${pos.x}px`;
    tick.style.bottom = `${pos.bottom}px`;
    const icon = document.createElement("div");
    icon.className = "arc-tick-icon";
    icon.style.background = app.pkg.startsWith("__") ? "#2B2F33" : hashColor(app.pkg);
    icon.textContent = app.label[0];
    // Real icon, streamed from the app's own installed banner/icon (IconPathHandler, SPEC.md
    // 4.3) - only exists with the real bridge. Falls back to the letter square above on 404,
    // same as the mock-icon prototype did, so this degrades safely either way.
    if (typeof window.Paddock !== "undefined" && !app.pkg.startsWith("__")) {
      const img = document.createElement("img");
      img.className = "arc-tick-img";
      img.src = `/icon/${app.pkg}.png`;
      img.onerror = () => img.remove();
      icon.appendChild(img);
    }
    const label = document.createElement("div");
    label.className = "arc-tick-label";
    label.textContent = app.label;
    const num = document.createElement("div");
    num.className = "arc-tick-num";
    num.textContent = String(i + 1).padStart(2, "0"); // real position index, not an invented spec
    tick.appendChild(icon); tick.appendChild(label); tick.appendChild(num);
    wrap.appendChild(tick);
  });
  drawArcBaseline(n);
  setFocus(dFocus, true);
}

// A thin gauge-face line tracing the arc the ticks sit on and the needle sweeps -
// this is the actual track the needle moves along (functional, like the circuit line
// in N), not a decorative addition.
function arcXY(angle) {
  const rad = angle * Math.PI / 180;
  const x = 960 + ARC_RADIUS * Math.sin(rad);
  const yTop = 1080 - (ARC_BOTTOM_AT_CENTER - ARC_RADIUS * (1 - Math.cos(rad)));
  return [x, yTop];
}
function arcPathBetween(a0, a1, steps) {
  let d = "";
  for (let s = 0; s <= steps; s++) {
    const angle = a0 + (a1 - a0) * (s / steps);
    const [x, y] = arcXY(angle);
    d += (s === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
  }
  return d.trim();
}
function drawArcBaseline(n) {
  const half = ARC_SPREAD_DEG / 2;
  const rimHalf = ARC_RIM_SPREAD_DEG / 2;
  // Rim drawn wider than the icon sweep and left to bleed past the canvas edges (see
  // ARC_RIM_SPREAD_DEG above) - also quietly hedges against TV overscan cropping, since a
  // dial that's "supposed to" run off-frame reads as intentional rather than broken.
  document.getElementById("d-arc-baseline-path").setAttribute("d", arcPathBetween(-rimHalf, rimHalf, 40));

  // Redline zone: the last ~15% of the sweep, like the red arc on a real tach's high end.
  document.getElementById("d-arc-redline-path").setAttribute("d", arcPathBetween(half * 0.7, rimHalf, 10));

  // Minor graduation ticks between each pair of major ticks - gauge-face detail, no new data.
  let minorD = "";
  for (let i = 0; i < n - 1; i++) {
    const a0 = angleForIndex(i, n), a1 = angleForIndex(i + 1, n);
    [0.33, 0.67].forEach(f => {
      const angle = a0 + (a1 - a0) * f;
      const [x, y] = arcXY(angle);
      const rad = angle * Math.PI / 180;
      const nx = Math.cos(rad), ny = Math.sin(rad); // outward normal
      minorD += `M${(x - nx * 6).toFixed(1)},${(y + ny * 6).toFixed(1)} L${(x + nx * 6).toFixed(1)},${(y - ny * 6).toFixed(1)} `;
    });
  }
  document.getElementById("d-arc-minor-ticks").setAttribute("d", minorD.trim());
}
// Reactive light trail (council, 2026-10-25): sweeps the exact angular delta the needle just
// traveled. Two persistent, reused <path> elements (never created/destroyed per press) -
// retargeted and re-animated via the Web Animations API, which has an explicit numeric
// duration and needs no transitionend listener (that exact cleanup pattern already proved
// unreliable under rapid interruption elsewhere in this project - see
// troubleshooting/webview-display-none-vs-transitionend-memory.md).
function triggerArcTrail(oldAngle, newAngle) {
  if (REDUCED) return;
  const halo = document.getElementById("d-arc-trail-halo");
  const core = document.getElementById("d-arc-trail-core");
  const d = arcPathBetween(oldAngle, newAngle, 24);
  [halo, core].forEach(el => {
    el.setAttribute("d", d);
    if (el._trailAnim) el._trailAnim.cancel();
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el._trailAnim = el.animate(
      [
        { strokeDashoffset: len, opacity: 1 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.45 },
        { strokeDashoffset: 0, opacity: 0, offset: 1 }
      ],
      { duration: 380, easing: "cubic-bezier(.17,.89,.32,1.49)", fill: "forwards" }
    );
  });
}
// End-stop cue: a key press that can't move further gets its own distinct nudge, so it's
// never mistaken for a real move (council: firing the trail on a non-move is "the fastest
// way to make the effect feel random/ambient rather than caused").
function rubberBandNudge(dir) {
  if (REDUCED || !dir) return;
  const base = angleForIndex(dFocus, dApps.length);
  if (d_needle_pivot._rubberAnim) d_needle_pivot._rubberAnim.cancel();
  d_needle_pivot._rubberAnim = d_needle_pivot.animate(
    [
      { transform: `rotate(${base}deg)` },
      { transform: `rotate(${base + dir * 6}deg)`, offset: 0.4 },
      { transform: `rotate(${base}deg)` }
    ],
    { duration: 160, easing: "ease-out" }
  );
}
function setFocus(i, skipAnim) {
  const n = dApps.length;
  const target = Math.max(0, Math.min(n - 1, i));
  if (!skipAnim && target === dFocus) { rubberBandNudge(i > dFocus ? 1 : i < dFocus ? -1 : 0); return; }
  const oldAngle = angleForIndex(dFocus, n);
  dFocus = target;
  const ticks = document.querySelectorAll("#d-arc .arc-tick");
  ticks.forEach((t, idx) => t.classList.toggle("focused", idx === dFocus));
  const app = dApps[dFocus];
  d_app_name.textContent = app.label;
  d_app_sub.textContent = CONFIG.sublabels[app.pkg] || app.sub || "";
  const angle = angleForIndex(dFocus, n);
  d_needle_pivot.style.transform = `rotate(${angle}deg)`;
  if (!skipAnim) triggerArcTrail(oldAngle, angle);

  // "Red light motion" (Gavin, 2026-10-24): a soft accent glow that travels to the newly
  // focused tick with the needle, triggered by the key press that moved it - not an ambient
  // loop, transform + opacity only.
  const pos = arcPosition(dFocus, n);
  d_needle_glow.style.transform = `translate(${pos.x}px, ${-pos.bottom}px)`;
  d_needle_glow.classList.add("show");
  clearTimeout(setFocus._glowTimer);
  setFocus._glowTimer = setTimeout(() => d_needle_glow.classList.remove("show"), 650);
}
function launchApp(pkg) {
  // DESIGN.md 7: "Launch the intent first, then animate. Never wait for the animation."
  if (typeof window.Paddock !== "undefined") window.Paddock.launch(pkg);
  else console.log("launch() (no bridge, browser dev mode)", pkg);
}
function launchFocused() {
  const app = dApps[dFocus];
  d_needle.classList.add("flash");
  document.getElementById("mode-d").style.transition = "opacity 130ms ease";
  setTimeout(() => d_needle.classList.remove("flash"), 120);
  if (app.pkg === "__all__") { setMode("S"); }
  else if (app.pkg === "__set__") {
    if (typeof window.Paddock !== "undefined") window.Paddock.openSettings("main");
  } else {
    launchApp(app.pkg);
  }
}

// ---------- S mode: wheel list ----------
let sIndex = 0;
let sAllApps = [];
function buildWheel() {
  sAllApps = buildAppList().all;
  renderWheel();
}
function renderWheel() {
  const wrap = document.getElementById("s-wheel");
  wrap.innerHTML = "";
  const rows = [-3, -2, -1, 0, 1, 2, 3];
  rows.forEach(off => {
    const idx = sIndex + off;
    if (idx < 0 || idx >= sAllApps.length) return;
    const row = document.createElement("div");
    const dist = Math.abs(off);
    row.className = "wheel-row " + (dist === 0 ? "d0" : dist === 1 ? "d1" : dist === 2 ? "d2" : "dhide");
    row.textContent = sAllApps[idx].label;
    wrap.appendChild(row);
  });
}
function scrollWheel(dir) {
  sIndex = Math.max(0, Math.min(sAllApps.length - 1, sIndex + dir));
  renderWheel();
  const letter = sAllApps[sIndex].label[0].toUpperCase();
  const el = document.getElementById("s-scroll-letter");
  el.textContent = letter;
  el.classList.add("show");
  clearTimeout(scrollWheel._t);
  scrollWheel._t = setTimeout(() => el.classList.remove("show"), 500);
}

// ---------- Park mode ----------
function renderParkClock() {
  const d = now();
  let h = d.getHours();
  if (CONFIG.clock.format === "12h") { h = h % 12; if (h === 0) h = 12; }
  p_clock.textContent = CONFIG.clock.format === "12h" ? `${h}:${pad2(d.getMinutes())}` : `${pad2(h)}:${pad2(d.getMinutes())}`;
}
function driftParkClock() {
  const top = 10 + Math.random() * 70, left = 10 + Math.random() * 70;
  p_clock.style.top = `${top}%`;
  p_clock.style.left = `${left}%`;
}
let parkDriftTimer = null;

// ---------- mode state machine ----------
let mode = "N";
let idleTimer = null;
let showroomTimer = null;

function isNight(d) {
  const [sh, sm] = CONFIG.night.start.split(":").map(Number);
  const [eh, em] = CONFIG.night.end.split(":").map(Number);
  const mins = d.getHours() * 60 + d.getMinutes();
  const start = sh * 60 + sm, end = eh * 60 + em;
  return start > end ? (mins >= start || mins < end) : (mins >= start && mins < end);
}

let lastActivity = Date.now();
function noteActivity() { lastActivity = Date.now(); }

// Phase 2 finding: transitionend is unreliable here - a rapid key-mash interrupts the
// opacity transition before it completes, which means transitionend never fires, so the
// mode never gets display:none and stays GPU-composited forever. That was the real cause
// of the memory climbing every time modes were switched quickly (not the photos). A timer
// matched to the transition duration is reliable even when the transition gets interrupted.
function modeHideDelayMs() {
  return document.body.classList.contains("reduced-motion") ? 150 : 320;
}
function showMode(el) {
  clearTimeout(el._hideTimer);
  el.style.display = "block";
  void el.offsetWidth; // force a layout flush so the opacity transition below actually animates
  el.classList.add("active");
}
function hideMode(el) {
  el.classList.remove("active");
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = "none"; }, modeHideDelayMs());
}

function setMode(next) {
  if (next === mode) return;
  const prevEl = document.getElementById(`mode-${mode.toLowerCase()}`);
  const nextEl = document.getElementById(`mode-${next.toLowerCase()}`);
  hideMode(prevEl);
  showMode(nextEl);
  mode = next;

  clearTimeout(idleTimer); clearTimeout(showroomTimer); clearInterval(parkDriftTimer);

  if (next === "D") {
    buildArc();
    idleTimer = setTimeout(() => setMode("N"), 20000);
  } else if (next === "S") {
    buildWheel();
  } else if (next === "SHOWROOM") {
    showroomTimer = setInterval(advanceCar, (CONFIG.garage.showroom_advance_seconds || 12) * 1000);
  } else if (next === "P") {
    renderParkClock();
    driftParkClock();
    parkDriftTimer = setInterval(() => { driftParkClock(); }, 5 * 60 * 1000);
  }
}

function checkNightRule() {
  if (mode !== "N") return;
  const idleMs = Date.now() - lastActivity;
  const idleMin = (CONFIG.night.park_after_idle_min || 30) * 60 * 1000;
  if (isNight(now()) && idleMs >= idleMin) setMode("P");
}

// ---------- input ----------
let holdTimer = null, holdShown = false, holdSel = 0;

// Single entry point for every key, from either source:
//  - the browser keyboard listener below (Phase 1 prototype, dev testing)
//  - window.paddock.onKey(name), called directly by the real launcher's native side, which
//    does its own D-pad/hold detection in dispatchKeyEvent and never lets the WebView see a
//    raw DOM key event (SPEC.md 4.2: "the Activity catches every key... JS owns navigation").
// "okHold" arrives as its own key name (native already did the 0.5s timing), not as a
// separate down/up pair - the browser adapter below translates its own timer into the same name.
function onPaddockKey(key) {
  noteActivity();
  if (!startupSkipped) { skipStartup(); return; }
  if (key === "okHold") {
    if (!holdShown) { holdShown = true; showHoldMenu(); }
    return;
  }
  if (key === "ok" && holdShown) { holdShown = false; hideHoldMenu(); return; }
  handleKey(key);
}

function onKeyDown(e) {
  if (e.key === "Enter") {
    if (!holdTimer) holdTimer = setTimeout(() => onPaddockKey("okHold"), 500);
    return;
  }
  onPaddockKey(keyName(e));
}
function onKeyUp(e) {
  if (e.key === "Enter") {
    const wasHolding = holdShown;
    clearTimeout(holdTimer); holdTimer = null;
    if (!wasHolding) onPaddockKey("ok");
  }
}
function keyName(e) {
  switch (e.key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "Escape": return "back";
    default: return "";
  }
}
function showHoldMenu() {
  if (mode !== "D") return;
  holdSel = 0;
  updateHoldSel();
  d_hold_menu.classList.add("show");
}
function hideHoldMenu() { d_hold_menu.classList.remove("show"); }
function updateHoldSel() {
  hold_move.classList.toggle("sel", holdSel === 0);
  hold_remove.classList.toggle("sel", holdSel === 1);
}

function handleKey(key) {
  if (!key) return;
  if (mode === "N") {
    if (key === "left") { carIndex = (carIndex - 1 + currentCarsLen()) % currentCarsLen(); renderCar(); }
    else if (key === "right") { advanceCar(); }
    else if (key === "ok") { setMode("D"); }
    else if (key === "down") { setMode("D"); }
    else if (key === "up") { setMode("SHOWROOM"); }
  } else if (mode === "D") {
    if (holdShown) {
      if (key === "left" || key === "right") { holdSel = 1 - holdSel; updateHoldSel(); }
      else if (key === "back") { holdShown = false; hideHoldMenu(); }
      return;
    }
    if (key === "left") setFocus(dFocus - 1);
    else if (key === "right") setFocus(dFocus + 1);
    else if (key === "ok") launchFocused();
    else if (key === "down") setMode("S");
    else if (key === "up") setMode("N");
    else if (key === "back") setMode("N");
  } else if (mode === "S") {
    if (key === "up") { if (sIndex === 0) setMode("D"); else scrollWheel(-1); }
    else if (key === "down") scrollWheel(1);
    else if (key === "ok") { if (sAllApps[sIndex]) launchApp(sAllApps[sIndex].pkg); }
    else if (key === "back") setMode("D");
  } else if (mode === "SHOWROOM") {
    if (key === "left") { carIndex = (carIndex - 1 + currentCarsLen()) % currentCarsLen(); advanceShowroom(); }
    else if (key === "right") { carIndex = (carIndex + 1) % currentCarsLen(); advanceShowroom(); }
    // Up and OK also return to N (not just Back) - a dead-end where Back was the only way
    // out was a real complaint, Showroom is reached from N via Up so Up going back matches.
    else if (key === "back" || key === "up" || key === "ok") setMode("N");
  } else if (mode === "P") {
    setMode("N");
  }
}
function currentCarsLen() { const c = currentCars(); return c ? c.length : 1; }
function advanceShowroom() { renderCar(); }

// ---------- startup sweep ----------
let startupSkipped = false;
function buildSweepTicks() {
  const n = 9;
  const wrap = document.getElementById("sweep-ticks");
  for (let i = 0; i < n; i++) {
    const t = document.createElement("div");
    t.className = "sweep-tick";
    const pos = arcPosition(i, n);
    t.style.left = `${pos.x - 2}px`;
    t.style.bottom = `${pos.bottom - 30}px`;
    wrap.appendChild(t);
  }
}
function playStartupSweep() {
  const overlay = document.getElementById("startup-sweep");
  const needle = document.getElementById("sweep-needle");
  const ticks = [...document.querySelectorAll(".sweep-tick")];
  overlay.classList.remove("hidden");
  needle.style.transition = "transform 700ms ease";
  requestAnimationFrame(() => needle.style.transform = `rotate(${ARC_SPREAD_DEG / 2}deg)`);
  ticks.forEach((t, i) => setTimeout(() => t.classList.add("lit"), 700 * (i / ticks.length)));
  setTimeout(() => {
    needle.style.transition = "transform 500ms ease";
    needle.style.transform = `rotate(${-ARC_SPREAD_DEG / 2}deg)`;
  }, 700);
  setTimeout(skipStartup, 1200);
}
function skipStartup() {
  if (startupSkipped) return;
  startupSkipped = true;
  document.getElementById("startup-sweep").classList.add("hidden");
}

// ---------- boot ----------
let n_lapCounter, d_lapCounter, s_lapCounter, n_time, n_date, n_odo, n_net,
  n_car_name, n_car_caption, n_car_line0, n_car_line1,
  d_time, s_time, d_app_name, d_app_sub, d_needle, d_needle_pivot, d_needle_glow, d_hold_menu, hold_move, hold_remove, p_clock;

function bindEls() {
  n_lapCounter = document.getElementById("n-lap-counter");
  d_lapCounter = document.getElementById("d-lap-counter");
  s_lapCounter = document.getElementById("s-lap-counter");
  n_time = document.getElementById("n-time");
  n_date = document.getElementById("n-date");
  n_odo = document.getElementById("n-odo");
  n_net = document.getElementById("n-net");
  n_car_name = document.getElementById("n-car-name");
  n_car_caption = document.getElementById("n-car-caption");
  n_car_line0 = document.getElementById("n-car-line0");
  n_car_line1 = document.getElementById("n-car-line1");
  d_time = document.getElementById("d-time");
  s_time = document.getElementById("s-time");
  d_app_name = document.getElementById("d-app-name");
  d_app_sub = document.getElementById("d-app-sub");
  d_needle = document.getElementById("d-needle");
  d_needle_pivot = document.getElementById("d-needle-pivot");
  d_needle_glow = document.getElementById("d-needle-glow");
  d_hold_menu = document.getElementById("d-hold-menu");
  hold_move = document.getElementById("hold-move");
  hold_remove = document.getElementById("hold-remove");
  p_clock = document.getElementById("p-clock");
}

async function boot() {
  bindEls();
  CONFIG = await loadJSON(FILES + "paddock.config.json", DEFAULT_CONFIG);
  GARAGE = await loadJSON(FILES + "garage.json", { cars: [] });
  if (qs.get("reduced") === "1") CONFIG.motion.reduced = true;
  buildSlides();

  await initCircuit();
  buildSweepTicks();

  const carParam = qs.get("car");
  if (carParam !== null) carIndex = Math.max(0, parseInt(carParam, 10) || 0);

  renderClock(); renderCircuit(); renderReadouts(); renderCar();
  lastRotationSlot = Math.floor(lapState(now()).frac * 6) % 6; // don't fire an advance on the very first tick

  const startMode = (qs.get("mode") || "N").toUpperCase();
  const startEl = document.getElementById(`mode-${startMode.toLowerCase()}`);
  if (startEl) { startEl.style.display = "block"; startEl.classList.add("active"); }
  mode = startMode;
  if (mode === "D") buildArc();
  if (mode === "S") buildWheel();

  if (qs.get("night") === "1") {
    // Force a visible night check almost immediately for dev purposes.
    lastActivity = Date.now() - (CONFIG.night.park_after_idle_min * 60 * 1000 + 1000);
  }

  startMainTick();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  // The real launcher's native side calls these directly (SPEC.md 4.3); the browser listeners
  // above are only ever exercised in the Phase 1 dev prototype, where window.paddock doesn't exist.
  window.paddock = { onKey: onPaddockKey, onLifecycle: onPaddockLifecycle, onHome: onPaddockHome };

  if (qs.get("mode")) {
    skipStartup();
  } else {
    playStartupSweep();
  }

  if (qs.get("debug") === "1") {
    const hud = document.getElementById("dev-hud");
    hud.style.display = "block";
    hud.textContent = `mode=${mode}  time override=${qs.get("time") || "none"}  reduced=${REDUCED}`;
  }
}

// Pressing the physical Home button while already in Paddock re-delivers the HOME intent
// (onNewIntent) rather than restarting the process - SPEC.md 4.1 says this should always land
// back on the ambient screen, same as how N already swallows Back.
function onPaddockHome() {
  if (holdShown) { holdShown = false; hideHoldMenu(); }
  setMode("N");
}

// ---------- lifecycle (native calls window.paddock.onLifecycle) ----------
let mainTick = null;
let pausedAt = 0;
function startMainTick() {
  clearInterval(mainTick);
  mainTick = setInterval(() => {
    renderClock(); renderCircuit(); renderReadouts(); checkNightRule(); checkGarageRotation();
    if (mode === "P") renderParkClock();
  }, 1000);
}
function onPaddockLifecycle(state) {
  if (state === "pause") {
    pausedAt = Date.now();
    clearInterval(mainTick); mainTick = null;
    clearInterval(showroomTimer); clearInterval(parkDriftTimer); clearTimeout(idleTimer);
  } else if (state === "resume") {
    startMainTick();
    renderClock(); renderCircuit(); renderReadouts();
    const offMs = pausedAt ? Date.now() - pausedAt : 0;
    // SPEC.md 5.6: play the self-test again if the screen was off more than 10 minutes.
    if (offMs > 10 * 60 * 1000) {
      startupSkipped = false;
      playStartupSweep();
    }
  }
}

boot();
