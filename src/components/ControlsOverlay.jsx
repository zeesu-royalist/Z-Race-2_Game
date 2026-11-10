import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import {
  Car,
  Volume2,
  VolumeX,
  Camera,
  Sun,
  Sunset,
  Moon,
  RotateCcw,
  Flag,
  Wrench,
  HelpCircle,
  X,
  Keyboard
} from 'lucide-react';
import { CarCustomizerModal } from './CarCustomizerModal';
import { soundManager } from '../utils/AudioSystem';

export function ControlsOverlay() {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const cycleTimeOfDay = useGameStore((s) => s.cycleTimeOfDay);
  const soundEnabled = useGameStore((s) => s.soundEnabled);
  const toggleSound = useGameStore((s) => s.toggleSound);
  const triggerReset = useGameStore((s) => s.triggerReset);
  const raceActive = useGameStore((s) => s.raceActive);
  const startRace = useGameStore((s) => s.startRace);
  const stopRace = useGameStore((s) => s.stopRace);
  const carName = useGameStore((s) => s.carName);
  const carBrand = useGameStore((s) => s.carBrand);

  const [isGarageOpen, setIsGarageOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const getTimeIcon = () => {
    if (timeOfDay === 'day') return <Sun size={18} color="#ffbb00" />;
    if (timeOfDay === 'sunset') return <Sunset size={18} color="#ff7733" />;
    return <Moon size={18} color="#88aaff" />;
  };

  return (
    <>
      <header className="game-header">
        {/* Brand / Title */}
        <div className="brand-group">
          <span
            className="brand-badge"
            onClick={() => window.location.reload()}
            title="Reload Game"
          >
            Zr
          </span>
          <h1
            className="brand-title"
            onClick={() => window.location.reload()}
            title="Reload Game"
          >
            Z-RACE
          </h1>
          <a
            href="https://zeesu-royalist.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="brand-sub"
            title="Visit Zeesu Royalist"
          >
            Zeesu Royalist
          </a>
        </div>

        {/* Center Quick Action Buttons */}
        <div className="header-actions">
          {/* Race Mode Toggle */}
          <button
            className={`action-pill ${raceActive ? 'race-active-pill' : 'race-idle-pill'}`}
            onClick={() => {
              soundManager.init();
              soundManager.resume();
              if (raceActive) stopRace();
              else startRace();
            }}
            title={raceActive ? 'End Race' : 'Start Circuit Race'}
          >
            <Flag size={16} />
            <span>{raceActive ? 'ABORT RACE' : 'START RACE'}</span>
          </button>

          {/* Garage / Car Customizer */}
          <button
            className="action-pill car-selector-pill"
            onClick={() => setIsGarageOpen(true)}
            title={`Switch Car / Garage (${carName})`}
          >
            <Car size={16} />
            <span>{(carBrand || 'TOYOTA').toUpperCase()}</span>
          </button>

          {/* Camera View Switcher (Icon Only) */}
          <button
            className="icon-action-btn"
            onClick={cycleCameraMode}
            title={`Switch Camera: ${cameraMode.toUpperCase()} (Press C)`}
          >
            <Camera size={18} />
          </button>

          {/* Time of Day / Weather Switcher (Icon Only) */}
          <button
            className="icon-action-btn"
            onClick={cycleTimeOfDay}
            title={`Toggle Weather/Time: ${timeOfDay.toUpperCase()} (Press T)`}
          >
            {getTimeIcon()}
          </button>

          {/* Sound Toggle */}
          <button
            className="icon-action-btn"
            onClick={() => {
              soundManager.init();
              soundManager.resume();
              toggleSound();
            }}
            title="Toggle Audio (Press M)"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} color="#ff4455" />}
          </button>

          {/* Reset Car */}
          <button
            className="icon-action-btn reset-btn"
            onClick={triggerReset}
            title="Reset Car Upright (Press R)"
          >
            <RotateCcw size={18} />
          </button>

          {/* Controls Help */}
          <button
            className="icon-action-btn"
            onClick={() => setIsHelpOpen(true)}
            title="Controls & Instructions"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* Car Customizer & Model Selector Modal */}
      <CarCustomizerModal
        isOpen={isGarageOpen}
        onClose={() => setIsGarageOpen(false)}
      />

      {/* Controls Help Modal */}
      {isHelpOpen && (
        <div className="modal-backdrop" onClick={() => setIsHelpOpen(false)}>
          <div className="modal-card help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Keyboard className="text-cyan" size={24} />
                <h2>GAME CONTROLS & HOW TO PLAY</h2>
              </div>
              <button className="modal-close-btn" onClick={() => setIsHelpOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="keys-grid">
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">W</span>
                    <span className="key-cap">▲</span>
                  </div>
                  <span className="key-desc">Accelerate / Gas Pedal</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">S</span>
                    <span className="key-cap">▼</span>
                  </div>
                  <span className="key-desc">Brake / Reverse Gear</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">A</span>
                    <span className="key-cap">D</span>
                    <span className="key-cap">◀</span>
                    <span className="key-cap">▶</span>
                  </div>
                  <span className="key-desc">Steer Left & Right</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">SPACE</span>
                  </div>
                  <span className="key-desc">Handbrake / Power Drift</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">SHIFT</span>
                  </div>
                  <span className="key-desc">Nitro Boost Surge</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">R</span>
                  </div>
                  <span className="key-desc">Reset Car onto Road</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">C</span>
                  </div>
                  <span className="key-desc">Cycle 3 Camera Angles (Close, Far, Aerial)</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">T</span>
                  </div>
                  <span className="key-desc">Cycle Time (Day, Sunset, Cyberpunk Night)</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap">M</span>
                  </div>
                  <span className="key-desc">Mute / Unmute Procedural Sound</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">MOUSE DRAG</span>
                  </div>
                  <span className="key-desc">360° Orbit Camera (Inspect Car from Any Angle)</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">WHEEL / PINCH</span>
                  </div>
                  <span className="key-desc">Zoom In & Out Smoothly</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">DRIVE (W / ▲)</span>
                  </div>
                  <span className="key-desc">Auto-Recenter Camera Smoothly Behind Car</span>
                </div>
                <div className="key-row">
                  <div className="key-badges">
                    <span className="key-cap wide-key">2x CLICK</span>
                  </div>
                  <span className="key-desc">Instant Camera Snap to Rear</span>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ flexDirection: 'column', gap: '10px' }}>
              <button className="primary-btn" onClick={() => setIsHelpOpen(false)}>
                GOT IT, LET'S RACE!
              </button>
              <div style={{ fontSize: '11px', color: '#8fa0b5', textAlign: 'center', marginTop: '2px' }}>
                Created with passion by{' '}
                <a
                  href="https://zeesu-royalist.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary-cyan)', fontWeight: 700, textDecoration: 'none' }}
                >
                  Zeesu Royalist
                </a>{' '}
                •{' '}
                <a
                  href="https://zeesu-royalist.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00ff88', textDecoration: 'none' }}
                >
                  zeesu-royalist.vercel.app
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

