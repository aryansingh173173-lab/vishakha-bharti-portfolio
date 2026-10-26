// All sound is synthesised with Web Audio, so there are no audio files to license or load:
// ocean waves (filtered noise swelling and receding), a soft buggy engine that follows speed,
// and a slow ambient pad with occasional bell notes.

const MUTE_KEY = 'vb-muted';

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
function writeMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
}

function noiseBuffer(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1; // pinkish noise
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  return buf;
}

function impulse(ctx, seconds = 3.5) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let muted = readMuted();

  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.55;
  reverb.connect(reverbGain).connect(master);

  // ---- Waves
  const noise = noiseBuffer(ctx);
  const surf = ctx.createBufferSource();
  surf.buffer = noise;
  surf.loop = true;
  const surfLow = ctx.createBiquadFilter();
  surfLow.type = 'lowpass';
  surfLow.frequency.value = 520;
  const surfGain = ctx.createGain();
  surfGain.gain.value = 0.16;
  surf.connect(surfLow).connect(surfGain).connect(master);

  const wash = ctx.createBufferSource();
  wash.buffer = noise;
  wash.loop = true;
  wash.playbackRate.value = 0.83;
  const washBand = ctx.createBiquadFilter();
  washBand.type = 'bandpass';
  washBand.frequency.value = 1300;
  washBand.Q.value = 0.35;
  const washGain = ctx.createGain();
  washGain.gain.value = 0.07;
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.13; // one wave every ~7.7 s
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.065;
  swell.connect(swellDepth).connect(washGain.gain);
  swell.connect(swellDepth).connect(surfGain.gain);
  wash.connect(washBand).connect(washGain).connect(master);

  // ---- Engine
  const engGain = ctx.createGain();
  engGain.gain.value = 0;
  const engFilter = ctx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 340;
  engFilter.Q.value = 2;
  const engA = ctx.createOscillator();
  engA.type = 'sawtooth';
  engA.frequency.value = 46;
  const engB = ctx.createOscillator();
  engB.type = 'square';
  engB.frequency.value = 23;
  const engBGain = ctx.createGain();
  engBGain.gain.value = 0.5;
  engA.connect(engFilter);
  engB.connect(engBGain).connect(engFilter);
  engFilter.connect(engGain).connect(master);

  // ---- Music: slow pad in D major with bell notes
  const music = ctx.createGain();
  music.gain.value = 0.13;
  const musicTone = ctx.createBiquadFilter();
  musicTone.type = 'lowpass';
  musicTone.frequency.value = 2200;
  music.connect(musicTone);
  musicTone.connect(master);
  musicTone.connect(reverb);

  const chords = [
    [50, 57, 61, 64, 66], // Dmaj9
    [47, 54, 57, 62, 66], // Bm11
    [43, 50, 54, 59, 62], // Gmaj7
    [45, 52, 57, 61, 64], // A6/9
  ];
  const bells = [74, 76, 78, 81, 83, 86];
  const CHORD = 9;
  let nextChord = ctx.currentTime + 0.5;
  let chordIdx = 0;
  let nextBell = ctx.currentTime + 4;

  function pad(time, notes) {
    for (const n of notes) {
      for (const [type, detune, level] of [['sine', 0, 0.09], ['triangle', -6, 0.045]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = hz(n);
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(level, time + 3.2);
        g.gain.setValueAtTime(level, time + CHORD - 1);
        g.gain.linearRampToValueAtTime(0, time + CHORD + 3.5);
        o.connect(g).connect(music);
        o.start(time);
        o.stop(time + CHORD + 4);
      }
    }
  }

  function bell(time) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(bells[Math.floor(Math.random() * bells.length)]);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.07, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 3.4);
    o.connect(g);
    g.connect(reverb);
    g.connect(music);
    o.start(time);
    o.stop(time + 3.5);
  }

  const scheduler = setInterval(() => {
    if (ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 1.5;
    while (nextChord < ahead) {
      pad(nextChord, chords[chordIdx++ % chords.length]);
      nextChord += CHORD;
    }
    while (nextBell < ahead) {
      bell(nextBell);
      nextBell += 2.4 + Math.random() * 4;
    }
  }, 400);

  for (const n of [surf, wash, swell, engA, engB]) n.start();

  let suspendTimer = 0;
  const level = () => (muted ? 0 : 0.9);
  master.gain.setTargetAtTime(level(), ctx.currentTime, 1.2);

  return {
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      writeMuted(v);
      master.gain.setTargetAtTime(level(), ctx.currentTime, 0.25);
    },
    setEngine(speed) {
      const t = ctx.currentTime;
      engA.frequency.setTargetAtTime(44 + speed * 62, t, 0.15);
      engB.frequency.setTargetAtTime(22 + speed * 31, t, 0.15);
      engFilter.frequency.setTargetAtTime(280 + speed * 520, t, 0.2);
      engGain.gain.setTargetAtTime(speed > 0.02 ? 0.018 + speed * 0.05 : 0.008, t, 0.25);
    },
    // Fireworks over the sea. Sound travels at 343 m/s, so far bursts are heard a moment after they're seen.
    firework(kind, distance = 150, flight = 1.8) {
      if (ctx.state !== 'running') return;
      const t = ctx.currentTime + (kind === 'burst' ? distance / 343 : 0.05);
      const fall = Math.min(1, 120 / Math.max(60, distance));
      const hiss = (at, dur, freq, gain, type = 'bandpass') => {
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        s.connect(f).connect(g);
        g.connect(master);
        g.connect(reverb);
        s.start(at, Math.random() * 3);
        s.stop(at + dur + 0.05);
      };
      if (kind === 'launch') {
        hiss(t, 0.5, 1800, 0.08 * fall);                       // splash as it leaves the water
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(2300, t + flight);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.012 * fall, t + 0.2);
        g.gain.linearRampToValueAtTime(0, t + flight);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + flight + 0.05);
      } else {
        hiss(t, 1.6, 140, 0.55 * fall, 'lowpass');            // the boom
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(32, t + 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.3 * fall, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 1.2);
        for (let i = 0; i < 26; i++) hiss(t + 0.5 + Math.random() * 1.3, 0.03, 3200 + Math.random() * 2500, 0.05 * fall); // crackle
      }
    },
    suspend() {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => ctx.state === 'running' && ctx.suspend(), 500);
    },
    resume() {
      clearTimeout(suspendTimer);
      ctx.resume();
      nextChord = Math.max(nextChord, ctx.currentTime + 0.2);
      nextBell = Math.max(nextBell, ctx.currentTime + 1);
      master.gain.setTargetAtTime(level(), ctx.currentTime, 0.6);
    },
    dispose() { clearInterval(scheduler); ctx.close(); },
  };
}
