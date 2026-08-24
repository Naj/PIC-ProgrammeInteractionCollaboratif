/* ============================================================
   PIC — Ouverture animée · by Majin
   Séquence de 10 s, partition Web Audio, saut possible à tout moment.
   Expose window.PICIntro.play({ sound }) → Promise
   ============================================================ */
(function () {
"use strict";

const DURATION = 10000;

/* Position de départ des neuf carrés, en cases de la grille 3×3 */
const GRID = [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]];

function build() {
  const root = document.createElement("div");
  root.className = "intro";
  root.id = "intro";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Ouverture de PIC");

  const squares = GRID.map(([cx, cy], i) => {
    const s = document.createElement("span");
    s.className = "intro-sq" + (i % 2 ? " is-white" : "");
    s.style.setProperty("--gx", cx * 34 + "px");
    s.style.setProperty("--gy", cy * 34 + "px");
    s.style.animationDelay = (0.18 + i * 0.075).toFixed(3) + "s";
    return s;
  });

  root.innerHTML =
    '<div class="intro-stage">' +
      '<div class="intro-grid"></div>' +
      '<div class="intro-mark"><span class="intro-mark-sq"></span><span class="intro-mark-txt">PIC</span></div>' +
      '<h1 class="intro-title"><span>Programme d\'Interaction Collaboratif</span></h1>' +
      '<ul class="intro-words">' +
        '<li style="--d:5.20s">Suivre</li>' +
        '<li style="--d:5.62s">Collaborer</li>' +
        '<li style="--d:6.04s">Capitaliser</li>' +
      '</ul>' +
      '<div class="intro-majin">by Majin</div>' +
    '</div>' +
    '<span class="intro-wipe"></span>' +
    '<div class="intro-progress"><i></i></div>' +
    '<button class="intro-skip" type="button">Passer</button>' +
    '<button class="intro-sound" type="button" hidden>Activer le son</button>';

  const grid = root.querySelector(".intro-grid");
  squares.forEach(s => grid.appendChild(s));
  return root;
}

/* ---------- Partition ---------- */
function score(ctx, gain) {
  const t0 = ctx.currentTime + 0.05;

  const tone = (start, freq, dur, type, level, glideTo) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0 + start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + start + dur);
    g.gain.setValueAtTime(0.0001, t0 + start);
    g.gain.exponentialRampToValueAtTime(level, t0 + start + Math.min(0.05, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    o.connect(g); g.connect(gain);
    o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
  };

  const chord = (start, freqs, dur, level) =>
    freqs.forEach((f, i) => tone(start + i * 0.045, f, dur, "triangle", level));

  /* Nappe de fond, sol grave filtré */
  const pad = ctx.createOscillator(), padG = ctx.createGain(), lp = ctx.createBiquadFilter();
  pad.type = "sawtooth"; pad.frequency.value = 98;
  lp.type = "lowpass"; lp.frequency.setValueAtTime(180, t0);
  lp.frequency.linearRampToValueAtTime(900, t0 + 7);
  padG.gain.setValueAtTime(0.0001, t0);
  padG.gain.exponentialRampToValueAtTime(0.05, t0 + 1.6);
  padG.gain.setValueAtTime(0.05, t0 + 8.2);
  padG.gain.exponentialRampToValueAtTime(0.0001, t0 + 9.7);
  pad.connect(lp); lp.connect(padG); padG.connect(gain);
  pad.start(t0); pad.stop(t0 + 9.9);

  /* Neuf carrés : neuf impulsions montantes */
  for (let i = 0; i < 9; i++) tone(0.2 + i * 0.075, 320 + i * 62, 0.12, "square", 0.045);

  /* Convergence puis apparition du bloc PIC */
  tone(1.55, 700, 0.55, "sine", 0.07, 190);
  chord(2.25, [392, 523.25, 659.25], 1.5, 0.075);          // sol majeur

  /* Ouverture du titre */
  tone(3.62, 261.63, 1.1, "sine", 0.05);
  chord(3.70, [523.25, 783.99], 1.3, 0.045);

  /* Les trois mots */
  [5.20, 5.62, 6.04].forEach((t, i) => tone(t, 587.33 + i * 130, 0.26, "triangle", 0.06));

  /* Tampon « by Majin » */
  tone(7.02, 140, 0.32, "square", 0.09, 62);

  /* Résolution finale */
  chord(8.60, [392, 493.88, 587.33, 783.99], 1.35, 0.085);

  return t0 + 10;
}

function play(opts) {
  const wantSound = !opts || opts.sound !== false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  return new Promise(resolve => {
    const root = build();
    document.body.appendChild(root);
    document.body.classList.add("intro-open");

    if (reduced) root.classList.add("is-reduced");

    let ctx = null, master = null, done = false;

    function startAudio() {
      if (!wantSound || ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        if (ctx.state === "suspended") {
          root.querySelector(".intro-sound").hidden = false;
          ctx.resume().then(() => { root.querySelector(".intro-sound").hidden = true; }).catch(() => {});
        }
        score(ctx, master);
      } catch (e) { /* audio indisponible : l'animation continue */ }
    }

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (ctx && master) {
        try {
          master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
          setTimeout(() => ctx.close().catch(() => {}), 500);
        } catch (e) { /* rien */ }
      }
      root.classList.add("is-closing");
      setTimeout(() => {
        root.remove();
        document.body.classList.remove("intro-open");
        resolve();
      }, 420);
    }

    function onKey(e) { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); }

    root.querySelector(".intro-skip").addEventListener("click", finish);
    root.querySelector(".intro-sound").addEventListener("click", () => {
      if (ctx) ctx.resume().then(() => { root.querySelector(".intro-sound").hidden = true; }).catch(() => {});
    });
    window.addEventListener("keydown", onKey);

    startAudio();
    /* Les navigateurs bloquent le son tant que rien n'a été touché :
       le premier geste, quel qu'il soit, le réveille. */
    const wake = () => { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); };
    ["pointerdown", "keydown", "touchstart"].forEach(ev =>
      window.addEventListener(ev, wake, { once: true, passive: true }));

    const timer = setTimeout(finish, reduced ? 1400 : DURATION);
  });
}

window.PICIntro = { play, DURATION };

})();
