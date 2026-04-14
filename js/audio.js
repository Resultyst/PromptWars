// audio.js — Web Audio API ambient soundscape engine for FlowSense AI

class StadiumAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.crowdGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.isMuted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.5;

      this.setupCrowd();
      this.setupSiren();
      
      this.initialized = true;
      console.log('StadiumAudio initialized');
    } catch (e) {
      console.error('Web Audio API not supported', e);
    }
  }

  setupCrowd() {
    // Generate white noise buffer
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    // Filters to shape "roar"
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 400;
    bp.Q.value = 0.5;

    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0;

    noise.connect(lp);
    lp.connect(bp);
    bp.connect(this.crowdGain);
    this.crowdGain.connect(this.masterGain);

    noise.start();
  }

  setupSiren() {
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.masterGain);

    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 880; // A5
    this.sirenOsc.connect(this.sirenGain);
    this.sirenOsc.start();
  }

  setCrowdLevel(level) {
    if (!this.initialized || !this.crowdGain) return;
    // Scale level (0-1) to audible roar
    // Hum starts at ~0.6, builds rapidly to roar at 0.95+
    const targetGain = level < 0.5 ? level * 0.1 : Math.pow(level, 3) * 0.8;
    this.crowdGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.5);
  }

  triggerCheer() {
    if (!this.initialized) return;
    
    const cheerBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const output = cheerBuffer.getChannelData(0);
    for (let i = 0; i < cheerBuffer.length; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = cheerBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.6, this.ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start();
    source.stop(this.ctx.currentTime + 2.1);
  }

  announceAlert(message) {
    if (this.isMuted) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance('Attention — ' + message);
    utterance.rate = 0.85;
    utterance.pitch = 0.9;
    utterance.volume = this.isMuted ? 0 : 0.8;
    
    // Try to pick a specific voice if available (optional polish)
    const voices = window.speechSynthesis.getVoices();
    const maleVoice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('Male'));
    if (maleVoice) utterance.voice = maleVoice;

    window.speechSynthesis.speak(utterance);
  }

  triggerSiren(active = true) {
    if (!this.initialized || !this.sirenGain) return;

    if (active) {
      // Pulsing effect: 2Hz
      const now = this.ctx.currentTime;
      this.sirenGain.gain.cancelScheduledValues(now);
      this.sirenGain.gain.setValueAtTime(0, now);
      
      // Basic 2Hz pulse using low-frequency oscillator or just scheduling
      for (let i = 0; i < 60; i++) { // Schedule 30 seconds ahead
        this.sirenGain.gain.setValueAtTime(0.3, now + i * 0.5);
        this.sirenGain.gain.setValueAtTime(0, now + i * 0.5 + 0.25);
      }
    } else {
      this.sirenGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.5, this.ctx.currentTime, 0.1);
    }
    return this.isMuted;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}

window.StadiumAudio = new StadiumAudio();
