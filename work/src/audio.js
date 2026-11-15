const AUDIO_STORAGE_KEY = 'sanctum_of_ash_audio';
const MAX_MASTER_GAIN = 0.56;
const MAX_CONCURRENT_VOICES = 48;

const BIOME_AMBIENCE_PROFILES = {
  sunken_cathedral: { notes: [36.71, 55.0, 82.41, 110.0], filterFreq: 185, noiseFreq: 420, noiseQ: 1.4, noiseGain: 0.016, shimmer: 293.66 },
  withered_roothollow: { notes: [38.89, 58.27, 77.78, 116.54], filterFreq: 165, noiseFreq: 560, noiseQ: 1.9, noiseGain: 0.018, shimmer: 311.13 },
  ossuary_catacomb: { notes: [34.65, 51.91, 69.30, 103.83], filterFreq: 150, noiseFreq: 740, noiseQ: 2.3, noiseGain: 0.013, shimmer: 277.18 },
  plague_alchemica: { notes: [36.71, 51.91, 73.42, 103.83], filterFreq: 195, noiseFreq: 620, noiseQ: 2.6, noiseGain: 0.015, shimmer: 261.63 },
  ashen_foundry: { notes: [32.70, 49.00, 65.41, 98.00], filterFreq: 220, noiseFreq: 310, noiseQ: 1.1, noiseGain: 0.020, shimmer: 246.94 },
  crimson_inquisition: { notes: [36.71, 55.0, 87.31, 110.0], filterFreq: 205, noiseFreq: 510, noiseQ: 1.6, noiseGain: 0.014, shimmer: 349.23 },
  obsidian_throne: { notes: [30.87, 46.25, 61.74, 92.50], filterFreq: 175, noiseFreq: 280, noiseQ: 1.3, noiseGain: 0.019, shimmer: 246.94 },
  astral_rift: { notes: [41.20, 61.74, 92.50, 123.47], filterFreq: 260, noiseFreq: 920, noiseQ: 2.8, noiseGain: 0.012, shimmer: 493.88 }
};

const CINDER_SCALE = [587.33, 659.25, 698.46, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1396.91, 1567.98];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.saturator = null;
    this.dry = null;
    this.wet = null;
    this.uiBus = null;
    this.ambBus = null;
    this.convolver = null;
    this.muted = false;
    this.volume = 0.80;
    this.pausedDamp = false;
    this.started = false;

    this.noiseBuffer = null;
    this.pinkBuffer = null;
    this.crackleBuffer = null;

    this.listenerX = 0;
    this.listenerZ = 0;
    this._activeVoices = 0;
    this._cooldowns = new Map();
    this._cinderChain = 0;
    this._lastCinderAt = 0;
    this._stepToggle = 0;
    this._ambNodes = null;
    this._currentBiomeId = 'sunken_cathedral';
    this._inCombatAmb = false;

    this.stats = {
      totalPlayed: 0,
      playedByCue: {},
      lastCue: null,
      errors: 0
    };

    this._loadPrefs();
    this._bindAutoUnlock();
  }

  _bindAutoUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (!this.started) this.init();
      else if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { passive: true, once: false });
    window.addEventListener('keydown', unlock, { passive: true, once: false });
  }

  _loadPrefs() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(AUDIO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
      if (typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)) {
        this.volume = Math.max(0, Math.min(1, parsed.volume));
      }
    } catch (_) {}
  }

  _savePrefs() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({
          muted: this.muted,
          volume: +this.volume.toFixed(2)
        }));
      }
    } catch (_) {}
  }

  _targetGain() {
    if (this.muted || this.volume <= 0.001) return 0.0001;
    const base = Math.max(0.0001, this.volume * MAX_MASTER_GAIN);
    return this.pausedDamp ? Math.max(0.0001, base * 0.36) : base;
  }

  _applyGain(smooth = 0.05) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.master) {
      this.master.gain.setTargetAtTime(this._targetGain(), now, smooth);
    }
    if (this.ambBus) {
      const ambTarget = this.pausedDamp ? 0.30 : (this._inCombatAmb ? 0.96 : 0.78);
      this.ambBus.gain.setTargetAtTime(ambTarget, now, 0.14);
    }
  }

  _makeWarmSaturatorCurve() {
    const n = 2048;
    const curve = new Float32Array(n);
    const drive = 1.22;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(x * drive) / norm;
    }
    return curve;
  }

  _buildNoiseBuffers() {
    const sr = this.ctx.sampleRate;
    const nLen = Math.floor(sr * 2.0);

    this.noiseBuffer = this.ctx.createBuffer(1, nLen, sr);
    const wd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < nLen; i++) wd[i] = Math.random() * 2 - 1;

    this.pinkBuffer = this.ctx.createBuffer(1, nLen, sr);
    const pd = this.pinkBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < nLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }

    this.crackleBuffer = this.ctx.createBuffer(1, nLen, sr);
    const cd = this.crackleBuffer.getChannelData(0);
    let hold = 0;
    for (let i = 0; i < nLen; i++) {
      if (Math.random() < 0.028) {
        hold = (Math.random() * 2 - 1) * (0.55 + Math.random() * 0.45);
      } else {
        hold *= 0.84;
      }
      cd[i] = hold + (Math.random() * 2 - 1) * 0.08;
    }
  }

  _buildCathedralIR() {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 2.35);
    const ir = this.ctx.createBuffer(2, len, sr);
    const earlyTaps = [
      [0.011, 0.36, -0.35],
      [0.019, 0.29, 0.42],
      [0.029, 0.24, -0.22],
      [0.043, 0.19, 0.31],
      [0.061, 0.15, -0.40],
      [0.083, 0.12, 0.25]
    ];
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const raw = Math.random() * 2 - 1;
        const dampAlpha = Math.max(0.08, 0.62 * (1 - t * 0.78));
        lp += (raw - lp) * dampAlpha;
        const env = Math.pow(1 - t, 2.85) * (t < 0.012 ? t / 0.012 : 1.0);
        data[i] = lp * env * 0.38;
      }
      for (const [sec, amp, pan] of earlyTaps) {
        const idx = Math.floor(sec * sr) + (ch === 0 ? 0 : 19);
        if (idx < len) {
          const w = ch === 0 ? (1 - Math.max(0, pan)) : (1 + Math.min(0, pan));
          data[idx] += amp * w * (ch === 0 ? 1 : -1) * 0.55;
        }
      }
    }
    return ir;
  }

  init() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._targetGain();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4.2;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.16;

      this.saturator = this.ctx.createWaveShaper();
      this.saturator.curve = this._makeWarmSaturatorCurve();
      this.saturator.oversample = '2x';

      this.dry = this.ctx.createGain();
      this.dry.gain.value = 0.86;

      this.uiBus = this.ctx.createGain();
      this.uiBus.gain.value = 0.92;

      this.ambBus = this.ctx.createGain();
      this.ambBus.gain.value = 0.78;

      this.preDelay = this.ctx.createDelay(0.1);
      this.preDelay.delayTime.value = 0.021;

      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this._buildCathedralIR();

      this.wetFilter = this.ctx.createBiquadFilter();
      this.wetFilter.type = 'lowpass';
      this.wetFilter.frequency.value = 3400;

      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.27;

      this.uiWetSend = this.ctx.createGain();
      this.uiWetSend.gain.value = 0.12;

      this.dry.connect(this.saturator);
      this.uiBus.connect(this.saturator);
      this.uiBus.connect(this.uiWetSend);
      this.uiWetSend.connect(this.convolver);
      this.ambBus.connect(this.saturator);

      this.preDelay.connect(this.convolver);
      this.convolver.connect(this.wetFilter);
      this.wetFilter.connect(this.wet);
      this.wet.connect(this.saturator);

      this.saturator.connect(this.compressor);
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);

      this._buildNoiseBuffers();
      this.started = true;
      this.startAmbience();
    } catch (_) {
      this.stats.errors++;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted && this.volume <= 0.01) {
      this.volume = 0.50;
    }
    this._applyGain(0.06);
    this._savePrefs();
    if (!this.muted) this.uiSettingTick(true);
    return this.muted;
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
    this.volume = clamped;
    if (clamped <= 0.001) {
      this.muted = true;
    } else if (this.muted) {
      this.muted = false;
    }
    this._applyGain(0.04);
    this._savePrefs();
    return this.volume;
  }

  setPausedDamp(paused) {
    this.pausedDamp = !!paused;
    this._applyGain(0.08);
  }

  setListener(x, z) {
    if (Number.isFinite(x)) this.listenerX = x;
    if (Number.isFinite(z)) this.listenerZ = z;
  }

  _ready(cueName, minGapMs = 0, allowWhenDamped = true) {
    if (!this.ctx || this.muted || this.volume <= 0.001) return false;
    if (!allowWhenDamped && this.pausedDamp) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (minGapMs > 0) {
      const prev = this._cooldowns.get(cueName) || 0;
      if (nowMs - prev < minGapMs) return false;
      this._cooldowns.set(cueName, nowMs);
    }
    this.stats.totalPlayed++;
    this.stats.lastCue = cueName;
    this.stats.playedByCue[cueName] = (this.stats.playedByCue[cueName] || 0) + 1;
    return true;
  }

  _spatial(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
      return { pan: 0, att: 1.0 };
    }
    const dx = pos.x - this.listenerX;
    const dz = pos.z - this.listenerZ;
    const dist = Math.hypot(dx, dz);
    const pan = Math.max(-0.72, Math.min(0.72, dx / 10.5));
    const att = 1.0 / (1.0 + Math.max(0, dist - 3.5) * 0.065);
    return { pan, att: Math.max(0.22, Math.min(1.0, att)) };
  }

  _jitter(amount = 0.03) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  _connectOut(node, { pan = 0, wet = 0.22, bus = 'sfx' } = {}) {
    const targetDry = bus === 'ui' ? this.uiBus : this.dry;
    let tail = node;
    if (this.ctx.createStereoPanner && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      tail = panner;
    }
    tail.connect(targetDry);
    if (wet > 0.005 && this.preDelay) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      tail.connect(send);
      send.connect(this.preDelay);
    }
  }

  _tone(opts) {
    if (!this.ctx || this._activeVoices >= MAX_CONCURRENT_VOICES) return;
    try {
      const {
        type = 'sine',
        freq = 440,
        midFreq = null,
        midAt = 0.4,
        endFreq = null,
        dur = 0.18,
        delay = 0,
        attack = 0.004,
        gain = 0.12,
        detune = 0,
        filterType = null,
        filterFreq = 2400,
        filterEnd = null,
        q = 1.0,
        pan = 0,
        wet = 0.20,
        bus = 'sfx'
      } = opts;
      const t0 = this.ctx.currentTime + Math.max(0, delay);
      const safeDur = Math.max(0.018, dur);
      const f0 = Math.max(16, Math.min(18000, freq));
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (detune) osc.detune.setValueAtTime(detune, t0);
      if (midFreq !== null) {
        const fm = Math.max(16, Math.min(18000, midFreq));
        osc.frequency.exponentialRampToValueAtTime(fm, t0 + safeDur * Math.max(0.05, Math.min(0.9, midAt)));
      }
      if (endFreq !== null) {
        const fe = Math.max(16, Math.min(18000, endFreq));
        osc.frequency.exponentialRampToValueAtTime(fe, t0 + safeDur);
      }

      const env = this.ctx.createGain();
      const peak = Math.max(0.0002, gain);
      const atk = Math.min(safeDur * 0.45, Math.max(0.0015, attack));
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + atk);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + safeDur);

      let head = osc;
      if (filterType) {
        const flt = this.ctx.createBiquadFilter();
        flt.type = filterType;
        flt.frequency.setValueAtTime(Math.max(24, Math.min(18000, filterFreq)), t0);
        if (filterEnd !== null) {
          flt.frequency.exponentialRampToValueAtTime(Math.max(24, Math.min(18000, filterEnd)), t0 + safeDur);
        }
        flt.Q.value = q;
        osc.connect(flt);
        head = flt;
      }
      head.connect(env);
      this._connectOut(env, { pan, wet, bus });

      this._activeVoices++;
      osc.onended = () => {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
        try { env.disconnect(); } catch (_) {}
      };
      osc.start(t0);
      osc.stop(t0 + safeDur + 0.015);
    } catch (_) {
      this.stats.errors++;
    }
  }

  _fm(opts) {
    if (!this.ctx || this._activeVoices >= MAX_CONCURRENT_VOICES) return;
    try {
      const {
        carrier = 440,
        endCarrier = null,
        ratio = 2.0,
        modIndex = 120,
        modEnd = 4,
        carrierType = 'sine',
        modType = 'sine',
        dur = 0.24,
        delay = 0,
        attack = 0.003,
        gain = 0.11,
        highpass = null,
        pan = 0,
        wet = 0.25,
        bus = 'sfx'
      } = opts;
      const t0 = this.ctx.currentTime + Math.max(0, delay);
      const safeDur = Math.max(0.02, dur);
      const cFreq = Math.max(20, Math.min(16000, carrier));

      const cOsc = this.ctx.createOscillator();
      const mOsc = this.ctx.createOscillator();
      const mGain = this.ctx.createGain();
      const env = this.ctx.createGain();

      cOsc.type = carrierType;
      mOsc.type = modType;
      cOsc.frequency.setValueAtTime(cFreq, t0);
      mOsc.frequency.setValueAtTime(Math.max(12, Math.min(18000, cFreq * ratio)), t0);
      if (endCarrier !== null) {
        const ec = Math.max(20, Math.min(16000, endCarrier));
        cOsc.frequency.exponentialRampToValueAtTime(ec, t0 + safeDur);
        mOsc.frequency.exponentialRampToValueAtTime(Math.max(12, Math.min(18000, ec * ratio)), t0 + safeDur);
      }

      mGain.gain.setValueAtTime(Math.max(0.1, modIndex), t0);
      mGain.gain.exponentialRampToValueAtTime(Math.max(0.05, modEnd), t0 + safeDur);

      const atk = Math.min(safeDur * 0.4, Math.max(0.0015, attack));
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + atk);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + safeDur);

      mOsc.connect(mGain);
      mGain.connect(cOsc.frequency);

      let head = cOsc;
      if (highpass) {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = highpass;
        cOsc.connect(hp);
        head = hp;
      }
      head.connect(env);
      this._connectOut(env, { pan, wet, bus });

      this._activeVoices++;
      cOsc.onended = () => {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
        try {
          mOsc.disconnect();
          mGain.disconnect();
          env.disconnect();
        } catch (_) {}
      };
      mOsc.start(t0);
      cOsc.start(t0);
      mOsc.stop(t0 + safeDur + 0.015);
      cOsc.stop(t0 + safeDur + 0.015);
    } catch (_) {
      this.stats.errors++;
    }
  }

  _noise(opts) {
    if (!this.ctx || this._activeVoices >= MAX_CONCURRENT_VOICES) return;
    try {
      const {
        source = 'pink',
        dur = 0.16,
        delay = 0,
        attack = 0.003,
        gain = 0.14,
        filterType = 'bandpass',
        freq = 900,
        endFreq = null,
        q = 1.2,
        playbackRate = 1.0,
        pan = 0,
        wet = 0.18,
        bus = 'sfx'
      } = opts;
      const buf = source === 'white'
        ? this.noiseBuffer
        : (source === 'crackle' ? this.crackleBuffer : this.pinkBuffer);
      if (!buf) return;
      const t0 = this.ctx.currentTime + Math.max(0, delay);
      const safeDur = Math.max(0.015, dur);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.25, Math.min(4.0, playbackRate));
      const maxOffset = Math.max(0, buf.duration - safeDur * src.playbackRate.value - 0.05);
      const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

      const flt = this.ctx.createBiquadFilter();
      flt.type = filterType;
      flt.frequency.setValueAtTime(Math.max(24, Math.min(18000, freq)), t0);
      if (endFreq !== null) {
        flt.frequency.exponentialRampToValueAtTime(Math.max(24, Math.min(18000, endFreq)), t0 + safeDur);
      }
      flt.Q.value = q;

      const env = this.ctx.createGain();
      const atk = Math.min(safeDur * 0.45, Math.max(0.0015, attack));
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + atk);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + safeDur);

      src.connect(flt);
      flt.connect(env);
      this._connectOut(env, { pan, wet, bus });

      this._activeVoices++;
      src.onended = () => {
        this._activeVoices = Math.max(0, this._activeVoices - 1);
        try { env.disconnect(); } catch (_) {}
      };
      src.start(t0, offset, safeDur + 0.02);
    } catch (_) {
      this.stats.errors++;
    }
  }

  // ==================== BIOME-ADAPTIVE DARK CATHEDRAL AMBIENCE ====================
  startAmbience() {
    if (!this.ctx || this._ambNodes) return;
    const prof = BIOME_AMBIENCE_PROFILES[this._currentBiomeId] || BIOME_AMBIENCE_PROFILES.sunken_cathedral;
    const now = this.ctx.currentTime;
    const oscs = [];

    prof.notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const flt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = idx === 0 ? 'sine' : (idx % 2 === 1 ? 'triangle' : 'sawtooth');
      osc.frequency.setValueAtTime(f, now);
      osc.detune.setValueAtTime((idx - 1.5) * 4.5, now);

      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(prof.filterFreq + idx * 38, now);
      flt.Q.value = 0.85;

      const targetG = [0.048, 0.032, 0.020, 0.013][idx] || 0.012;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(targetG, now + 2.4);

      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07 + idx * 0.031;
      lfoG.gain.value = 18 + idx * 9;
      lfo.connect(lfoG);
      lfoG.connect(flt.frequency);

      osc.connect(flt);
      flt.connect(g);
      if (panner) {
        panner.pan.value = (idx % 2 === 0 ? -1 : 1) * (0.14 + idx * 0.08);
        g.connect(panner);
        panner.connect(this.ambBus);
        panner.connect(this.convolver);
      } else {
        g.connect(this.ambBus);
        g.connect(this.convolver);
      }
      osc.start(now);
      lfo.start(now);
      oscs.push({ osc, flt, g, lfo });
    });

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.pinkBuffer;
    windSrc.loop = true;
    const windBp = this.ctx.createBiquadFilter();
    windBp.type = 'bandpass';
    windBp.frequency.setValueAtTime(prof.noiseFreq, now);
    windBp.Q.setValueAtTime(prof.noiseQ, now);
    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(prof.noiseGain, now);
    windSrc.connect(windBp);
    windBp.connect(windGain);
    windGain.connect(this.ambBus);
    windSrc.start(now);

    this._ambNodes = { oscs, windSrc, windBp, windGain };
  }

  setBiomeAmbience(biomeId, inCombat = false) {
    if (biomeId && BIOME_AMBIENCE_PROFILES[biomeId]) {
      this._currentBiomeId = biomeId;
    }
    this._inCombatAmb = !!inCombat;
    if (!this.ctx || !this._ambNodes) return;
    const prof = BIOME_AMBIENCE_PROFILES[this._currentBiomeId] || BIOME_AMBIENCE_PROFILES.sunken_cathedral;
    const now = this.ctx.currentTime;
    const combatLift = this._inCombatAmb ? 1.32 : 1.0;
    this._ambNodes.oscs.forEach((entry, idx) => {
      const targetF = prof.notes[idx] || prof.notes[0];
      entry.osc.frequency.setTargetAtTime(targetF, now, 0.85);
      entry.flt.frequency.setTargetAtTime((prof.filterFreq + idx * 42) * combatLift, now, 0.75);
    });
    this._ambNodes.windBp.frequency.setTargetAtTime(prof.noiseFreq * (this._inCombatAmb ? 1.15 : 1.0), now, 0.85);
    this._ambNodes.windBp.Q.setTargetAtTime(prof.noiseQ, now, 0.85);
    this._ambNodes.windGain.gain.setTargetAtTime(prof.noiseGain * (this._inCombatAmb ? 1.22 : 1.0), now, 0.85);
    this._applyGain(0.12);
  }

  // ==================== LUXURY DARK-FANTASY UI SUITE (16 UNIQUE CUES) ====================
  uiHover() {
    if (!this._ready('uiHover', 48)) return;
    const p = this._jitter(0.025);
    this._fm({ carrier: 1320 * p, ratio: 2.42, modIndex: 18, modEnd: 1, dur: 0.042, attack: 0.002, gain: 0.022, wet: 0.06, bus: 'ui', highpass: 600 });
  }

  uiClick() {
    if (!this._ready('uiClick', 28)) return;
    const p = this._jitter(0.02);
    this._fm({ carrier: 740 * p, endCarrier: 420 * p, ratio: 2.75, modIndex: 95, modEnd: 4, dur: 0.065, attack: 0.0015, gain: 0.075, wet: 0.08, bus: 'ui' });
    this._noise({ source: 'white', dur: 0.022, gain: 0.032, filterType: 'bandpass', freq: 2900, q: 2.4, wet: 0.04, bus: 'ui' });
  }

  uiTabSwitch() {
    if (!this._ready('uiTabSwitch', 35)) return;
    this._noise({ source: 'pink', dur: 0.075, attack: 0.006, gain: 0.045, filterType: 'bandpass', freq: 1450, endFreq: 2400, q: 1.5, wet: 0.08, bus: 'ui' });
    this._fm({ carrier: 587.33, ratio: 2.0, modIndex: 36, modEnd: 2, dur: 0.11, gain: 0.052, pan: -0.12, wet: 0.14, bus: 'ui' });
    this._fm({ carrier: 880.0, ratio: 2.0, modIndex: 28, modEnd: 2, dur: 0.14, delay: 0.028, gain: 0.048, pan: 0.12, wet: 0.16, bus: 'ui' });
  }

  uiDifficultySelect(diffId = 'standard') {
    if (!this._ready('uiDifficultySelect', 40)) return;
    if (diffId === 'pilgrim') {
      [523.25, 659.25, 783.99].forEach((f, i) => {
        this._fm({ carrier: f, ratio: 2.0, modIndex: 26, modEnd: 2, dur: 0.26, delay: i * 0.035, gain: 0.055, pan: (i - 1) * 0.16, wet: 0.24, bus: 'ui' });
      });
    } else if (diffId === 'bloodfire') {
      this._tone({ type: 'sawtooth', freq: 146.83, endFreq: 98.0, dur: 0.28, gain: 0.11, filterType: 'lowpass', filterFreq: 980, filterEnd: 260, wet: 0.22, bus: 'ui' });
      this._noise({ source: 'pink', dur: 0.22, gain: 0.085, filterType: 'bandpass', freq: 1200, endFreq: 420, q: 1.3, wet: 0.20, bus: 'ui' });
      this._fm({ carrier: 440, endCarrier: 587.33, ratio: 1.5, modIndex: 110, modEnd: 8, dur: 0.24, gain: 0.068, wet: 0.24, bus: 'ui' });
    } else if (diffId === 'abyssal') {
      this._tone({ type: 'sawtooth', freq: 73.42, endFreq: 48.99, dur: 0.42, gain: 0.14, filterType: 'lowpass', filterFreq: 460, filterEnd: 120, wet: 0.32, bus: 'ui' });
      this._fm({ carrier: 220, endCarrier: 207.65, ratio: 3.14, modIndex: 160, modEnd: 12, dur: 0.38, gain: 0.075, wet: 0.34, bus: 'ui' });
      this._noise({ source: 'crackle', dur: 0.28, gain: 0.06, filterType: 'bandpass', freq: 880, endFreq: 240, q: 1.8, wet: 0.26, bus: 'ui' });
    } else {
      this._fm({ carrier: 293.66, ratio: 2.76, modIndex: 85, modEnd: 6, dur: 0.24, gain: 0.075, wet: 0.22, bus: 'ui' });
      this._fm({ carrier: 440.0, ratio: 2.0, modIndex: 45, modEnd: 3, dur: 0.26, delay: 0.03, gain: 0.062, wet: 0.24, bus: 'ui' });
    }
  }

  uiEnterSanctum() {
    if (!this._ready('uiEnterSanctum', 80)) return;
    this._tone({ type: 'triangle', freq: 110, endFreq: 73.42, dur: 0.46, gain: 0.14, filterType: 'lowpass', filterFreq: 520, wet: 0.34, bus: 'ui' });
    [293.66, 440.0, 587.33, 659.25].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.76, modIndex: 75 - i * 12, modEnd: 3, dur: 0.52, delay: i * 0.045, gain: 0.065 / (1 + i * 0.22), pan: (i - 1.5) * 0.18, wet: 0.36, bus: 'ui' });
    });
    this._noise({ source: 'pink', dur: 0.32, attack: 0.03, gain: 0.055, filterType: 'bandpass', freq: 620, endFreq: 1350, q: 1.2, wet: 0.28, bus: 'ui' });
  }

  uiBack() {
    if (!this._ready('uiBack', 40)) return;
    this._fm({ carrier: 440, endCarrier: 293.66, ratio: 1.5, modIndex: 42, modEnd: 3, dur: 0.13, gain: 0.068, wet: 0.14, bus: 'ui' });
    this._noise({ source: 'pink', dur: 0.06, gain: 0.035, filterType: 'lowpass', freq: 900, endFreq: 320, wet: 0.08, bus: 'ui' });
  }

  uiHeroBrowse(categoryId = 'bastion') {
    if (!this._ready('uiHeroBrowse', 35)) return;
    const p = this._jitter(0.02);
    if (categoryId === 'bastion') {
      this._fm({ carrier: 523.25 * p, ratio: 2.76, modIndex: 115, modEnd: 5, dur: 0.16, gain: 0.072, wet: 0.18, bus: 'ui' });
      this._tone({ type: 'triangle', freq: 196 * p, endFreq: 130.8, dur: 0.12, gain: 0.065, wet: 0.10, bus: 'ui' });
    } else if (categoryId === 'phantom') {
      this._noise({ source: 'white', dur: 0.11, attack: 0.004, gain: 0.055, filterType: 'bandpass', freq: 3400, endFreq: 1200, q: 2.8, wet: 0.16, bus: 'ui' });
      this._fm({ carrier: 987.77 * p, endCarrier: 1318.5 * p, ratio: 1.41, modIndex: 55, modEnd: 3, dur: 0.12, gain: 0.048, wet: 0.18, bus: 'ui' });
    } else if (categoryId === 'arcana') {
      [659.25, 987.77].forEach((f, i) => {
        this._fm({ carrier: f * p, ratio: 3.0, modIndex: 48, modEnd: 3, dur: 0.20, delay: i * 0.03, gain: 0.050, pan: i === 0 ? -0.18 : 0.18, wet: 0.26, bus: 'ui' });
      });
    } else {
      this._fm({ carrier: 622.25 * p, endCarrier: 830.6 * p, ratio: 2.14, modIndex: 90, modEnd: 6, dur: 0.13, gain: 0.060, wet: 0.15, bus: 'ui' });
      this._fm({ carrier: 932.33 * p, ratio: 1.73, modIndex: 60, modEnd: 4, dur: 0.09, delay: 0.035, gain: 0.046, wet: 0.14, bus: 'ui' });
    }
  }

  uiRunStart() {
    if (!this._ready('uiRunStart', 120)) return;
    this._noise({ source: 'white', dur: 0.26, attack: 0.01, gain: 0.085, filterType: 'bandpass', freq: 1800, endFreq: 4800, q: 3.2, wet: 0.28, bus: 'ui' });
    this._fm({ carrier: 880, endCarrier: 1760, ratio: 2.76, modIndex: 130, modEnd: 8, dur: 0.28, gain: 0.065, wet: 0.30, bus: 'ui' });
    [146.83, 220.0, 293.66, 440.0].forEach((f, i) => {
      this._tone({ type: i < 2 ? 'sawtooth' : 'triangle', freq: f, endFreq: f * 1.005, dur: 0.68, delay: 0.04 + i * 0.025, attack: 0.035, gain: 0.085 / (1 + i * 0.25), filterType: 'lowpass', filterFreq: 950 + i * 280, pan: (i - 1.5) * 0.16, wet: 0.38, bus: 'ui' });
    });
  }

  uiPauseOpen() {
    if (!this._ready('uiPauseOpen', 50)) return;
    this._noise({ source: 'pink', dur: 0.18, attack: 0.015, gain: 0.055, filterType: 'lowpass', freq: 1600, endFreq: 320, wet: 0.22, bus: 'ui' });
    this._fm({ carrier: 587.33, endCarrier: 440.0, ratio: 2.76, modIndex: 52, modEnd: 3, dur: 0.22, gain: 0.065, wet: 0.24, bus: 'ui' });
  }

  uiPauseClose() {
    if (!this._ready('uiPauseClose', 50)) return;
    this._noise({ source: 'pink', dur: 0.14, attack: 0.008, gain: 0.048, filterType: 'bandpass', freq: 480, endFreq: 1500, q: 1.4, wet: 0.16, bus: 'ui' });
    this._fm({ carrier: 440.0, endCarrier: 659.25, ratio: 2.0, modIndex: 44, modEnd: 3, dur: 0.16, gain: 0.062, wet: 0.18, bus: 'ui' });
  }

  uiCompendiumOpen() {
    if (!this._ready('uiCompendiumOpen', 60)) return;
    this._tone({ type: 'triangle', freq: 135, endFreq: 68, dur: 0.12, gain: 0.095, wet: 0.12, bus: 'ui' });
    [0, 0.045, 0.085].forEach((d, i) => {
      this._noise({ source: 'pink', dur: 0.075, delay: d, attack: 0.005, gain: 0.055 - i * 0.01, filterType: 'bandpass', freq: 1600 + i * 420, endFreq: 2800, q: 1.6, pan: (i - 1) * 0.18, wet: 0.14, bus: 'ui' });
    });
    this._fm({ carrier: 659.25, ratio: 2.0, modIndex: 35, modEnd: 2, dur: 0.26, delay: 0.06, gain: 0.048, wet: 0.24, bus: 'ui' });
  }

  uiCompendiumClose() {
    if (!this._ready('uiCompendiumClose', 60)) return;
    this._noise({ source: 'pink', dur: 0.08, gain: 0.055, filterType: 'bandpass', freq: 2100, endFreq: 750, q: 1.4, wet: 0.10, bus: 'ui' });
    this._tone({ type: 'triangle', freq: 155, endFreq: 62, dur: 0.13, delay: 0.03, gain: 0.10, wet: 0.12, bus: 'ui' });
    this._fm({ carrier: 520, endCarrier: 340, ratio: 2.76, modIndex: 65, modEnd: 4, dur: 0.07, delay: 0.04, gain: 0.045, wet: 0.10, bus: 'ui' });
  }

  uiMapToggle(expanded = true) {
    if (!this._ready('uiMapToggle', 40)) return;
    this._noise({ source: 'pink', dur: 0.11, attack: 0.008, gain: 0.058, filterType: 'bandpass', freq: expanded ? 1100 : 2100, endFreq: expanded ? 2350 : 950, q: 1.5, wet: 0.10, bus: 'ui' });
    this._tone({ type: 'sine', freq: expanded ? 523.25 : 659.25, endFreq: expanded ? 698.46 : 493.88, dur: 0.09, gain: 0.040, wet: 0.12, bus: 'ui' });
  }

  uiSettingTick(up = true) {
    if (!this._ready('uiSettingTick', 32)) return;
    const f = up ? 880 : 698.46;
    this._fm({ carrier: f * this._jitter(0.018), ratio: 2.41, modIndex: 48, modEnd: 2, dur: 0.055, gain: 0.052, wet: 0.08, bus: 'ui' });
  }

  uiPinTarget(pinned = true) {
    if (!this._ready('uiPinTarget', 40)) return;
    if (pinned) {
      this._fm({ carrier: 1046.5, ratio: 2.0, modIndex: 70, modEnd: 4, dur: 0.075, gain: 0.068, wet: 0.14, bus: 'ui' });
      this._fm({ carrier: 1567.98, ratio: 2.0, modIndex: 55, modEnd: 3, dur: 0.11, delay: 0.042, gain: 0.062, wet: 0.18, bus: 'ui' });
    } else {
      this._fm({ carrier: 1174.66, endCarrier: 698.46, ratio: 1.5, modIndex: 40, modEnd: 2, dur: 0.10, gain: 0.052, wet: 0.12, bus: 'ui' });
    }
  }

  uiToggle(opening = true) {
    if (!this._ready('uiToggle', 35)) return;
    const f0 = opening ? 392.0 : 523.25;
    const f1 = opening ? 587.33 : 349.23;
    this._fm({ carrier: f0, endCarrier: f1, ratio: 2.0, modIndex: 46, modEnd: 3, dur: 0.11, gain: 0.065, wet: 0.15, bus: 'ui' });
    this._noise({ source: 'pink', dur: 0.055, gain: 0.028, filterType: 'bandpass', freq: opening ? 1400 : 950, q: 1.6, wet: 0.08, bus: 'ui' });
  }

  uiReject() {
    if (!this._ready('uiReject', 90)) return;
    [0, 0.068].forEach((d, idx) => {
      this._fm({ carrier: idx === 0 ? 196 : 155.56, endCarrier: 98, ratio: 2.35, modIndex: 85, modEnd: 8, dur: 0.075, delay: d, gain: 0.082, wet: 0.10, bus: 'ui' });
    });
  }

  // ==================== MOVEMENT, FOOTSTEPS & WEAPON HANDLING ====================
  footstep(biomeId = 'sunken_cathedral', pos = null) {
    if (!this._ready('footstep', 195, false)) return;
    const { pan, att } = this._spatial(pos);
    this._stepToggle = 1 - this._stepToggle;
    const alt = this._stepToggle ? 1.07 : 0.94;
    const p = this._jitter(0.04) * alt;

    if (biomeId === 'sunken_cathedral') {
      this._tone({ type: 'sine', freq: 118 * p, endFreq: 52, dur: 0.065, gain: 0.040 * att, pan, wet: 0.22 });
      this._noise({ source: 'white', dur: 0.055, gain: 0.026 * att, filterType: 'bandpass', freq: 2100 * p, endFreq: 950, q: 2.2, pan, wet: 0.26 });
    } else if (biomeId === 'withered_roothollow') {
      this._tone({ type: 'triangle', freq: 145 * p, endFreq: 64, dur: 0.06, gain: 0.044 * att, pan, wet: 0.14 });
      this._noise({ source: 'crackle', dur: 0.05, gain: 0.028 * att, filterType: 'bandpass', freq: 1250 * p, q: 1.8, pan, wet: 0.14 });
    } else if (biomeId === 'ossuary_catacomb') {
      this._fm({ carrier: 420 * p, endCarrier: 190, ratio: 2.35, modIndex: 38, modEnd: 3, dur: 0.048, gain: 0.032 * att, pan, wet: 0.20 });
      this._noise({ source: 'white', dur: 0.038, gain: 0.022 * att, filterType: 'bandpass', freq: 2600 * p, q: 2.5, pan, wet: 0.18 });
    } else if (biomeId === 'ashen_foundry') {
      this._fm({ carrier: 310 * p, endCarrier: 145, ratio: 2.76, modIndex: 55, modEnd: 4, dur: 0.058, gain: 0.036 * att, pan, wet: 0.22 });
      this._noise({ source: 'pink', dur: 0.045, gain: 0.026 * att, filterType: 'bandpass', freq: 920 * p, q: 1.5, pan, wet: 0.16 });
    } else if (biomeId === 'astral_rift') {
      this._fm({ carrier: 680 * p, endCarrier: 420, ratio: 2.0, modIndex: 25, modEnd: 2, dur: 0.065, gain: 0.028 * att, pan, wet: 0.30 });
      this._tone({ type: 'sine', freq: 135 * p, endFreq: 58, dur: 0.055, gain: 0.032 * att, pan, wet: 0.18 });
    } else {
      this._tone({ type: 'triangle', freq: 132 * p, endFreq: 54, dur: 0.058, gain: 0.042 * att, pan, wet: 0.18 });
      this._noise({ source: 'pink', dur: 0.042, gain: 0.025 * att, filterType: 'bandpass', freq: 1550 * p, q: 1.8, pan, wet: 0.16 });
    }
  }

  dash(classId = null, pos = null) {
    if (!this._ready('dash', 45, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.035);
    this._noise({ source: 'pink', dur: 0.17, attack: 0.006, gain: 0.19 * att, filterType: 'bandpass', freq: 340 * p, endFreq: 1850 * p, q: 1.5, pan, wet: 0.24 });
    this._tone({ type: 'sine', freq: 165 * p, endFreq: 68, dur: 0.13, gain: 0.13 * att, pan, wet: 0.14 });

    if (classId === 'wraith_assassin') {
      this._fm({ carrier: 1240 * p, endCarrier: 580, ratio: 1.41, modIndex: 90, modEnd: 5, dur: 0.13, gain: 0.065 * att, pan, wet: 0.26 });
    } else if (classId === 'storm_invoker') {
      this._noise({ source: 'crackle', dur: 0.14, gain: 0.095 * att, filterType: 'highpass', freq: 2200, q: 1.4, pan, wet: 0.24 });
    } else if (classId === 'iron_juggernaut' || classId === 'brass_artificer') {
      this._noise({ source: 'white', dur: 0.13, gain: 0.085 * att, filterType: 'bandpass', freq: 2600, endFreq: 780, q: 2.0, pan, wet: 0.18 });
    } else if (classId === 'abyssal_ooze') {
      this._tone({ type: 'sine', freq: 220 * p, midFreq: 460 * p, midAt: 0.35, endFreq: 150, dur: 0.16, gain: 0.095 * att, pan, wet: 0.20 });
    } else {
      this._fm({ carrier: 660 * p, endCarrier: 990 * p, ratio: 2.0, modIndex: 32, modEnd: 2, dur: 0.13, gain: 0.048 * att, pan, wet: 0.26 });
    }
  }

  weaponSwap(weaponInst = null) {
    if (!this._ready('weaponSwap', 55, false)) return;
    const def = weaponInst && weaponInst.def ? weaponInst.def : null;
    const sub = def ? def.subClass : 'cleave';
    const cat = def ? def.category : 'melee';
    const p = this._jitter(0.025);

    if (cat === 'melee') {
      if (sub === 'heavy' || sub === 'halberd') {
        this._tone({ type: 'triangle', freq: 155 * p, endFreq: 58, dur: 0.16, gain: 0.14, wet: 0.18 });
        this._fm({ carrier: 380 * p, endCarrier: 520 * p, ratio: 2.76, modIndex: 95, modEnd: 6, dur: 0.18, gain: 0.078, wet: 0.22 });
      } else if (sub === 'whip') {
        [0, 0.032, 0.065].forEach((d, i) => {
          this._fm({ carrier: (980 + i * 210) * p, ratio: 2.41, modIndex: 110, modEnd: 8, dur: 0.065, delay: d, gain: 0.060, wet: 0.16 });
        });
      } else {
        this._noise({ source: 'white', dur: 0.13, attack: 0.004, gain: 0.072, filterType: 'bandpass', freq: 2400, endFreq: 5200, q: 3.4, wet: 0.22 });
        this._fm({ carrier: 780 * p, endCarrier: 1360 * p, ratio: 2.76, modIndex: 85, modEnd: 4, dur: 0.15, gain: 0.068, wet: 0.24 });
      }
    } else if (sub === 'cannon' || sub === 'shotgun' || sub === 'bfg') {
      this._fm({ carrier: 290 * p, endCarrier: 180, ratio: 2.35, modIndex: 120, modEnd: 8, dur: 0.085, gain: 0.092, wet: 0.12 });
      this._fm({ carrier: 540 * p, endCarrier: 390, ratio: 2.76, modIndex: 95, modEnd: 6, dur: 0.095, delay: 0.055, gain: 0.082, wet: 0.14 });
    } else if (sub === 'orb' || sub === 'grimoire' || sub === 'beam' || sub === 'swords') {
      this._fm({ carrier: 523.25 * p, endCarrier: 783.99 * p, ratio: 3.0, modIndex: 52, modEnd: 3, dur: 0.18, gain: 0.068, wet: 0.28 });
      this._noise({ source: 'pink', dur: 0.12, gain: 0.045, filterType: 'bandpass', freq: 1400, endFreq: 2600, q: 1.8, wet: 0.22 });
    } else {
      this._fm({ carrier: 640 * p, endCarrier: 420, ratio: 2.15, modIndex: 90, modEnd: 5, dur: 0.08, gain: 0.075, wet: 0.12 });
      this._tone({ type: 'triangle', freq: 920 * p, endFreq: 1220 * p, dur: 0.07, delay: 0.04, gain: 0.052, wet: 0.14 });
    }
  }

  // ==================== ALL 7 MELEE WEAPONS: UNIQUE PRIMARY SWINGS ====================
  meleeSwing(weaponId = 'greatsword', step = 0, isFinisher = false, pos = null) {
    if (!this._ready(`melee_${weaponId}`, 32, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.035) * (1 + step * 0.045);
    const finBoost = isFinisher ? 1.28 : 1.0;

    switch (weaponId) {
      case 'twinblades': {
        this._noise({ source: 'white', dur: isFinisher ? 0.17 : 0.11, attack: 0.003, gain: 0.14 * finBoost * att, filterType: 'bandpass', freq: 3200 * p, endFreq: 1150, q: 2.6, pan, wet: 0.18 });
        this._fm({ carrier: (isFinisher ? 1480 : 1180) * p, endCarrier: 640, ratio: 2.41, modIndex: 95, modEnd: 4, dur: 0.12, gain: 0.072 * finBoost * att, pan, wet: 0.22 });
        if (isFinisher) {
          this._fm({ carrier: 1760 * p, endCarrier: 880, ratio: 3.0, modIndex: 80, modEnd: 3, dur: 0.14, delay: 0.045, gain: 0.068 * att, pan: -pan, wet: 0.26 });
        }
        break;
      }
      case 'warhammer': {
        this._noise({ source: 'pink', dur: isFinisher ? 0.28 : 0.21, attack: 0.012, gain: 0.22 * finBoost * att, filterType: 'lowpass', freq: 620 * p, endFreq: 140, q: 1.3, pan, wet: 0.24 });
        this._tone({ type: 'triangle', freq: (isFinisher ? 130 : 155) * p, endFreq: 42, dur: isFinisher ? 0.26 : 0.19, gain: 0.20 * finBoost * att, pan, wet: 0.18 });
        this._fm({ carrier: 240 * p, endCarrier: 120, ratio: 2.76, modIndex: 85, modEnd: 8, dur: 0.18, gain: 0.075 * att, pan, wet: 0.22 });
        break;
      }
      case 'chainwhip': {
        [0, 0.026].forEach((d, idx) => {
          this._fm({ carrier: (1120 + idx * 310) * p, ratio: 2.76, modIndex: 140, modEnd: 10, dur: 0.065, delay: d, gain: 0.065 * att, pan, wet: 0.16 });
        });
        this._noise({ source: 'white', dur: 0.13, delay: 0.035, attack: 0.002, gain: 0.18 * finBoost * att, filterType: 'bandpass', freq: 950, endFreq: 3800 * p, q: 2.2, pan, wet: 0.22 });
        if (isFinisher) {
          this._noise({ source: 'white', dur: 0.065, delay: 0.08, attack: 0.0015, gain: 0.20 * att, filterType: 'highpass', freq: 2400, q: 1.6, pan, wet: 0.26 });
        }
        break;
      }
      case 'bloodscythe': {
        this._noise({ source: 'pink', dur: isFinisher ? 0.25 : 0.19, attack: 0.01, gain: 0.19 * finBoost * att, filterType: 'bandpass', freq: 860 * p, endFreq: 240, q: 2.0, pan, wet: 0.26 });
        this._fm({ carrier: (isFinisher ? 620 : 510) * p, endCarrier: 220, ratio: 1.5, modIndex: 110, modEnd: 6, dur: 0.21, gain: 0.088 * finBoost * att, pan, wet: 0.28 });
        break;
      }
      case 'eclipseblade': {
        this._noise({ source: 'white', dur: 0.12, attack: 0.002, gain: 0.13 * finBoost * att, filterType: 'bandpass', freq: 4200 * p, endFreq: 1400, q: 3.6, pan, wet: 0.22 });
        this._fm({ carrier: 1320 * p, endCarrier: 440, ratio: 2.76, modIndex: 120, modEnd: 4, dur: 0.16, gain: 0.085 * finBoost * att, pan, wet: 0.28 });
        this._tone({ type: 'sine', freq: 148 * p, endFreq: 52, dur: 0.16, gain: 0.13 * finBoost * att, pan, wet: 0.20 });
        break;
      }
      case 'mjolnir': {
        this._noise({ source: 'pink', dur: 0.22, attack: 0.008, gain: 0.20 * finBoost * att, filterType: 'bandpass', freq: 740 * p, endFreq: 210, q: 1.5, pan, wet: 0.24 });
        this._fm({ carrier: 330 * p, endCarrier: 165, ratio: 2.76, modIndex: 130, modEnd: 8, dur: 0.20, gain: 0.095 * finBoost * att, pan, wet: 0.24 });
        this._noise({ source: 'crackle', dur: 0.14, delay: 0.02, gain: 0.11 * finBoost * att, filterType: 'highpass', freq: 2100, q: 1.5, pan, wet: 0.22 });
        break;
      }
      case 'greatsword':
      default: {
        this._noise({ source: 'pink', dur: isFinisher ? 0.24 : 0.18, attack: 0.008, gain: 0.19 * finBoost * att, filterType: 'bandpass', freq: (isFinisher ? 920 : 1080) * p, endFreq: 230, q: 1.7, pan, wet: 0.22 });
        this._fm({ carrier: (isFinisher ? 540 : 680) * p, endCarrier: 260, ratio: 2.76, modIndex: 78, modEnd: 4, dur: 0.17, gain: 0.068 * finBoost * att, pan, wet: 0.22 });
        if (isFinisher) {
          this._noise({ source: 'crackle', dur: 0.19, gain: 0.09 * att, filterType: 'bandpass', freq: 1450, endFreq: 520, q: 1.4, pan, wet: 0.24 });
        }
        break;
      }
    }
  }

  meleeFinisherWave(weaponId = 'greatsword', pos = null) {
    if (!this._ready('meleeFinisherWave', 60, false)) return;
    const { pan, att } = this._spatial(pos);
    if (weaponId === 'warhammer' || weaponId === 'mjolnir') {
      this._tone({ type: 'sawtooth', freq: 118, endFreq: 30, dur: 0.34, gain: 0.26 * att, filterType: 'lowpass', filterFreq: 420, filterEnd: 95, pan, wet: 0.28 });
      this._noise({ source: 'crackle', dur: 0.26, gain: 0.18 * att, filterType: 'bandpass', freq: 1350, endFreq: 280, q: 1.3, pan, wet: 0.26 });
    } else {
      this._noise({ source: 'pink', dur: 0.20, gain: 0.14 * att, filterType: 'bandpass', freq: 980, endFreq: 280, q: 1.5, pan, wet: 0.24 });
    }
  }

  swing(combo = 0) {
    this.meleeSwing('greatsword', combo, combo === 2, null);
  }

  // ==================== ALL 13 RANGED WEAPONS: UNIQUE PRIMARY SHOTS ====================
  rangedShot(style = 'crossbow', opts = {}) {
    const minGap = style === 'prismbeam' ? 42 : 34;
    if (!this._ready(`ranged_${style}`, minGap, false)) return;
    const { pan, att } = this._spatial(opts.pos || null);
    const p = this._jitter(0.03);

    switch (style) {
      case 'crossbow': {
        const emp = !!opts.empowered;
        this._fm({ carrier: (emp ? 1180 : 920) * p, endCarrier: 270, ratio: 2.15, modIndex: 115, modEnd: 5, dur: 0.085, attack: 0.0015, gain: (emp ? 0.15 : 0.12) * att, pan, wet: 0.14 });
        this._noise({ source: 'white', dur: 0.065, gain: 0.085 * att, filterType: 'bandpass', freq: 2800 * p, endFreq: 950, q: 2.1, pan, wet: 0.12 });
        if (emp) {
          this._fm({ carrier: 1567.98 * p, ratio: 2.0, modIndex: 65, modEnd: 3, dur: 0.20, gain: 0.085 * att, pan, wet: 0.28 });
        }
        break;
      }
      case 'chakram': {
        this._fm({ carrier: 780 * p, endCarrier: 1180 * p, ratio: 2.76, modIndex: 120, modEnd: 8, dur: 0.16, gain: 0.095 * att, pan, wet: 0.24 });
        this._noise({ source: 'pink', dur: 0.14, gain: 0.09 * att, filterType: 'bandpass', freq: 1650 * p, endFreq: 780, q: 2.0, pan, wet: 0.20 });
        break;
      }
      case 'plagueflask': {
        this._tone({ type: 'sine', freq: 290 * p, midFreq: 640 * p, midAt: 0.28, endFreq: 210, dur: 0.095, gain: 0.11 * att, pan, wet: 0.14 });
        this._noise({ source: 'crackle', dur: 0.12, delay: 0.02, gain: 0.075 * att, filterType: 'bandpass', freq: 1450, endFreq: 720, q: 2.2, pan, wet: 0.18 });
        break;
      }
      case 'scattergun': {
        this._tone({ type: 'sawtooth', freq: 185 * p, endFreq: 36, dur: 0.22, attack: 0.002, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 1450, filterEnd: 180, pan, wet: 0.20 });
        this._noise({ source: 'white', dur: 0.19, attack: 0.002, gain: 0.24 * att, filterType: 'lowpass', freq: 3400, endFreq: 340, q: 1.0, pan, wet: 0.22 });
        this._fm({ carrier: 1380 * p, endCarrier: 820, ratio: 2.76, modIndex: 85, modEnd: 4, dur: 0.09, delay: 0.11, gain: 0.048 * att, pan: pan + 0.12, wet: 0.14 });
        break;
      }
      case 'voidstaff': {
        this._fm({ carrier: 220 * p, endCarrier: 110, ratio: 1.5, modIndex: 135, modEnd: 8, dur: 0.24, gain: 0.13 * att, pan, wet: 0.32 });
        this._tone({ type: 'sine', freq: 587.33 * p, endFreq: 392.0, dur: 0.22, gain: 0.075 * att, pan, wet: 0.34 });
        break;
      }
      case 'prismbeam': {
        const heat = Math.max(0, Math.min(1, opts.heat || 0));
        const baseF = (740 + heat * 480) * p;
        this._fm({ carrier: baseF, endCarrier: baseF * 1.32, ratio: 2.0, modIndex: 55 + heat * 65, modEnd: 6, dur: 0.11, attack: 0.002, gain: 0.088 * att, pan, wet: 0.22 });
        this._tone({ type: 'triangle', freq: baseF * 0.5, endFreq: baseF * 0.66, dur: 0.10, gain: 0.055 * att, pan, wet: 0.18 });
        break;
      }
      case 'buzzsaw': {
        this._fm({ carrier: 480 * p, endCarrier: 960 * p, ratio: 3.14, modIndex: 165, modEnd: 18, dur: 0.16, gain: 0.105 * att, pan, wet: 0.18 });
        this._noise({ source: 'white', dur: 0.12, gain: 0.075 * att, filterType: 'bandpass', freq: 3100 * p, endFreq: 1800, q: 2.8, pan, wet: 0.14 });
        break;
      }
      case 'handcannon': {
        this._tone({ type: 'sawtooth', freq: 142 * p, endFreq: 29, dur: 0.28, attack: 0.002, gain: 0.31 * att, filterType: 'lowpass', filterFreq: 980, filterEnd: 130, pan, wet: 0.24 });
        this._noise({ source: 'pink', dur: 0.24, attack: 0.002, gain: 0.25 * att, filterType: 'lowpass', freq: 1900, endFreq: 210, pan, wet: 0.24 });
        this._fm({ carrier: 260 * p, endCarrier: 145, ratio: 2.76, modIndex: 110, modEnd: 8, dur: 0.16, gain: 0.085 * att, pan, wet: 0.20 });
        break;
      }
      case 'autoturret': {
        const emp = !!opts.empowered;
        this._fm({ carrier: (emp ? 1320 : 1020) * p, endCarrier: 380, ratio: 2.41, modIndex: 120, modEnd: 6, dur: 0.095, gain: 0.092 * att, pan, wet: 0.16 });
        this._noise({ source: 'crackle', dur: 0.08, gain: (emp ? 0.10 : 0.065) * att, filterType: 'highpass', freq: 2400, q: 1.6, pan, wet: 0.18 });
        break;
      }
      case 'flyingdaggers': {
        [1318.51, 1760.0].forEach((f, idx) => {
          this._fm({ carrier: f * p, endCarrier: f * 0.78, ratio: 2.76, modIndex: 68, modEnd: 3, dur: 0.15, delay: idx * 0.024, gain: (0.072 / (idx + 1)) * att, pan: pan + (idx === 0 ? -0.1 : 0.1), wet: 0.28 });
        });
        this._noise({ source: 'white', dur: 0.085, gain: 0.052 * att, filterType: 'bandpass', freq: 4200, endFreq: 2100, q: 3.2, pan, wet: 0.20 });
        break;
      }
      case 'starfallbow': {
        this._fm({ carrier: 587.33 * p, endCarrier: 293.66, ratio: 2.0, modIndex: 75, modEnd: 4, dur: 0.16, gain: 0.095 * att, pan, wet: 0.28 });
        this._fm({ carrier: 1760 * p, endCarrier: 1174.66, ratio: 3.0, modIndex: 52, modEnd: 2, dur: 0.21, delay: 0.015, gain: 0.072 * att, pan, wet: 0.34 });
        this._noise({ source: 'white', dur: 0.11, gain: 0.060 * att, filterType: 'bandpass', freq: 3600, endFreq: 1400, q: 2.4, pan, wet: 0.24 });
        break;
      }
      case 'soulgrimoire': {
        this._noise({ source: 'pink', dur: 0.09, gain: 0.060 * att, filterType: 'bandpass', freq: 1750, endFreq: 680, q: 1.8, pan, wet: 0.24 });
        [311.13, 466.16].forEach((f, idx) => {
          this._fm({ carrier: f * p, endCarrier: f * 0.74, ratio: 1.5, modIndex: 64, modEnd: 4, dur: 0.21, delay: idx * 0.02, gain: 0.070 * att, pan, wet: 0.32 });
        });
        break;
      }
      case 'sunforgecannon': {
        this._tone({ type: 'sawtooth', freq: 112 * p, endFreq: 26, dur: 0.36, attack: 0.004, gain: 0.32 * att, filterType: 'lowpass', filterFreq: 1100, filterEnd: 110, pan, wet: 0.28 });
        this._fm({ carrier: 330 * p, endCarrier: 110, ratio: 1.5, modIndex: 210, modEnd: 12, dur: 0.32, gain: 0.13 * att, pan, wet: 0.28 });
        this._noise({ source: 'crackle', dur: 0.28, gain: 0.18 * att, filterType: 'bandpass', freq: 1250, endFreq: 280, q: 1.2, pan, wet: 0.26 });
        break;
      }
      default: {
        this._fm({ carrier: 880 * p, endCarrier: 280, ratio: 2.0, modIndex: 85, modEnd: 4, dur: 0.09, gain: 0.11 * att, pan, wet: 0.14 });
        break;
      }
    }
  }

  boomerangCatch(pos = null) {
    if (!this._ready('boomerangCatch', 60, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 1046.5 * this._jitter(0.025), endCarrier: 1396.9, ratio: 2.76, modIndex: 70, modEnd: 3, dur: 0.10, gain: 0.072 * att, pan, wet: 0.18 });
  }

  ricochetSpark(pos = null) {
    if (!this._ready('ricochetSpark', 42, false)) return;
    const { pan, att } = this._spatial(pos);
    const f = 1480 * this._jitter(0.08);
    this._fm({ carrier: f, endCarrier: f * 1.45, ratio: 2.76, modIndex: 115, modEnd: 5, dur: 0.085, gain: 0.078 * att, pan, wet: 0.20 });
  }

  cannonExplosion(pos = null) {
    if (!this._ready('cannonExplosion', 48, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.04);
    this._tone({ type: 'sawtooth', freq: 108 * p, endFreq: 26, dur: 0.32, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 680, filterEnd: 95, pan, wet: 0.28 });
    this._noise({ source: 'pink', dur: 0.28, gain: 0.22 * att, filterType: 'lowpass', freq: 1450, endFreq: 180, pan, wet: 0.26 });
    this._noise({ source: 'crackle', dur: 0.20, delay: 0.03, gain: 0.11 * att, filterType: 'bandpass', freq: 1600, endFreq: 480, q: 1.4, pan, wet: 0.22 });
  }

  acidShatter(pos = null) {
    if (!this._ready('acidShatter', 52, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.05);
    [1950, 2680, 3420].forEach((f, idx) => {
      this._fm({ carrier: f * p, endCarrier: f * 0.65, ratio: 2.41, modIndex: 110, modEnd: 4, dur: 0.085, delay: idx * 0.014, gain: 0.058 * att, pan, wet: 0.18 });
    });
    this._noise({ source: 'crackle', dur: 0.24, delay: 0.02, gain: 0.13 * att, filterType: 'bandpass', freq: 2200, endFreq: 780, q: 1.9, pan, wet: 0.22 });
  }

  // ==================== ALL 20 WEAPON ACTIVE SKILLS (ZERO REUSE!) ====================
  weaponSkill(weaponId = 'greatsword', pos = null) {
    if (!this._ready(`wskill_${weaponId}`, 75, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.025);

    switch (weaponId) {
      case 'greatsword': {
        this._noise({ source: 'pink', dur: 0.34, attack: 0.015, gain: 0.24 * att, filterType: 'bandpass', freq: 1200 * p, endFreq: 260, q: 1.4, pan, wet: 0.28 });
        this._fm({ carrier: 440 * p, endCarrier: 196, ratio: 1.5, modIndex: 145, modEnd: 8, dur: 0.32, gain: 0.13 * att, pan, wet: 0.30 });
        this._noise({ source: 'crackle', dur: 0.28, delay: 0.03, gain: 0.14 * att, filterType: 'bandpass', freq: 1850, endFreq: 620, q: 1.6, pan, wet: 0.24 });
        break;
      }
      case 'crossbow': {
        [0, 0.028, 0.056, 0.084, 0.112].forEach((d, i) => {
          this._fm({ carrier: (860 + i * 95) * p, endCarrier: 310, ratio: 2.15, modIndex: 95, modEnd: 4, dur: 0.075, delay: d, gain: 0.085 * att, pan: pan + (i - 2) * 0.09, wet: 0.18 });
        });
        this._noise({ source: 'white', dur: 0.18, gain: 0.11 * att, filterType: 'bandpass', freq: 3100, endFreq: 1100, q: 2.0, pan, wet: 0.20 });
        break;
      }
      case 'twinblades': {
        this._noise({ source: 'white', dur: 0.24, attack: 0.004, gain: 0.18 * att, filterType: 'bandpass', freq: 3800 * p, endFreq: 1200, q: 2.4, pan, wet: 0.28 });
        [1174.66, 1567.98, 2093.0].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 0.68, ratio: 2.41, modIndex: 110, modEnd: 4, dur: 0.18, delay: i * 0.032, gain: 0.078 * att, pan: pan + (i - 1) * 0.15, wet: 0.32 });
        });
        break;
      }
      case 'chakram': {
        [587.33, 880.0, 1174.66].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 1.25, ratio: 2.76, modIndex: 125, modEnd: 8, dur: 0.28, delay: i * 0.03, gain: 0.085 * att, pan: pan + (i - 1) * 0.18, wet: 0.30 });
        });
        this._noise({ source: 'pink', dur: 0.24, gain: 0.11 * att, filterType: 'bandpass', freq: 1900, endFreq: 850, q: 2.2, pan, wet: 0.24 });
        break;
      }
      case 'plagueflask': {
        [0, 0.045, 0.09].forEach((d, i) => {
          this._tone({ type: 'sine', freq: (280 + i * 70) * p, midFreq: 680, midAt: 0.3, endFreq: 190, dur: 0.11, delay: d, gain: 0.095 * att, pan, wet: 0.18 });
        });
        this._noise({ source: 'crackle', dur: 0.30, delay: 0.05, gain: 0.16 * att, filterType: 'bandpass', freq: 1650, endFreq: 540, q: 2.1, pan, wet: 0.26 });
        break;
      }
      case 'warhammer': {
        this._tone({ type: 'sawtooth', freq: 132 * p, endFreq: 28, dur: 0.42, gain: 0.32 * att, filterType: 'lowpass', filterFreq: 680, filterEnd: 85, pan, wet: 0.32 });
        this._fm({ carrier: 293.66 * p, endCarrier: 110, ratio: 2.76, modIndex: 175, modEnd: 10, dur: 0.34, gain: 0.12 * att, pan, wet: 0.28 });
        this._noise({ source: 'crackle', dur: 0.34, gain: 0.20 * att, filterType: 'bandpass', freq: 1450, endFreq: 260, q: 1.3, pan, wet: 0.28 });
        break;
      }
      case 'scattergun': {
        this._tone({ type: 'sawtooth', freq: 168 * p, endFreq: 32, dur: 0.30, gain: 0.32 * att, filterType: 'lowpass', filterFreq: 1800, filterEnd: 160, pan, wet: 0.24 });
        this._noise({ source: 'white', dur: 0.25, gain: 0.26 * att, filterType: 'bandpass', freq: 2600, endFreq: 420, q: 1.1, pan, wet: 0.24 });
        [0.05, 0.09, 0.13].forEach((d, i) => {
          this._fm({ carrier: (1250 + i * 260) * p, ratio: 2.76, modIndex: 110, modEnd: 6, dur: 0.11, delay: d, gain: 0.068 * att, pan: pan + (i - 1) * 0.18, wet: 0.22 });
        });
        break;
      }
      case 'voidstaff': {
        this._tone({ type: 'sine', freq: 196 * p, endFreq: 38, dur: 0.48, attack: 0.02, gain: 0.26 * att, pan, wet: 0.36 });
        this._fm({ carrier: 440 * p, endCarrier: 130.81, ratio: 1.41, modIndex: 220, modEnd: 14, dur: 0.46, gain: 0.12 * att, pan, wet: 0.38 });
        this._noise({ source: 'pink', dur: 0.38, attack: 0.04, gain: 0.13 * att, filterType: 'bandpass', freq: 920, endFreq: 190, q: 2.4, pan, wet: 0.32 });
        break;
      }
      case 'chainwhip': {
        [0, 0.025, 0.05, 0.075].forEach((d, i) => {
          this._fm({ carrier: (960 + i * 190) * p, ratio: 2.76, modIndex: 150, modEnd: 10, dur: 0.07, delay: d, gain: 0.075 * att, pan, wet: 0.18 });
        });
        this._noise({ source: 'white', dur: 0.12, delay: 0.08, attack: 0.002, gain: 0.22 * att, filterType: 'highpass', freq: 1850, q: 1.8, pan, wet: 0.26 });
        this._tone({ type: 'sawtooth', freq: 180 * p, endFreq: 54, dur: 0.22, delay: 0.09, gain: 0.18 * att, filterType: 'lowpass', filterFreq: 720, pan, wet: 0.20 });
        break;
      }
      case 'prismbeam': {
        [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 1.18, ratio: 2.0, modIndex: 85, modEnd: 5, dur: 0.32, delay: i * 0.016, gain: 0.062 * att, pan: (i - 2.5) * 0.14, wet: 0.34 });
        });
        this._noise({ source: 'white', dur: 0.26, gain: 0.11 * att, filterType: 'bandpass', freq: 3400, endFreq: 1400, q: 2.0, pan, wet: 0.28 });
        break;
      }
      case 'buzzsaw': {
        this._fm({ carrier: 320 * p, endCarrier: 1080 * p, ratio: 3.14, modIndex: 185, modEnd: 24, dur: 0.30, gain: 0.12 * att, pan, wet: 0.22 });
        [0, 0.05, 0.10].forEach((d, i) => {
          this._fm({ carrier: (680 + i * 160) * p, ratio: 2.35, modIndex: 95, modEnd: 8, dur: 0.09, delay: d, gain: 0.068 * att, pan: (i - 1) * 0.16, wet: 0.18 });
        });
        break;
      }
      case 'handcannon': {
        this._tone({ type: 'sawtooth', freq: 125 * p, endFreq: 25, dur: 0.40, gain: 0.34 * att, filterType: 'lowpass', filterFreq: 1150, filterEnd: 95, pan, wet: 0.28 });
        this._noise({ source: 'pink', dur: 0.38, attack: 0.01, gain: 0.26 * att, filterType: 'bandpass', freq: 950, endFreq: 220, q: 1.1, pan, wet: 0.28 });
        this._noise({ source: 'crackle', dur: 0.32, delay: 0.04, gain: 0.16 * att, filterType: 'bandpass', freq: 1800, endFreq: 480, q: 1.5, pan, wet: 0.24 });
        break;
      }
      case 'bloodscythe': {
        this._noise({ source: 'pink', dur: 0.34, attack: 0.015, gain: 0.22 * att, filterType: 'bandpass', freq: 1150 * p, endFreq: 220, q: 1.9, pan, wet: 0.30 });
        this._fm({ carrier: 523.25 * p, endCarrier: 174.61, ratio: 1.5, modIndex: 155, modEnd: 10, dur: 0.34, gain: 0.12 * att, pan, wet: 0.32 });
        this._tone({ type: 'sine', freq: 293.66, endFreq: 587.33, dur: 0.26, delay: 0.08, gain: 0.068 * att, pan, wet: 0.30 });
        break;
      }
      case 'autoturret': {
        this._tone({ type: 'triangle', freq: 195 * p, endFreq: 68, dur: 0.16, gain: 0.18 * att, pan, wet: 0.16 });
        this._fm({ carrier: 420 * p, endCarrier: 1260 * p, ratio: 2.41, modIndex: 110, modEnd: 12, dur: 0.26, delay: 0.04, gain: 0.095 * att, pan, wet: 0.24 });
        this._noise({ source: 'crackle', dur: 0.18, delay: 0.08, gain: 0.095 * att, filterType: 'highpass', freq: 2200, q: 1.5, pan, wet: 0.22 });
        break;
      }
      case 'flyingdaggers': {
        [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 0.84, ratio: 2.76, modIndex: 82, modEnd: 3, dur: 0.22, delay: i * 0.022, gain: 0.062 * att, pan: Math.sin(i * 1.1) * 0.42, wet: 0.34 });
        });
        this._noise({ source: 'white', dur: 0.22, gain: 0.095 * att, filterType: 'bandpass', freq: 4400, endFreq: 1800, q: 2.6, pan, wet: 0.26 });
        break;
      }
      case 'eclipseblade': {
        this._fm({ carrier: 1760 * p, endCarrier: 2637, ratio: 2.76, modIndex: 135, modEnd: 4, dur: 0.11, gain: 0.095 * att, pan, wet: 0.28 });
        this._tone({ type: 'sine', freq: 138 * p, endFreq: 34, dur: 0.34, delay: 0.03, gain: 0.24 * att, pan, wet: 0.26 });
        [0.06, 0.13, 0.20, 0.27].forEach((d, i) => {
          this._noise({ source: 'white', dur: 0.075, delay: d, attack: 0.002, gain: 0.11 * att, filterType: 'bandpass', freq: 3800 - i * 350, endFreq: 1200, q: 3.0, pan: (i % 2 === 0 ? -0.32 : 0.32), wet: 0.26 });
        });
        break;
      }
      case 'starfallbow': {
        [587.33, 880.0, 1174.66, 1760.0].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 1.5, ratio: 3.0, modIndex: 70, modEnd: 3, dur: 0.38, delay: i * 0.035, gain: 0.072 * att, pan: (i - 1.5) * 0.18, wet: 0.38 });
        });
        this._noise({ source: 'pink', dur: 0.32, delay: 0.06, gain: 0.12 * att, filterType: 'bandpass', freq: 2400, endFreq: 680, q: 1.8, pan, wet: 0.32 });
        break;
      }
      case 'soulgrimoire': {
        this._tone({ type: 'triangle', freq: 140 * p, endFreq: 52, dur: 0.22, gain: 0.18 * att, pan, wet: 0.24 });
        [293.66, 349.23, 466.16, 622.25].forEach((f, i) => {
          this._fm({ carrier: f * p, endCarrier: f * 0.72, ratio: 1.5, modIndex: 95, modEnd: 6, dur: 0.36, delay: 0.03 + i * 0.035, gain: 0.072 * att, pan: (i - 1.5) * 0.20, wet: 0.36 });
        });
        this._noise({ source: 'pink', dur: 0.30, delay: 0.04, gain: 0.10 * att, filterType: 'bandpass', freq: 1350, endFreq: 480, q: 2.2, pan, wet: 0.32 });
        break;
      }
      case 'mjolnir': {
        this._fm({ carrier: 392 * p, endCarrier: 196, ratio: 2.76, modIndex: 185, modEnd: 12, dur: 0.34, gain: 0.13 * att, pan, wet: 0.30 });
        this._tone({ type: 'sawtooth', freq: 110 * p, endFreq: 36, dur: 0.34, gain: 0.24 * att, filterType: 'lowpass', filterFreq: 760, filterEnd: 120, pan, wet: 0.26 });
        this._noise({ source: 'crackle', dur: 0.32, gain: 0.19 * att, filterType: 'highpass', freq: 1800, q: 1.4, pan, wet: 0.28 });
        break;
      }
      case 'sunforgecannon': {
        this._tone({ type: 'sine', freq: 92 * p, midFreq: 210 * p, midAt: 0.22, endFreq: 24, dur: 0.52, gain: 0.34 * att, pan, wet: 0.34 });
        this._fm({ carrier: 293.66 * p, endCarrier: 87.31, ratio: 1.5, modIndex: 260, modEnd: 16, dur: 0.48, gain: 0.15 * att, pan, wet: 0.34 });
        this._noise({ source: 'pink', dur: 0.46, gain: 0.24 * att, filterType: 'lowpass', freq: 2200, endFreq: 190, pan, wet: 0.32 });
        break;
      }
      default: {
        this.arcCast();
        break;
      }
    }
  }

  arcCast() {
    if (!this._ready('arcCast', 55, false)) return;
    [293.66, 440.0, 659.25].forEach((f, i) => {
      this._fm({ carrier: f * 1.2, endCarrier: f * 0.78, ratio: 2.0, modIndex: 75, modEnd: 4, dur: 0.28, delay: i * 0.02, gain: 0.08 / (i + 1), wet: 0.30 });
    });
  }

  // ==================== ALL 12 HERO CLASS ACTIVE SKILLS [X] & PASSIVES ====================
  classSkill(classId = 'ember_paladin', pos = null) {
    if (!this._ready(`cskill_${classId}`, 80, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.02);

    switch (classId) {
      case 'ember_paladin': {
        // Cathedral golden bell + radiant holy dome swell
        [293.66, 440.0, 587.33, 880.0].forEach((f, i) => {
          this._fm({ carrier: f * p, ratio: 2.76, modIndex: 120 - i * 20, modEnd: 3, dur: 0.65, delay: i * 0.03, gain: (0.095 / (1 + i * 0.28)) * att, pan: (i - 1.5) * 0.16, wet: 0.42 });
        });
        this._noise({ source: 'pink', dur: 0.34, attack: 0.03, gain: 0.11 * att, filterType: 'bandpass', freq: 920, endFreq: 2100, q: 1.5, pan, wet: 0.32 });
        break;
      }
      case 'crimson_flagellant': {
        // Visceral blood-chain rip + berserker heartbeat roar
        this._noise({ source: 'white', dur: 0.18, attack: 0.002, gain: 0.22 * att, filterType: 'bandpass', freq: 2400, endFreq: 520, q: 1.8, pan, wet: 0.24 });
        this._tone({ type: 'sawtooth', freq: 138 * p, endFreq: 38, dur: 0.42, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 680, filterEnd: 110, pan, wet: 0.28 });
        this._fm({ carrier: 620 * p, endCarrier: 220, ratio: 2.41, modIndex: 160, modEnd: 12, dur: 0.26, gain: 0.10 * att, pan, wet: 0.26 });
        break;
      }
      case 'iron_juggernaut': {
        // Steam thruster burst + electromagnetic graviton implosion
        this._noise({ source: 'white', dur: 0.16, gain: 0.16 * att, filterType: 'bandpass', freq: 2900, endFreq: 850, q: 2.0, pan, wet: 0.18 });
        this._tone({ type: 'sawtooth', freq: 155 * p, endFreq: 28, dur: 0.44, delay: 0.04, gain: 0.32 * att, filterType: 'lowpass', filterFreq: 820, filterEnd: 95, pan, wet: 0.30 });
        this._fm({ carrier: 480 * p, endCarrier: 96, ratio: 1.41, modIndex: 210, modEnd: 14, dur: 0.38, delay: 0.04, gain: 0.13 * att, pan, wet: 0.32 });
        break;
      }
      case 'wraith_assassin': {
        // Shadow smoke vanish + phantom twin-blade unsheathe
        this._noise({ source: 'pink', dur: 0.22, attack: 0.005, gain: 0.18 * att, filterType: 'bandpass', freq: 720, endFreq: 3400, q: 2.2, pan, wet: 0.30 });
        this._fm({ carrier: 1480 * p, endCarrier: 2217.46, ratio: 2.76, modIndex: 110, modEnd: 3, dur: 0.18, gain: 0.090 * att, pan, wet: 0.34 });
        break;
      }
      case 'fortune_gambler': {
        // Crisp ivory dice cup rattle & toss
        [0, 0.038, 0.075, 0.115].forEach((d, i) => {
          this._fm({ carrier: (1250 + (i % 2) * 340) * this._jitter(0.06), ratio: 2.35, modIndex: 95, modEnd: 5, dur: 0.055, delay: d, gain: 0.078 * att, pan: (i % 2 === 0 ? -0.2 : 0.2), wet: 0.16 });
        });
        this._tone({ type: 'sine', freq: 420, endFreq: 840, dur: 0.18, delay: 0.08, gain: 0.065 * att, pan, wet: 0.22 });
        break;
      }
      case 'plague_apothecary': {
        // Triple cauldron glass shatter + toxic miasma boil
        [0, 0.04, 0.08].forEach((d, i) => {
          this._fm({ carrier: (2100 + i * 380) * p, endCarrier: 920, ratio: 2.41, modIndex: 120, modEnd: 6, dur: 0.09, delay: d, gain: 0.070 * att, pan: (i - 1) * 0.22, wet: 0.20 });
        });
        this._noise({ source: 'crackle', dur: 0.38, delay: 0.05, gain: 0.18 * att, filterType: 'bandpass', freq: 1480, endFreq: 520, q: 2.2, pan, wet: 0.28 });
        break;
      }
      case 'bone_necromancer': {
        // Rattling ossuary bones + spectral crypt horn
        [0, 0.032, 0.068, 0.105].forEach((d, i) => {
          this._fm({ carrier: (540 + i * 110) * p, endCarrier: 280, ratio: 2.35, modIndex: 85, modEnd: 6, dur: 0.07, delay: d, gain: 0.072 * att, pan: (i - 1.5) * 0.16, wet: 0.22 });
        });
        [146.83, 220.0, 349.23].forEach((f, i) => {
          this._tone({ type: i === 0 ? 'sawtooth' : 'triangle', freq: f * p, endFreq: f * 0.96, dur: 0.52, delay: 0.05, attack: 0.04, gain: (0.095 / (i + 1)) * att, filterType: 'lowpass', filterFreq: 680, pan, wet: 0.38 });
        });
        break;
      }
      case 'chrono_astromancer': {
        // Grand astronomical clock chime + time-stop pitch warp
        [587.33, 880.0, 1318.51].forEach((f, i) => {
          this._fm({ carrier: f * p, ratio: 2.76, modIndex: 95, modEnd: 3, dur: 0.55, delay: i * 0.025, gain: 0.078 * att, pan: (i - 1) * 0.18, wet: 0.40 });
        });
        this._tone({ type: 'sine', freq: 440, endFreq: 73.42, dur: 0.46, delay: 0.06, gain: 0.15 * att, pan, wet: 0.32 });
        break;
      }
      case 'storm_invoker': {
        // Sky thunderbolt crack + rolling ozone tempest
        this._noise({ source: 'white', dur: 0.16, attack: 0.002, gain: 0.24 * att, filterType: 'highpass', freq: 1800, q: 1.5, pan, wet: 0.28 });
        this._tone({ type: 'sawtooth', freq: 145 * p, endFreq: 32, dur: 0.46, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 920, filterEnd: 110, pan, wet: 0.34 });
        this._fm({ carrier: 880 * p, endCarrier: 293.66, ratio: 2.41, modIndex: 180, modEnd: 10, dur: 0.32, gain: 0.095 * att, pan, wet: 0.30 });
        break;
      }
      case 'brass_artificer': {
        // Heavy brass ratchet + steam piston + turbine spin-up
        [0, 0.045, 0.09].forEach((d, i) => {
          this._fm({ carrier: (420 + i * 140) * p, ratio: 2.76, modIndex: 115, modEnd: 8, dur: 0.075, delay: d, gain: 0.085 * att, pan, wet: 0.16 });
        });
        this._noise({ source: 'white', dur: 0.18, delay: 0.08, gain: 0.12 * att, filterType: 'bandpass', freq: 2600, endFreq: 900, q: 1.8, pan, wet: 0.18 });
        this._tone({ type: 'triangle', freq: 260, endFreq: 780, dur: 0.26, delay: 0.10, gain: 0.085 * att, pan, wet: 0.20 });
        break;
      }
      case 'abyssal_ooze': {
        // Giant elastic gel launch boing
        this._tone({ type: 'sine', freq: 135 * p, midFreq: 420 * p, midAt: 0.42, endFreq: 210, dur: 0.30, gain: 0.22 * att, pan, wet: 0.24 });
        this._fm({ carrier: 260 * p, endCarrier: 520 * p, ratio: 1.5, modIndex: 85, modEnd: 6, dur: 0.24, gain: 0.095 * att, pan, wet: 0.24 });
        break;
      }
      case 'cursed_mimic': {
        // Ferocious wooden-chest jaw crunch + erupting gold coin shower!
        this._tone({ type: 'sawtooth', freq: 165 * p, endFreq: 42, dur: 0.22, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 860, filterEnd: 140, pan, wet: 0.20 });
        this._noise({ source: 'crackle', dur: 0.15, gain: 0.18 * att, filterType: 'bandpass', freq: 1350, q: 1.6, pan, wet: 0.18 });
        [0.05, 0.085, 0.12, 0.155, 0.19].forEach((d, i) => {
          this._fm({ carrier: (1567.98 + i * 195) * this._jitter(0.04), ratio: 2.76, modIndex: 90, modEnd: 3, dur: 0.16, delay: d, gain: 0.068 * att, pan: (i - 2) * 0.20, wet: 0.26 });
        });
        break;
      }
      default: {
        this.arcCast();
        break;
      }
    }
  }

  aegisReflect(pos = null) {
    if (!this._ready('aegisReflect', 70, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 880, endCarrier: 587.33, ratio: 2.76, modIndex: 135, modEnd: 5, dur: 0.28, gain: 0.12 * att, pan, wet: 0.32 });
    this._tone({ type: 'triangle', freq: 146.83, endFreq: 55, dur: 0.24, gain: 0.18 * att, pan, wet: 0.22 });
  }

  empPulse(pos = null) {
    if (!this._ready('empPulse', 80, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 620, endCarrier: 155, ratio: 1.41, modIndex: 140, modEnd: 8, dur: 0.20, gain: 0.095 * att, pan, wet: 0.24 });
    this._noise({ source: 'crackle', dur: 0.14, gain: 0.085 * att, filterType: 'highpass', freq: 2000, q: 1.5, pan, wet: 0.20 });
  }

  assassinBlinkStrike(step = 0, pos = null) {
    if (!this._ready('assassinBlinkStrike', 40, false)) return;
    const { pan, att } = this._spatial(pos);
    const f = (1180 + (5 - step) * 145) * this._jitter(0.025);
    this._fm({ carrier: f, endCarrier: f * 0.58, ratio: 2.76, modIndex: 120, modEnd: 4, dur: 0.12, gain: 0.095 * att, pan, wet: 0.24 });
    this._noise({ source: 'white', dur: 0.08, attack: 0.002, gain: 0.11 * att, filterType: 'bandpass', freq: 3600, endFreq: 1300, q: 2.8, pan, wet: 0.20 });
  }

  diceResolve(roll = 6, pos = null) {
    if (!this._ready('diceResolve', 60, false)) return;
    const { pan, att } = this._spatial(pos);
    if (roll >= 6) {
      // 777 JACKPOT fanfare!
      [587.33, 739.99, 880.0, 1174.66, 1479.98, 1760.0].forEach((f, i) => {
        this._fm({ carrier: f, ratio: 2.76, modIndex: 95, modEnd: 3, dur: 0.45, delay: i * 0.038, gain: 0.085 * att, pan: (i - 2.5) * 0.14, wet: 0.36 });
      });
    } else if (roll === 5) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this._fm({ carrier: f, ratio: 2.0, modIndex: 60, modEnd: 3, dur: 0.30, delay: i * 0.035, gain: 0.075 * att, pan, wet: 0.30 });
      });
    } else if (roll >= 3) {
      this._noise({ source: 'white', dur: 0.22, gain: 0.14 * att, filterType: 'bandpass', freq: 3600, endFreq: 1200, q: 2.6, pan, wet: 0.28 });
      this._fm({ carrier: 1318.5, endCarrier: 880, ratio: 2.41, modIndex: 110, modEnd: 4, dur: 0.24, gain: 0.085 * att, pan, wet: 0.30 });
    } else {
      [0, 0.03, 0.06].forEach((d, i) => {
        this._noise({ source: 'white', dur: 0.065, delay: d, gain: 0.095 * att, filterType: 'bandpass', freq: 2800 + i * 400, q: 2.4, pan, wet: 0.18 });
      });
      this._fm({ carrier: 987.77, ratio: 2.0, modIndex: 70, modEnd: 4, dur: 0.18, gain: 0.075 * att, pan, wet: 0.22 });
    }
  }

  coinRicochet(pos = null) {
    if (!this._ready('coinRicochet', 55, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 1760 * this._jitter(0.04), endCarrier: 2349.3, ratio: 2.76, modIndex: 85, modEnd: 3, dur: 0.14, gain: 0.072 * att, pan, wet: 0.24 });
  }

  contagionPop(pos = null) {
    if (!this._ready('contagionPop', 65, false)) return;
    const { pan, att } = this._spatial(pos);
    this._tone({ type: 'sine', freq: 240, midFreq: 480, midAt: 0.25, endFreq: 95, dur: 0.16, gain: 0.13 * att, pan, wet: 0.20 });
    this._noise({ source: 'crackle', dur: 0.18, gain: 0.11 * att, filterType: 'bandpass', freq: 1650, endFreq: 620, q: 2.0, pan, wet: 0.22 });
  }

  wraithRise(pos = null) {
    if (!this._ready('wraithRise', 90, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 329.63, endCarrier: 493.88, ratio: 1.5, modIndex: 75, modEnd: 4, dur: 0.26, gain: 0.078 * att, pan, wet: 0.32 });
    this._noise({ source: 'pink', dur: 0.20, gain: 0.075 * att, filterType: 'bandpass', freq: 1150, endFreq: 520, q: 2.0, pan, wet: 0.26 });
  }

  brassTurretShot(isGrenade = false, pos = null) {
    if (!this._ready('brassTurretShot', 65, false)) return;
    const { pan, att } = this._spatial(pos);
    if (isGrenade) {
      this._tone({ type: 'sawtooth', freq: 175, endFreq: 48, dur: 0.18, gain: 0.16 * att, filterType: 'lowpass', filterFreq: 880, pan, wet: 0.18 });
      this._noise({ source: 'pink', dur: 0.14, gain: 0.12 * att, filterType: 'bandpass', freq: 1350, endFreq: 380, q: 1.5, pan, wet: 0.16 });
    } else {
      this._fm({ carrier: 780 * this._jitter(0.04), endCarrier: 290, ratio: 2.35, modIndex: 85, modEnd: 5, dur: 0.075, gain: 0.068 * att, pan, wet: 0.12 });
    }
  }

  turretDetonate(pos = null) {
    this.cannonExplosion(pos);
  }

  slimeBounceImpact(bounceIdx = 0, pos = null) {
    if (!this._ready('slimeBounceImpact', 55, false)) return;
    const { pan, att } = this._spatial(pos);
    const lift = 1 + (2 - Math.min(2, bounceIdx)) * 0.12;
    this._tone({ type: 'sine', freq: 145 * lift, endFreq: 38, dur: 0.28, gain: 0.26 * att, pan, wet: 0.24 });
    this._tone({ type: 'triangle', freq: 290 * lift, midFreq: 460 * lift, midAt: 0.3, endFreq: 130, dur: 0.22, gain: 0.12 * att, pan, wet: 0.24 });
    this._noise({ source: 'pink', dur: 0.16, gain: 0.12 * att, filterType: 'bandpass', freq: 950, endFreq: 340, q: 1.8, pan, wet: 0.20 });
  }

  slimelingPop(pos = null) {
    if (!this._ready('slimelingPop', 65, false)) return;
    const { pan, att } = this._spatial(pos);
    this._tone({ type: 'sine', freq: 310, midFreq: 590, midAt: 0.25, endFreq: 120, dur: 0.14, gain: 0.12 * att, pan, wet: 0.18 });
    this._noise({ source: 'pink', dur: 0.11, gain: 0.08 * att, filterType: 'bandpass', freq: 1400, q: 1.8, pan, wet: 0.16 });
  }

  shadowDecoyBurst(pos = null) {
    if (!this._ready('shadowDecoyBurst', 75, false)) return;
    const { pan, att } = this._spatial(pos);
    this._noise({ source: 'white', dur: 0.16, gain: 0.11 * att, filterType: 'bandpass', freq: 2800, endFreq: 820, q: 2.2, pan, wet: 0.26 });
    this._fm({ carrier: 987.77, endCarrier: 440, ratio: 2.41, modIndex: 95, modEnd: 4, dur: 0.18, gain: 0.075 * att, pan, wet: 0.28 });
  }

  // ==================== COMBAT IMPACTS, SHIELDS, EXECUTIONS & KILLS ====================
  impactEnemy({ heavy = false, crit = false, element = 'PYRE', isDot = false, pos = null } = {}) {
    if (isDot) {
      if (!this._ready('impactDot', 135, false)) return;
      const { pan, att } = this._spatial(pos);
      this._noise({ source: 'crackle', dur: 0.065, gain: 0.036 * att, filterType: 'bandpass', freq: 2100 * this._jitter(0.08), q: 2.2, pan, wet: 0.10 });
      return;
    }
    if (!this._ready(crit ? 'impactCrit' : 'impactEnemy', crit ? 28 : 34, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.05);

    // Physical body thud
    this._tone({
      type: 'triangle',
      freq: (heavy ? 132 : 168) * p,
      endFreq: heavy ? 32 : 42,
      dur: heavy ? 0.20 : 0.13,
      attack: 0.002,
      gain: (heavy ? 0.28 : 0.20) * (crit ? 1.18 : 1.0) * att,
      pan,
      wet: 0.14
    });

    // Element-flavored texture layer
    if (element === 'FROST') {
      this._fm({ carrier: 1680 * p, endCarrier: 920, ratio: 2.41, modIndex: 95, modEnd: 4, dur: 0.10, gain: 0.072 * att, pan, wet: 0.20 });
    } else if (element === 'STORM') {
      this._noise({ source: 'crackle', dur: 0.10, gain: 0.10 * att, filterType: 'highpass', freq: 2300, q: 1.5, pan, wet: 0.18 });
    } else if (element === 'PYRE') {
      this._noise({ source: 'pink', dur: 0.11, gain: 0.11 * att, filterType: 'bandpass', freq: 1450 * p, endFreq: 520, q: 1.5, pan, wet: 0.16 });
    } else if (element === 'BLOOD' || element === 'BLIGHT') {
      this._noise({ source: 'crackle', dur: 0.10, gain: 0.095 * att, filterType: 'bandpass', freq: 1180 * p, endFreq: 420, q: 2.0, pan, wet: 0.16 });
    } else if (element === 'VOID' || element === 'ASTRAL') {
      this._fm({ carrier: 620 * p, endCarrier: 260, ratio: 1.5, modIndex: 85, modEnd: 4, dur: 0.12, gain: 0.070 * att, pan, wet: 0.24 });
    } else {
      this._noise({ source: 'white', dur: 0.085, gain: 0.095 * att, filterType: 'bandpass', freq: 1950 * p, endFreq: 780, q: 1.8, pan, wet: 0.14 });
    }

    // Razor-sharp critical strike ring!
    if (crit) {
      this._fm({ carrier: 1480 * p, endCarrier: 2217.46 * p, ratio: 2.76, modIndex: 135, modEnd: 5, dur: 0.16, attack: 0.0015, gain: 0.105 * att, pan, wet: 0.26 });
      this._noise({ source: 'white', dur: 0.075, attack: 0.0015, gain: 0.11 * att, filterType: 'highpass', freq: 3200, q: 1.4, pan, wet: 0.18 });
    }
  }

  hit(heavy = false, crit = false) {
    this.impactEnemy({ heavy, crit, element: 'PIERCE' });
  }

  impactEnemyShield(isCrit = false, pos = null) {
    if (!this._ready('impactEnemyShield', 36, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.04);
    this._fm({ carrier: (isCrit ? 1318.5 : 1046.5) * p, endCarrier: 659.25, ratio: 2.41, modIndex: 110, modEnd: 5, dur: 0.14, gain: (isCrit ? 0.12 : 0.09) * att, pan, wet: 0.24 });
    this._tone({ type: 'sine', freq: 196 * p, endFreq: 88, dur: 0.10, gain: 0.11 * att, pan, wet: 0.14 });
  }

  shieldBreak(isBoss = false, isHero = false, pos = null) {
    if (!this._ready('shieldBreak', 60, false)) return;
    const { pan, att } = this._spatial(pos);
    const scale = isBoss ? 0.85 : (isHero ? 0.92 : 1.0);
    [1174.66, 1567.98, 2093.0, 2637.0].forEach((f, i) => {
      this._fm({ carrier: f * scale, endCarrier: f * 0.42 * scale, ratio: 2.41, modIndex: 145, modEnd: 6, dur: 0.30, delay: i * 0.018, gain: (0.10 / (1 + i * 0.25)) * att, pan: pan + (i - 1.5) * 0.14, wet: 0.34 });
    });
    this._tone({ type: 'sawtooth', freq: isBoss ? 115 : 145, endFreq: 32, dur: 0.28, gain: 0.22 * att, filterType: 'lowpass', filterFreq: 680, pan, wet: 0.24 });
    this._noise({ source: 'white', dur: 0.18, gain: 0.14 * att, filterType: 'bandpass', freq: 3400, endFreq: 950, q: 1.8, pan, wet: 0.28 });
  }

  executeSlash(pos = null) {
    if (!this._ready('executeSlash', 70, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 1760, endCarrier: 330, ratio: 2.76, modIndex: 180, modEnd: 8, dur: 0.22, attack: 0.0015, gain: 0.14 * att, pan, wet: 0.28 });
    this._tone({ type: 'sawtooth', freq: 125, endFreq: 28, dur: 0.26, gain: 0.24 * att, filterType: 'lowpass', filterFreq: 580, pan, wet: 0.22 });
  }

  chainLightningZap(pos = null) {
    if (!this._ready('chainLightningZap', 55, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.06);
    this._noise({ source: 'crackle', dur: 0.11, attack: 0.0015, gain: 0.12 * att, filterType: 'highpass', freq: 2400, q: 1.6, pan, wet: 0.20 });
    this._fm({ carrier: 1320 * p, endCarrier: 420, ratio: 2.41, modIndex: 140, modEnd: 8, dur: 0.095, gain: 0.072 * att, pan, wet: 0.18 });
  }

  enemyKill(enemyType = 'thrall', isElite = false, isBoss = false, pos = null) {
    if (isBoss) {
      if (!this._ready('bossKill', 200, false)) return;
      const { pan, att } = this._spatial(pos);
      this._tone({ type: 'sawtooth', freq: 98, endFreq: 22, dur: 0.95, gain: 0.36 * att, filterType: 'lowpass', filterFreq: 620, filterEnd: 65, pan, wet: 0.42 });
      [146.83, 220.0, 293.66, 440.0].forEach((f, i) => {
        this._fm({ carrier: f, endCarrier: f * 0.65, ratio: 2.76, modIndex: 160, modEnd: 6, dur: 0.88, delay: 0.06 + i * 0.05, gain: 0.11 * att, pan: (i - 1.5) * 0.2, wet: 0.44 });
      });
      this._noise({ source: 'crackle', dur: 0.72, gain: 0.22 * att, filterType: 'bandpass', freq: 1200, endFreq: 210, q: 1.2, pan, wet: 0.38 });
      return;
    }
    if (!this._ready('enemyKill', 45, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.05);
    const boost = isElite ? 1.22 : 1.0;

    if (enemyType === 'juggernaut') {
      this._tone({ type: 'sawtooth', freq: 112 * p, endFreq: 28, dur: 0.28, gain: 0.22 * boost * att, filterType: 'lowpass', filterFreq: 480, pan, wet: 0.24 });
      this._fm({ carrier: 280 * p, endCarrier: 110, ratio: 2.76, modIndex: 120, modEnd: 8, dur: 0.22, gain: 0.085 * boost * att, pan, wet: 0.22 });
    } else if (enemyType === 'acolyte') {
      this._fm({ carrier: 659.25 * p, endCarrier: 220, ratio: 1.5, modIndex: 95, modEnd: 4, dur: 0.20, gain: 0.080 * boost * att, pan, wet: 0.28 });
      this._noise({ source: 'pink', dur: 0.16, gain: 0.075 * att, filterType: 'bandpass', freq: 1650, endFreq: 420, q: 1.8, pan, wet: 0.22 });
    } else if (enemyType === 'stalker') {
      this._noise({ source: 'white', dur: 0.15, gain: 0.095 * boost * att, filterType: 'bandpass', freq: 2600 * p, endFreq: 680, q: 2.0, pan, wet: 0.22 });
      this._tone({ type: 'triangle', freq: 240 * p, endFreq: 62, dur: 0.15, gain: 0.11 * boost * att, pan, wet: 0.16 });
    } else {
      this._tone({ type: 'triangle', freq: 165 * p, endFreq: 44, dur: 0.16, gain: 0.14 * boost * att, pan, wet: 0.16 });
      this._noise({ source: 'crackle', dur: 0.13, gain: 0.085 * boost * att, filterType: 'bandpass', freq: 1150 * p, endFreq: 360, q: 1.6, pan, wet: 0.16 });
    }
  }

  heroShieldHit(pos = null) {
    if (!this._ready('heroShieldHit', 55, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 783.99, endCarrier: 493.88, ratio: 2.41, modIndex: 115, modEnd: 5, dur: 0.16, gain: 0.11 * att, pan, wet: 0.22 });
    this._tone({ type: 'triangle', freq: 155, endFreq: 58, dur: 0.14, gain: 0.15 * att, pan, wet: 0.14 });
  }

  playerHurt(heavy = true) {
    if (!this._ready('playerHurt', 75, false)) return;
    const p = this._jitter(0.03);
    this._tone({ type: 'sawtooth', freq: (heavy ? 128 : 150) * p, endFreq: 34, dur: 0.28, attack: 0.002, gain: heavy ? 0.30 : 0.22, filterType: 'lowpass', filterFreq: 460, filterEnd: 90, wet: 0.18 });
    this._noise({ source: 'pink', dur: 0.16, attack: 0.002, gain: 0.16, filterType: 'bandpass', freq: 980, endFreq: 260, q: 1.5, wet: 0.14 });
    this._fm({ carrier: 290 * p, endCarrier: 110, ratio: 2.35, modIndex: 95, modEnd: 6, dur: 0.14, gain: 0.085, wet: 0.14 });
  }

  // ==================== ENEMIES, BOSSES & HAZARDS ====================
  enemyAttack(enemyType = 'thrall', pos = null) {
    if (!this._ready(`eatk_${enemyType}`, 65, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.04);
    if (enemyType === 'acolyte') {
      this._fm({ carrier: 466.16 * p, endCarrier: 233.08, ratio: 1.5, modIndex: 85, modEnd: 5, dur: 0.18, gain: 0.075 * att, pan, wet: 0.26 });
    } else if (enemyType === 'stalker') {
      this._noise({ source: 'white', dur: 0.12, attack: 0.003, gain: 0.095 * att, filterType: 'bandpass', freq: 3100 * p, endFreq: 1100, q: 2.4, pan, wet: 0.18 });
    } else if (enemyType === 'juggernaut') {
      this._tone({ type: 'sawtooth', freq: 108 * p, endFreq: 28, dur: 0.34, gain: 0.28 * att, filterType: 'lowpass', filterFreq: 520, filterEnd: 85, pan, wet: 0.28 });
      this._noise({ source: 'crackle', dur: 0.24, gain: 0.16 * att, filterType: 'bandpass', freq: 1150, endFreq: 240, q: 1.4, pan, wet: 0.24 });
    } else {
      this._noise({ source: 'pink', dur: 0.13, gain: 0.085 * att, filterType: 'bandpass', freq: 920 * p, endFreq: 280, q: 1.6, pan, wet: 0.16 });
    }
  }

  bossRoar(summonPhase = false, pos = null) {
    if (!this._ready('bossRoar', 180, false)) return;
    const { pan, att } = this._spatial(pos);
    const baseNotes = summonPhase ? [48.99, 51.91, 97.99, 146.83] : [55.0, 58.27, 110.0, 164.81];
    baseNotes.forEach((f, idx) => {
      this._tone({
        type: idx % 2 === 0 ? 'sawtooth' : 'triangle',
        freq: f * 1.18,
        midFreq: f * 0.92,
        midAt: 0.35,
        endFreq: f * 0.64,
        dur: 1.05,
        attack: 0.09,
        gain: (0.15 / (1 + idx * 0.32)) * att,
        filterType: 'lowpass',
        filterFreq: 620,
        filterEnd: 130,
        pan: pan + (idx - 1.5) * 0.12,
        wet: 0.42
      });
    });
    this._noise({ source: 'pink', dur: 0.92, attack: 0.08, gain: 0.18 * att, filterType: 'bandpass', freq: 480, endFreq: 165, q: 1.4, pan, wet: 0.38 });
  }

  bossSlam(isLeap = false, pos = null) {
    if (!this._ready('bossSlam', 80, false)) return;
    const { pan, att } = this._spatial(pos);
    const boost = isLeap ? 1.22 : 1.0;
    this._tone({ type: 'sawtooth', freq: isLeap ? 96 : 112, endFreq: 24, dur: isLeap ? 0.46 : 0.36, gain: 0.32 * boost * att, filterType: 'lowpass', filterFreq: 680, filterEnd: 80, pan, wet: 0.34 });
    this._fm({ carrier: 220, endCarrier: 73.42, ratio: 2.76, modIndex: 175, modEnd: 10, dur: 0.32, gain: 0.12 * boost * att, pan, wet: 0.28 });
    this._noise({ source: 'crackle', dur: 0.34, gain: 0.20 * boost * att, filterType: 'bandpass', freq: 1350, endFreq: 220, q: 1.2, pan, wet: 0.30 });
  }

  hazardDetonate(lightningSky = false, friendly = true, pos = null) {
    if (!this._ready('hazardDetonate', 45, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.05);
    if (lightningSky) {
      this._noise({ source: 'white', dur: 0.15, attack: 0.0015, gain: 0.16 * att, filterType: 'highpass', freq: 1950, q: 1.4, pan, wet: 0.26 });
      this._tone({ type: 'sawtooth', freq: 135 * p, endFreq: 34, dur: 0.26, gain: 0.18 * att, filterType: 'lowpass', filterFreq: 820, filterEnd: 120, pan, wet: 0.26 });
    } else if (friendly) {
      this._tone({ type: 'triangle', freq: 128 * p, endFreq: 32, dur: 0.24, gain: 0.20 * att, pan, wet: 0.22 });
      this._noise({ source: 'pink', dur: 0.18, gain: 0.13 * att, filterType: 'bandpass', freq: 980, endFreq: 260, q: 1.4, pan, wet: 0.20 });
    } else {
      this._tone({ type: 'sawtooth', freq: 142 * p, endFreq: 30, dur: 0.30, gain: 0.24 * att, filterType: 'lowpass', filterFreq: 680, pan, wet: 0.26 });
      this._noise({ source: 'crackle', dur: 0.22, gain: 0.15 * att, filterType: 'bandpass', freq: 1300, endFreq: 300, q: 1.5, pan, wet: 0.24 });
    }
  }

  spikeThrust(pos = null) {
    if (!this._ready('spikeThrust', 90, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 1120, endCarrier: 310, ratio: 2.76, modIndex: 145, modEnd: 8, dur: 0.11, attack: 0.0015, gain: 0.12 * att, pan, wet: 0.18 });
    this._noise({ source: 'white', dur: 0.075, gain: 0.095 * att, filterType: 'bandpass', freq: 2800, endFreq: 900, q: 2.2, pan, wet: 0.16 });
  }

  // ==================== PICKUPS, POTIONS, PROPS & WORLD SHRINES ====================
  cinderPickup(value = 1, pos = null) {
    if (!this._ready('cinderPickup', 30, false)) return;
    const { pan, att } = this._spatial(pos);
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this._lastCinderAt < 650) {
      this._cinderChain = Math.min(CINDER_SCALE.length - 1, this._cinderChain + 1);
    } else {
      this._cinderChain = 0;
    }
    this._lastCinderAt = nowMs;
    const note = CINDER_SCALE[this._cinderChain] * this._jitter(0.012);
    this._fm({ carrier: note, endCarrier: note * 1.498, ratio: 2.0, modIndex: 42, modEnd: 2, dur: 0.16, attack: 0.002, gain: 0.068 * att, pan, wet: 0.28 });
    if (value >= 12) {
      this._fm({ carrier: note * 1.5, ratio: 3.0, modIndex: 35, modEnd: 2, dur: 0.22, delay: 0.03, gain: 0.048 * att, pan, wet: 0.32 });
    }
  }

  vitalityPickup(pos = null) {
    if (!this._ready('vitalityPickup', 55, false)) return;
    const { pan, att } = this._spatial(pos);
    this._tone({ type: 'sine', freq: 392.0, midFreq: 587.33, midAt: 0.35, endFreq: 783.99, dur: 0.18, gain: 0.075 * att, pan, wet: 0.28 });
    this._fm({ carrier: 1174.66, ratio: 2.0, modIndex: 32, modEnd: 2, dur: 0.22, delay: 0.035, gain: 0.058 * att, pan, wet: 0.32 });
  }

  energyPickup(pos = null) {
    if (!this._ready('energyPickup', 45, false)) return;
    const { pan, att } = this._spatial(pos);
    this._tone({ type: 'triangle', freq: 523.25, midFreq: 783.99, midAt: 0.38, endFreq: 1046.5, dur: 0.15, gain: 0.068 * att, pan, wet: 0.26 });
    this._fm({ carrier: 1318.5, ratio: 1.5, modIndex: 24, modEnd: 2, dur: 0.18, delay: 0.025, gain: 0.048 * att, pan, wet: 0.30 });
  }

  healFlask() {
    if (!this._ready('healFlask', 120, false)) return;
    // Cork pop + liquid elixir gulp + golden restoration aura
    this._tone({ type: 'sine', freq: 280, midFreq: 690, midAt: 0.3, endFreq: 340, dur: 0.075, gain: 0.095, wet: 0.12 });
    this._noise({ source: 'pink', dur: 0.16, delay: 0.04, gain: 0.075, filterType: 'bandpass', freq: 780, endFreq: 1450, q: 2.2, wet: 0.20 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 38, modEnd: 2, dur: 0.42, delay: 0.07 + i * 0.038, gain: 0.065, pan: (i - 1.5) * 0.16, wet: 0.36 });
    });
  }

  propBreak(kind = 'urn', pos = null) {
    if (!this._ready('propBreak', 42, false)) return;
    const { pan, att } = this._spatial(pos);
    const p = this._jitter(0.06);
    if (kind === 'barrel') {
      // Hollow oak stave crack & splinter
      this._tone({ type: 'triangle', freq: 148 * p, endFreq: 48, dur: 0.18, gain: 0.20 * att, pan, wet: 0.18 });
      [0, 0.028, 0.058].forEach((d, i) => {
        this._noise({ source: 'crackle', dur: 0.11, delay: d, gain: (0.14 - i * 0.03) * att, filterType: 'bandpass', freq: (1150 + i * 280) * p, q: 1.9, pan, wet: 0.18 });
      });
    } else {
      // Ceramic/stone amphora shatter
      [1680, 2240, 2960].forEach((f, i) => {
        this._fm({ carrier: f * p, endCarrier: f * 0.58, ratio: 2.41, modIndex: 115, modEnd: 5, dur: 0.12, delay: i * 0.018, gain: 0.068 * att, pan: pan + (i - 1) * 0.1, wet: 0.22 });
      });
      this._noise({ source: 'white', dur: 0.16, gain: 0.13 * att, filterType: 'bandpass', freq: 2400 * p, endFreq: 680, q: 1.7, pan, wet: 0.20 });
    }
  }

  soulCacheOpen(pos = null) {
    if (!this._ready('soulCacheOpen', 90, false)) return;
    const { pan, att } = this._spatial(pos);
    this._noise({ source: 'pink', dur: 0.34, attack: 0.02, gain: 0.11 * att, filterType: 'bandpass', freq: 720, endFreq: 2200, q: 1.8, pan, wet: 0.34 });
    [440.0, 587.33, 880.0, 1318.51].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 48, modEnd: 2, dur: 0.45, delay: i * 0.042, gain: 0.068 * att, pan: pan + (i - 1.5) * 0.15, wet: 0.38 });
    });
  }

  vaultChestOpen(pos = null) {
    if (!this._ready('vaultChestOpen', 120, false)) return;
    const { pan, att } = this._spatial(pos);
    // Heavy iron lock clunk + lid creak + golden treasure bloom
    this._fm({ carrier: 240, endCarrier: 120, ratio: 2.76, modIndex: 135, modEnd: 8, dur: 0.14, gain: 0.14 * att, pan, wet: 0.18 });
    this._tone({ type: 'sawtooth', freq: 185, endFreq: 265, dur: 0.18, delay: 0.06, gain: 0.065 * att, filterType: 'bandpass', filterFreq: 640, q: 3.0, pan, wet: 0.18 });
    [587.33, 739.99, 880.0, 1174.66, 1479.98].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.76, modIndex: 75, modEnd: 3, dur: 0.52, delay: 0.12 + i * 0.04, gain: 0.072 * att, pan: pan + (i - 2) * 0.14, wet: 0.38 });
    });
  }

  healingFontDrink(pos = null) {
    if (!this._ready('healingFontDrink', 120, false)) return;
    const { pan, att } = this._spatial(pos);
    this._noise({ source: 'pink', dur: 0.42, attack: 0.03, gain: 0.12 * att, filterType: 'bandpass', freq: 620, endFreq: 1850, q: 1.6, pan, wet: 0.36 });
    [293.66, 440.0, 554.37, 659.25, 880.0].forEach((f, i) => {
      this._tone({ type: 'triangle', freq: f, dur: 0.68, delay: i * 0.048, attack: 0.03, gain: 0.068 * att, pan: (i - 2) * 0.15, wet: 0.42 });
    });
  }

  bloodPactSacrifice(pos = null) {
    if (!this._ready('bloodPactSacrifice', 120, false)) return;
    const { pan, att } = this._spatial(pos);
    // Sacrificial blade draw + dark crimson bell toll
    this._noise({ source: 'white', dur: 0.14, attack: 0.002, gain: 0.14 * att, filterType: 'bandpass', freq: 3200, endFreq: 950, q: 2.4, pan, wet: 0.22 });
    this._fm({ carrier: 146.83, endCarrier: 138.59, ratio: 2.76, modIndex: 145, modEnd: 8, dur: 0.72, delay: 0.04, gain: 0.15 * att, pan, wet: 0.40 });
    this._tone({ type: 'sawtooth', freq: 73.42, endFreq: 48.99, dur: 0.55, delay: 0.04, gain: 0.18 * att, filterType: 'lowpass', filterFreq: 380, pan, wet: 0.32 });
  }

  cinderShrineOffer(pos = null) {
    if (!this._ready('cinderShrineOffer', 100, false)) return;
    const { pan, att } = this._spatial(pos);
    this._noise({ source: 'pink', dur: 0.32, attack: 0.02, gain: 0.14 * att, filterType: 'bandpass', freq: 520, endFreq: 1650, q: 1.4, pan, wet: 0.28 });
    this._noise({ source: 'crackle', dur: 0.28, delay: 0.04, gain: 0.10 * att, filterType: 'bandpass', freq: 1850, q: 1.6, pan, wet: 0.24 });
    [349.23, 440.0, 587.33, 880.0].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 55, modEnd: 3, dur: 0.44, delay: 0.04 + i * 0.04, gain: 0.068 * att, pan: (i - 1.5) * 0.15, wet: 0.36 });
    });
  }

  forgeAnvilTemper(uses = 1, pos = null) {
    if (!this._ready('forgeAnvilTemper', 120, false)) return;
    const { pan, att } = this._spatial(pos);
    const lift = 1 + Math.min(4, uses) * 0.035;
    // Authentic double blacksmith anvil strike + fiery steam quench hiss!
    [0, 0.14].forEach((d, idx) => {
      const c = (idx === 0 ? 1046.5 : 1318.51) * lift;
      this._fm({ carrier: c, ratio: 2.76, modIndex: 195, modEnd: 6, dur: idx === 0 ? 0.26 : 0.48, delay: d, attack: 0.0015, gain: (idx === 0 ? 0.12 : 0.15) * att, pan, wet: 0.32 });
      this._tone({ type: 'triangle', freq: 185 * lift, endFreq: 58, dur: 0.16, delay: d, gain: 0.16 * att, pan, wet: 0.18 });
    });
    this._noise({ source: 'white', dur: 0.36, delay: 0.20, attack: 0.015, gain: 0.12 * att, filterType: 'bandpass', freq: 3800, endFreq: 1400, q: 1.5, pan, wet: 0.26 });
  }

  weaponModalOpen(rarity = 'common') {
    if (!this._ready('weaponModalOpen', 65)) return;
    const rankMap = { common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4 };
    const rk = rankMap[rarity] ?? 0;
    const chord = [
      [392.0, 587.33],
      [440.0, 659.25, 880.0],
      [440.0, 587.33, 880.0, 1174.66],
      [493.88, 739.99, 987.77, 1479.98],
      [587.33, 739.99, 880.0, 1174.66, 1760.0]
    ][rk];
    chord.forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.76, modIndex: 65 + rk * 12, modEnd: 3, dur: 0.32 + rk * 0.06, delay: i * 0.032, gain: 0.062, pan: (i - (chord.length - 1) * 0.5) * 0.15, wet: 0.32, bus: 'ui' });
    });
  }

  weaponEquip(weaponInst = null) {
    if (!this._ready('weaponEquip', 80)) return;
    this.weaponSwap(weaponInst);
    [293.66, 440.0, 587.33].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 60, modEnd: 3, dur: 0.30, delay: 0.05 + i * 0.03, gain: 0.068, pan: (i - 1) * 0.15, wet: 0.28, bus: 'ui' });
    });
  }

  weaponSalvage(pos = null) {
    if (!this._ready('weaponSalvage', 80)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 620, endCarrier: 220, ratio: 2.76, modIndex: 160, modEnd: 8, dur: 0.20, gain: 0.11 * att, pan, wet: 0.22 });
    this._noise({ source: 'crackle', dur: 0.24, gain: 0.13 * att, filterType: 'bandpass', freq: 2100, endFreq: 720, q: 1.6, pan, wet: 0.22 });
    [783.99, 1046.5, 1318.51].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 42, modEnd: 2, dur: 0.22, delay: 0.07 + i * 0.035, gain: 0.062 * att, pan, wet: 0.28 });
    });
  }

  boonModalOpen() {
    if (!this._ready('boonModalOpen', 80)) return;
    this._noise({ source: 'pink', dur: 0.28, attack: 0.02, gain: 0.075, filterType: 'bandpass', freq: 880, endFreq: 2400, q: 1.8, wet: 0.30, bus: 'ui' });
    [293.66, 440.0, 554.37, 880.0].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 48, modEnd: 2, dur: 0.52, delay: i * 0.045, gain: 0.068, pan: (i - 1.5) * 0.16, wet: 0.38, bus: 'ui' });
    });
  }

  boonReroll() {
    if (!this._ready('boonReroll', 70)) return;
    this._noise({ source: 'pink', dur: 0.22, attack: 0.01, gain: 0.085, filterType: 'bandpass', freq: 640, endFreq: 2600, q: 2.0, wet: 0.24, bus: 'ui' });
    [523.25, 659.25, 783.99, 987.77].forEach((f, i) => {
      this._fm({ carrier: f, endCarrier: f * 1.12, ratio: 2.41, modIndex: 55, modEnd: 3, dur: 0.18, delay: i * 0.03, gain: 0.058, pan: (i - 1.5) * 0.18, wet: 0.26, bus: 'ui' });
    });
  }

  boonSelect() {
    if (!this._ready('boonSelect', 80)) return;
    this._tone({ type: 'triangle', freq: 146.83, endFreq: 73.42, dur: 0.30, gain: 0.14, wet: 0.24, bus: 'ui' });
    [293.66, 440.0, 587.33, 739.99, 1174.66].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 62, modEnd: 2, dur: 0.58, delay: i * 0.035, gain: 0.072 / (1 + i * 0.15), pan: (i - 2) * 0.15, wet: 0.38, bus: 'ui' });
    });
  }

  boonChime() {
    this.boonSelect();
  }

  // ==================== GATES, WAVES, PORTALS & RUN FINALES ====================
  gateSlam(open = false) {
    if (!this._ready(open ? 'gateOpen' : 'gateClose', 90, false)) return;
    if (open) {
      // Iron chain winch + stone gate lifting + purified sanctuary breath
      [0, 0.045, 0.09, 0.135].forEach((d, i) => {
        this._fm({ carrier: 620 + i * 115, ratio: 2.76, modIndex: 95, modEnd: 6, dur: 0.075, delay: d, gain: 0.062, wet: 0.22 });
      });
      this._tone({ type: 'sawtooth', freq: 72, endFreq: 138, dur: 0.40, gain: 0.20, filterType: 'lowpass', filterFreq: 340, wet: 0.28 });
      [293.66, 440.0, 659.25].forEach((f, i) => {
        this._tone({ type: 'triangle', freq: f, dur: 0.48, delay: 0.08 + i * 0.04, attack: 0.03, gain: 0.055, pan: (i - 1) * 0.16, wet: 0.36 });
      });
    } else {
      // Heavy portcullis drop + iron-on-stone lock slam
      [0, 0.035, 0.07].forEach((d, i) => {
        this._fm({ carrier: 920 - i * 140, ratio: 2.76, modIndex: 120, modEnd: 8, dur: 0.065, delay: d, gain: 0.068, wet: 0.20 });
      });
      this._tone({ type: 'sawtooth', freq: 136, endFreq: 26, dur: 0.42, delay: 0.06, gain: 0.32, filterType: 'lowpass', filterFreq: 360, filterEnd: 80, wet: 0.30 });
      this._noise({ source: 'pink', dur: 0.26, delay: 0.06, gain: 0.18, filterType: 'lowpass', freq: 920, endFreq: 160, wet: 0.26 });
    }
  }

  waveHorn() {
    if (!this._ready('waveHorn', 140, false)) return;
    [110.0, 164.81, 220.0].forEach((f, i) => {
      this._tone({
        type: 'sawtooth',
        freq: f * 0.94,
        midFreq: f,
        midAt: 0.25,
        endFreq: f * 0.98,
        dur: 0.62,
        attack: 0.06,
        gain: 0.12 / (i + 1),
        filterType: 'lowpass',
        filterFreq: 720,
        filterEnd: 280,
        pan: (i - 1) * 0.16,
        wet: 0.38
      });
    });
    this._noise({ source: 'pink', dur: 0.34, attack: 0.03, gain: 0.11, filterType: 'bandpass', freq: 680, endFreq: 280, q: 1.5, wet: 0.30 });
  }

  trialObeliskActivate(pos = null) {
    if (!this._ready('trialObeliskActivate', 160, false)) return;
    const { pan, att } = this._spatial(pos);
    this._fm({ carrier: 110, endCarrier: 55, ratio: 3.14, modIndex: 220, modEnd: 12, dur: 0.78, gain: 0.22 * att, pan, wet: 0.42 });
    this._noise({ source: 'crackle', dur: 0.48, gain: 0.18 * att, filterType: 'bandpass', freq: 1450, endFreq: 280, q: 1.4, pan, wet: 0.34 });
    this.waveHorn();
  }

  floorMasteryFanfare() {
    if (!this._ready('floorMasteryFanfare', 200)) return;
    [293.66, 369.99, 440.0, 587.33, 739.99, 880.0].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 68, modEnd: 3, dur: 0.68, delay: i * 0.055, gain: 0.075, pan: (i - 2.5) * 0.14, wet: 0.42, bus: 'ui' });
    });
  }

  portalSpawn(pos = null) {
    if (!this._ready('portalSpawn', 160, false)) return;
    const { pan, att } = this._spatial(pos);
    [146.83, 220.0, 329.63, 440.0].forEach((f, i) => {
      this._fm({ carrier: f * 0.75, endCarrier: f * 1.25, ratio: 1.5, modIndex: 95, modEnd: 5, dur: 0.72, delay: i * 0.045, attack: 0.06, gain: (0.095 / (1 + i * 0.25)) * att, pan: pan + (i - 1.5) * 0.15, wet: 0.44 });
    });
  }

  portalDescend() {
    if (!this._ready('portalDescend', 180)) return;
    this._noise({ source: 'pink', dur: 0.78, attack: 0.06, gain: 0.16, filterType: 'bandpass', freq: 420, endFreq: 2200, q: 1.6, wet: 0.42 });
    [110, 164.81, 220, 329.63, 493.88].forEach((f, i) => {
      this._fm({ carrier: f * 0.82, endCarrier: f * 1.5, ratio: 2.0, modIndex: 75, modEnd: 4, dur: 0.85, delay: i * 0.035, attack: 0.09, gain: 0.095 / (1 + i * 0.28), pan: (i - 2) * 0.16, wet: 0.46 });
    });
  }

  victoryFanfare() {
    if (!this._ready('victoryFanfare', 400)) return;
    const notes = [
      [293.66, 0.00, 0.95],
      [440.00, 0.08, 0.95],
      [587.33, 0.16, 1.05],
      [739.99, 0.26, 1.15],
      [880.00, 0.36, 1.25],
      [1174.66, 0.48, 1.45]
    ];
    notes.forEach(([f, d, dur], i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 85, modEnd: 3, dur, delay: d, attack: 0.025, gain: 0.090 / (1 + i * 0.12), pan: (i - 2.5) * 0.15, wet: 0.48, bus: 'ui' });
      if (i < 3) {
        this._tone({ type: 'sawtooth', freq: f * 0.5, dur: dur + 0.1, delay: d, attack: 0.05, gain: 0.068, filterType: 'lowpass', filterFreq: 950, wet: 0.42, bus: 'ui' });
      }
    });
  }

  defeatDirge() {
    if (!this._ready('defeatDirge', 400)) return;
    const notes = [
      [293.66, 0.00, 0.85],
      [261.63, 0.18, 0.90],
      [220.00, 0.38, 1.05],
      [146.83, 0.58, 1.40]
    ];
    notes.forEach(([f, d, dur], i) => {
      this._tone({ type: 'sawtooth', freq: f, endFreq: f * 0.985, dur, delay: d, attack: 0.05, gain: 0.085, filterType: 'lowpass', filterFreq: 540, filterEnd: 180, pan: (i - 1.5) * 0.14, wet: 0.48, bus: 'ui' });
      this._fm({ carrier: f * 2, ratio: 2.76, modIndex: 48, modEnd: 2, dur: dur * 0.8, delay: d, attack: 0.02, gain: 0.042, wet: 0.44, bus: 'ui' });
    });
  }

  // ==================== MULTIPLAYER CO-OP & LOBBY CUES ====================
  coopPlayerJoin() {
    if (!this._ready('coopPlayerJoin', 80)) return;
    [440.0, 587.33, 880.0].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 45, modEnd: 2, dur: 0.24, delay: i * 0.042, gain: 0.062, pan: (i - 1) * 0.14, wet: 0.28, bus: 'ui' });
    });
  }

  coopPlayerLeave() {
    if (!this._ready('coopPlayerLeave', 80)) return;
    [587.33, 440.0, 329.63].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 1.5, modIndex: 38, modEnd: 2, dur: 0.22, delay: i * 0.045, gain: 0.055, wet: 0.24, bus: 'ui' });
    });
  }

  coopReadyToggle(ready = true) {
    if (!this._ready('coopReadyToggle', 50)) return;
    if (ready) {
      this._fm({ carrier: 587.33, ratio: 2.76, modIndex: 65, modEnd: 3, dur: 0.16, gain: 0.068, wet: 0.20, bus: 'ui' });
      this._fm({ carrier: 880.0, ratio: 2.0, modIndex: 55, modEnd: 2, dur: 0.22, delay: 0.045, gain: 0.068, wet: 0.26, bus: 'ui' });
    } else {
      this._fm({ carrier: 587.33, endCarrier: 392.0, ratio: 2.0, modIndex: 40, modEnd: 2, dur: 0.14, gain: 0.055, wet: 0.16, bus: 'ui' });
    }
  }

  coopLockHero() {
    if (!this._ready('coopLockHero', 70)) return;
    this._tone({ type: 'triangle', freq: 164.81, endFreq: 82.41, dur: 0.18, gain: 0.12, wet: 0.18, bus: 'ui' });
    [440.0, 659.25, 880.0].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.76, modIndex: 85, modEnd: 4, dur: 0.28, delay: i * 0.03, gain: 0.072, pan: (i - 1) * 0.14, wet: 0.30, bus: 'ui' });
    });
  }

  coopCountdownTick(urgent = false) {
    if (!this._ready('coopCountdownTick', 450)) return;
    this._fm({ carrier: urgent ? 1046.5 : 783.99, ratio: 2.41, modIndex: urgent ? 75 : 40, modEnd: 2, dur: 0.085, gain: urgent ? 0.068 : 0.042, wet: 0.16, bus: 'ui' });
  }

  allyDownedAlert() {
    if (!this._ready('allyDownedAlert', 180)) return;
    [0, 0.15].forEach((d, idx) => {
      this._fm({ carrier: idx === 0 ? 349.23 : 261.63, endCarrier: idx === 0 ? 311.13 : 207.65, ratio: 2.76, modIndex: 115, modEnd: 6, dur: 0.26, delay: d, gain: 0.11, wet: 0.30, bus: 'ui' });
    });
  }

  revivePulse(progress = 0.5, pos = null) {
    if (!this._ready('revivePulse', 80, false)) return;
    const { pan, att } = this._spatial(pos);
    const f = 440.0 * Math.pow(2, Math.max(0, Math.min(1, progress)) * 0.75);
    this._fm({ carrier: f, endCarrier: f * 1.25, ratio: 2.0, modIndex: 55, modEnd: 3, dur: 0.24, gain: 0.085 * att, pan, wet: 0.34 });
  }

  reviveComplete(pos = null) {
    if (!this._ready('reviveComplete', 160, false)) return;
    const { pan, att } = this._spatial(pos);
    [392.0, 493.88, 587.33, 783.99, 1174.66].forEach((f, i) => {
      this._fm({ carrier: f, ratio: 2.0, modIndex: 65, modEnd: 3, dur: 0.55, delay: i * 0.04, gain: 0.078 * att, pan: pan + (i - 2) * 0.14, wet: 0.42 });
    });
  }
}
