// High performance Web Audio API procedural sound synthesizer for car racing
// Ultra-optimized, zero-latency dynamic engine, drift, turbo & crash audio

const PROFILES = {
  ev: { base: [120, 680], f: [900, 3000], osc: 'sine', boost: 0, gain: [0.25, 0.35, 0.08, 0.30] },
  v8_muscle: { base: [55, 260], f: [500, 2400], osc: 'sawtooth', boost: 1200, gain: [0.38, 0.42, 0.12, 0.30] },
  v12_screamer: { base: [78, 360], f: [700, 3200], osc: 'sawtooth', boost: 1400, gain: [0.35, 0.40, 0.10, 0.30] },
  w16_quad: { base: [60, 280], f: [600, 2600], osc: 'sawtooth', boost: 1300, gain: [0.38, 0.42, 0.12, 0.30] },
  jdm_turbo: { base: [68, 320], f: [650, 2800], osc: 'sawtooth', boost: 1300, gain: [0.35, 0.40, 0.10, 0.30] }
};

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

    this.skidGain = null;
    this.skidNoise = null;
    this.skidFilter = null;
    this.skidSqueal = null;

    this.nitroGain = null;
    this.nitroNoise = null;
  }

  init() {
    if (this.initialized) {
      this.resume();
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // Master Gain directly to destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // 1. Engine Synthesizer
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.40, this.ctx.currentTime);

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
      this.engineFilter.Q.setValueAtTime(2.2, this.ctx.currentTime);

      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.setValueAtTime(68, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.setValueAtTime(136, this.ctx.currentTime);

      this.oscSub = this.ctx.createOscillator();
      this.oscSub.type = 'sine';
      this.oscSub.frequency.setValueAtTime(51, this.ctx.currentTime);

      const engineMix = this.ctx.createGain();
      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.osc2.connect(osc2Gain);
      osc2Gain.connect(engineMix);

      const oscSubGain = this.ctx.createGain();
      oscSubGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      this.oscSub.connect(oscSubGain);
      oscSubGain.connect(engineMix);

      this.osc1.connect(engineMix);
      engineMix.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();
      this.oscSub.start();

      // 2. Skid / Drift Synthesizer
      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

      this.skidNoise = this.ctx.createBufferSource();
      this.skidNoise.buffer = noiseBuffer;
      this.skidNoise.loop = true;

      this.skidFilter = this.ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      this.skidFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

      this.skidSqueal = this.ctx.createOscillator();
      this.skidSqueal.type = 'sine';
      this.skidSqueal.frequency.setValueAtTime(850, this.ctx.currentTime);

      const squealGain = this.ctx.createGain();
      squealGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.skidSqueal.connect(squealGain);
      squealGain.connect(this.skidGain);

      this.skidNoise.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);
      this.skidNoise.start();
      this.skidSqueal.start();

      // 3. Nitro Boost Synthesizer
      this.nitroGain = this.ctx.createGain();
      this.nitroGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      const nitroNoiseSource = this.ctx.createBufferSource();
      nitroNoiseSource.buffer = noiseBuffer;
      nitroNoiseSource.loop = true;

      const nitroFilter = this.ctx.createBiquadFilter();
      nitroFilter.type = 'lowpass';
      nitroFilter.frequency.setValueAtTime(2500, this.ctx.currentTime);

      nitroNoiseSource.connect(nitroFilter);
      nitroFilter.connect(this.nitroGain);
      this.nitroGain.connect(this.masterGain);
      nitroNoiseSource.start();

      this.initialized = true;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) {
      console.warn('Web Audio init error:', e);
    }
  }

  resume() {
    if (!this.initialized) {
      this.init();
      return;
    }
    if (this.ctx && this.ctx.state === 'suspended') {
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
    else this.currentProfile = 'jdm_turbo';
  }

  updateEngine(rpm, throttle, speedKmH, category = '') {
    if (!this.initialized) this.init();
    if (!this.enabled || !this.ctx) {
      if (this.engineGain && this.ctx) this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);
      return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (category && category !== this.lastCategory) this.setProfile(category);

    const normRPM = Math.max(0, Math.min(1, (rpm - 900) / 7100));
    const t = this.ctx.currentTime;
    const prof = PROFILES[this.currentProfile] || PROFILES.jdm_turbo;

    const baseFreq = prof.base[0] + normRPM * prof.base[1];
    const fFreq = prof.f[0] + normRPM * prof.f[1] + (throttle ? prof.boost : 0);
    const targetGain = prof.gain[0] + (throttle ? prof.gain[1] : prof.gain[2]) + normRPM * prof.gain[3];

    if (this.osc1.type !== prof.osc) this.osc1.type = prof.osc;
    this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.04);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.75, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(fFreq, t, 0.06);
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.04);
  }

  updateDrift(isDrifting, driftIntensity) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.skidGain.gain.setTargetAtTime(isDrifting ? Math.min(0.40, driftIntensity * 0.40) : 0.0, t, 0.05);
    if (isDrifting && this.skidSqueal) {
      this.skidSqueal.frequency.setTargetAtTime(700 + Math.random() * 400, t, 0.08);
    }
  }

  updateNitro(isActive) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    this.nitroGain.gain.setTargetAtTime(isActive ? 0.35 : 0.0, this.ctx.currentTime, 0.08);
  }

  playGearShift() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch {}
  }

  playCrash(intensity = 1.0) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      gain.gain.setValueAtTime(Math.min(0.65, 0.35 * intensity), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.3);
    } catch {}
  }

  playCountdown(count) {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const isGo = count === 0;
      osc.type = isGo ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(isGo ? 880 : 440, t);
      gain.gain.setValueAtTime(isGo ? 0.45 : 0.30, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isGo ? 0.35 : 0.15));
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + (isGo ? 0.35 : 0.15));
    } catch {}
  }

  playCheckpoint() {
    if (!this.initialized || !this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.05);
        gain.gain.setValueAtTime(0.25, t + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.05 + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + idx * 0.05);
        osc.stop(t + idx * 0.05 + 0.4);
      });
    } catch {}
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
