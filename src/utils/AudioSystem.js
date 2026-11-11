// High performance Web Audio API procedural sound synthesizer for Z-Race
// Zero idle timeline churn, lazy aircraft WAV loading, and automatic node cleanup

const PROFILES = {
  ev: { base: [120, 680], f: [900, 3000], osc: 'sine', boost: 0, gain: [0.25, 0.35, 0.08, 0.30] },
  v8_muscle: { base: [55, 260], f: [500, 2400], osc: 'sawtooth', boost: 1200, gain: [0.38, 0.42, 0.12, 0.30] },
  v12_screamer: { base: [78, 360], f: [700, 3200], osc: 'sawtooth', boost: 1400, gain: [0.35, 0.40, 0.10, 0.30] },
  w16_quad: { base: [60, 280], f: [600, 2600], osc: 'sawtooth', boost: 1300, gain: [0.38, 0.42, 0.12, 0.30] },
  jdm_turbo: { base: [68, 320], f: [650, 2800], osc: 'sawtooth', boost: 1300, gain: [0.35, 0.40, 0.10, 0.30] },
  marine: { base: [44, 175], f: [400, 1650], osc: 'sawtooth', boost: 750, gain: [0.32, 0.36, 0.09, 0.24] },
  helicopter: { sample: '/audio/helicopter.wav', rate: [0.88, 0.42], sGain: [0.55, 0.18, 0.25] },
  plane: { sample: '/audio/plane.wav', rate: [0.82, 0.56], sGain: [0.52, 0.18, 0.28] }
};

const CHECKPOINT_FREQS = [523.25, 659.25, 783.99, 1046.50];

class SoundSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.enabled = true;
    this.currentProfile = 'jdm_turbo';
    this.lastCategory = '';

    this.masterGain = null;
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.oscSub = null;
    this.engineFilter = null;
    this.noiseBuffer = null;

    this.skidGain = null;
    this.skidFilter = null;
    this.skidSqueal = null;

    this.nitroGain = null;
    this.sampleGain = null;
    this.sampleBuffers = {};
    this.sampleSrc = null;
    this.sampleKey = '';

    // Cached state to avoid scheduling redundant Web Audio automation events at 60 FPS
    this._wasDrifting = false;
    this._wasNitro = false;
    this._wasMuted = false;
    this._lastRpmNorm = -1;
    this._lastThrottle = null;
    this._lastProfKey = '';
  }

  init() {
    if (this.initialized) {
      this.resume();
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      this.ctx = ctx;
      const t = ctx.currentTime;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, t);
      this.masterGain.connect(ctx.destination);

      // 1. Engine Synthesizer
      this.engineGain = ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.40, t);

      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(800, t);
      this.engineFilter.Q.setValueAtTime(2.2, t);

      this.osc1 = ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(68, t);

      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.setValueAtTime(136, t);

      this.oscSub = ctx.createOscillator();
      this.oscSub.type = 'sine';
      this.oscSub.frequency.setValueAtTime(51, t);

      const engineMix = ctx.createGain();
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.5, t);
      this.osc2.connect(osc2Gain);
      osc2Gain.connect(engineMix);

      const oscSubGain = ctx.createGain();
      oscSubGain.gain.setValueAtTime(0.4, t);
      this.oscSub.connect(oscSubGain);
      oscSubGain.connect(engineMix);

      this.osc1.connect(engineMix);
      engineMix.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();
      this.oscSub.start();

      // Shared 1-second looping white noise buffer (half the PCM memory of 2s buffer)
      const bufferSize = ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      this.noiseBuffer = noiseBuffer;

      // 2. Skid / Drift Synthesizer
      this.skidGain = ctx.createGain();
      this.skidGain.gain.setValueAtTime(0.0, t);

      const skidNoise = ctx.createBufferSource();
      skidNoise.buffer = noiseBuffer;
      skidNoise.loop = true;

      this.skidFilter = ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.setValueAtTime(1400, t);
      this.skidFilter.Q.setValueAtTime(3.0, t);

      this.skidSqueal = ctx.createOscillator();
      this.skidSqueal.type = 'sine';
      this.skidSqueal.frequency.setValueAtTime(850, t);

      const squealGain = ctx.createGain();
      squealGain.gain.setValueAtTime(0.35, t);
      this.skidSqueal.connect(squealGain);
      squealGain.connect(this.skidGain);

      skidNoise.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);
      skidNoise.start();
      this.skidSqueal.start();

      // 3. Nitro Boost Synthesizer
      this.nitroGain = ctx.createGain();
      this.nitroGain.gain.setValueAtTime(0.0, t);

      const nitroNoise = ctx.createBufferSource();
      nitroNoise.buffer = noiseBuffer;
      nitroNoise.loop = true;

      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'lowpass';
      nitroFilter.frequency.setValueAtTime(2500, t);

      nitroNoise.connect(nitroFilter);
      nitroFilter.connect(this.nitroGain);
      this.nitroGain.connect(this.masterGain);
      nitroNoise.start();

      // 4. Aircraft Sample Bus (WAV files fetched lazily on first Helicopter/Plane entry)
      this.sampleGain = ctx.createGain();
      this.sampleGain.gain.setValueAtTime(0.0, t);
      this.sampleGain.connect(this.masterGain);

      this.initialized = true;
      if (PROFILES[this.currentProfile]?.sample) {
        this._loadSample(this.currentProfile);
      }
      if (this.enabled && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('Web Audio init error:', e);
    }
  }

  _loadSample(key) {
    const prof = PROFILES[key];
    if (!prof?.sample || !this.ctx || this.sampleBuffers[key]) return;
    this.sampleBuffers[key] = 'loading';
    fetch(prof.sample)
      .then((r) => r.arrayBuffer())
      .then((ab) => this.ctx.decodeAudioData(ab))
      .then((audioBuf) => { this.sampleBuffers[key] = audioBuf; })
      .catch(() => { delete this.sampleBuffers[key]; });
  }

  _syncSample(key) {
    if (this.sampleKey === key) return;
    if (this.sampleSrc) {
      try { this.sampleSrc.stop(); this.sampleSrc.disconnect(); } catch {}
      this.sampleSrc = null;
    }
    this.sampleKey = '';
    if (!key && this.sampleGain && this.ctx) {
      this.sampleGain.gain.cancelScheduledValues(0);
      this.sampleGain.gain.value = 0;
      return;
    }
    if (key && !this.sampleBuffers[key]) {
      this._loadSample(key);
      return;
    }
    const buf = key ? this.sampleBuffers[key] : null;
    if (!buf || typeof buf === 'string') return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.sampleGain);
    src.start();
    this.sampleSrc = src;
    this.sampleKey = key;
  }

  resume() {
    if (!this.initialized) {
      this.init();
      return;
    }
    if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setProfile(category = '') {
    if (this.lastCategory === category) return;
    this.lastCategory = category;
    const cat = (category || '').toLowerCase();
    if (cat.includes('ev') || cat.includes('electric')) this.currentProfile = 'ev';
    else if (cat.includes('muscle')) this.currentProfile = 'v8_muscle';
    else if (cat.includes('scuderia') || cat.includes('vision') || cat.includes('ferrari') || cat.includes('lamborghini')) this.currentProfile = 'v12_screamer';
    else if (cat.includes('w16') || cat.includes('bugatti') || cat.includes('titan')) this.currentProfile = 'w16_quad';
    else if (cat.includes('boat') || cat.includes('ship') || cat.includes('tug') || cat.includes('yacht') || cat.includes('vessel')) this.currentProfile = 'marine';
    else if (cat.includes('plane') || cat.includes('warbird') || cat.includes('prop') || cat.includes('fighter') || cat.includes('wing')) this.currentProfile = 'plane';
    else if (cat.includes('rotor') || cat.includes('hawk') || cat.includes('heli') || cat.includes('chopper')) this.currentProfile = 'helicopter';
    else this.currentProfile = 'jdm_turbo';

    if (this.initialized && PROFILES[this.currentProfile]?.sample) {
      this._loadSample(this.currentProfile);
    }
  }

  updateEngine(rpm, throttle, speedKmH, category = '') {
    if (!this.initialized) this.init();
    if (!this.ctx) return;

    if (!this.enabled) {
      if (!this._wasMuted) {
        this._wasMuted = true;
        this._lastProfKey = '';
        const t = this.ctx.currentTime;
        this.engineGain?.gain.setValueAtTime(0, t);
        this.sampleGain?.gain.setValueAtTime(0, t);
      }
      return;
    }
    this._wasMuted = false;

    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (category && category !== this.lastCategory) this.setProfile(category);

    const profKey = this.currentProfile;
    const prof = PROFILES[profKey] || PROFILES.jdm_turbo;
    const normRPM = Math.max(0, Math.min(1, (rpm - 900) / 7100));
    const throttleOn = !!throttle;

    // Skip redundant Web Audio automation scheduling when idle or steady-state
    const sameState =
      profKey === this._lastProfKey &&
      throttleOn === this._lastThrottle &&
      Math.abs(normRPM - this._lastRpmNorm) < 0.002 &&
      (!prof.sample || Boolean(this.sampleSrc));
    if (sameState) return;

    this._lastProfKey = profKey;
    this._lastThrottle = throttleOn;
    this._lastRpmNorm = normRPM;

    const t = this.ctx.currentTime;

    if (prof.sample) {
      this.engineGain.gain.setTargetAtTime(0, t, 0.04);
      this._syncSample(profKey);
      if (this.sampleSrc) {
        this.sampleSrc.playbackRate.setTargetAtTime(prof.rate[0] + normRPM * prof.rate[1], t, 0.06);
      }
      const g = prof.sGain[0] + (throttleOn ? prof.sGain[1] : 0) + normRPM * prof.sGain[2];
      this.sampleGain.gain.setTargetAtTime(this.sampleSrc ? g : 0, t, 0.05);
      return;
    }

    this._syncSample('');

    const baseFreq = prof.base[0] + normRPM * prof.base[1];
    const fFreq = prof.f[0] + normRPM * prof.f[1] + (throttleOn ? prof.boost : 0);
    const targetGain = prof.gain[0] + (throttleOn ? prof.gain[1] : prof.gain[2]) + normRPM * prof.gain[3];

    if (this.osc1.type !== prof.osc) this.osc1.type = prof.osc;
    this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.04);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.75, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(fFreq, t, 0.06);
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.04);
  }

  updateDrift(isDrifting, driftIntensity) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    if (!isDrifting) {
      if (this._wasDrifting) {
        this._wasDrifting = false;
        this.skidGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.05);
      }
      return;
    }
    this._wasDrifting = true;
    const t = this.ctx.currentTime;
    this.skidGain.gain.setTargetAtTime(Math.min(0.40, driftIntensity * 0.40), t, 0.05);
    if (this.skidSqueal) {
      this.skidSqueal.frequency.setTargetAtTime(700 + Math.random() * 400, t, 0.08);
    }
  }

  updateNitro(isActive) {
    const active = !!isActive;
    if (!this.initialized || !this.enabled || !this.ctx || active === this._wasNitro) return;
    this._wasNitro = active;
    this.nitroGain.gain.setTargetAtTime(active ? 0.35 : 0.0, this.ctx.currentTime, 0.08);
  }

  _playTone(type, startFreq, endFreq, freqDur, startGain, stopDur, delay = 0) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, t);
      if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + freqDur);
      gain.gain.setValueAtTime(startGain, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + stopDur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
      osc.start(t);
      osc.stop(t + stopDur);
    } catch {}
  }

  playGearShift() {
    this._playTone('triangle', 450, 120, 0.15, 0.35, 0.2);
  }

  playCrash(intensity = 1.0) {
    this._playTone('triangle', 160, 40, 0.25, Math.min(0.65, 0.35 * intensity), 0.3);
  }

  playWaterSplash(intensity = 1.0) {
    if (!this.initialized || !this.enabled || !this.ctx || !this.noiseBuffer) return;
    try {
      const t = this.ctx.currentTime;
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, t);
      filter.frequency.exponentialRampToValueAtTime(220, t + 0.65);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(Math.min(0.7, 0.35 * intensity), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.onended = () => { try { noise.disconnect(); filter.disconnect(); gain.disconnect(); } catch {} };
      noise.start(t);
      noise.stop(t + 0.72);
    } catch {}
  }

  playCountdown(count) {
    const isGo = count === 0;
    this._playTone(isGo ? 'triangle' : 'sine', isGo ? 880 : 440, isGo ? 880 : 440, 0, isGo ? 0.45 : 0.30, isGo ? 0.35 : 0.15);
  }

  playCheckpoint() {
    for (let i = 0; i < CHECKPOINT_FREQS.length; i++) {
      this._playTone('sine', CHECKPOINT_FREQS[i], CHECKPOINT_FREQS[i], 0, 0.25, 0.4, i * 0.05);
    }
  }

  setEnabled(val) {
    this.enabled = val;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(val ? 1.0 : 0.0, this.ctx.currentTime, 0.03);
    }
    if (val) this.resume();
  }
}

export const soundManager = new SoundSystem();
