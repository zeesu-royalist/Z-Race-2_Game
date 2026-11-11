import { memo, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Car,
  Ship,
  Fan,
  Volume2,
  VolumeX,
  Camera,
  Sun,
  Sunset,
  Moon,
  RotateCcw,
  Flag,
  HelpCircle,
  X,
  Keyboard,
  MapPin
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { WATER_SURFACE_Y } from '../utils/waterSystem';
import { CarCustomizerModal } from './CarCustomizerModal';
import { soundManager } from '../utils/AudioSystem';

const TIME_ICONS = {
  day: <Sun size={18} color="#ffbb00" />,
  sunset: <Sunset size={18} color="#ff7733" />,
  night: <Moon size={18} color="#88aaff" />
};

const ICON_VOLUME_ON = <Volume2 size={18} />;
const ICON_VOLUME_OFF = <VolumeX size={18} color="#ff4455" />;

const HELP_CONTROLS = [
  { keys: ['W', '▲'], desc: 'Accelerate / Gas Pedal' },
  { keys: ['S', '▼'], desc: 'Brake / Reverse Gear' },
  { keys: ['A', 'D', '◀', '▶'], desc: 'Steer Left & Right' },
  { keys: ['SPACE'], wide: true, desc: 'Drift / Heli Climb Up' },
  { keys: ['Q', 'Z'], desc: 'Helicopter Descend / Land' },
  { keys: ['SHIFT'], wide: true, desc: 'Nitro Boost Surge' },
  { keys: ['E'], desc: 'Board Boat / Heli or Return to Car' },
  { keys: ['R'], desc: 'Reset Car onto Road' },
  { keys: ['C'], desc: 'Cycle 3 Camera Angles (Close, Far, Aerial)' },
  { keys: ['T'], desc: 'Cycle Time (Day, Sunset, Cyberpunk Night)' },
  { keys: ['M'], desc: 'Mute / Unmute Procedural Sound' },
  { keys: ['MOUSE DRAG'], wide: true, desc: '360° Orbit Camera (Inspect Car from Any Angle)' },
  { keys: ['WHEEL / PINCH'], wide: true, desc: 'Zoom In & Out Smoothly' },
  { keys: ['DRIVE (W / ▲)'], wide: true, desc: 'Auto-Recenter Camera Smoothly Behind Car' },
  { keys: ['2x CLICK'], wide: true, desc: 'Instant Camera Snap to Rear' }
];

const MODAL_FOOTER_STYLE = { flexDirection: 'column', gap: '10px' };
const MODAL_CREDIT_STYLE = { fontSize: '11px', color: '#8fa0b5', textAlign: 'center', marginTop: '2px' };
const MODAL_AUTHOR_STYLE = { color: 'var(--primary-cyan)', fontWeight: 700, textDecoration: 'none' };
const MODAL_SITE_STYLE = { color: '#00ff88', textDecoration: 'none' };

const reloadGame = () => window.location.reload();
const stopPropagation = (e) => e.stopPropagation();

const wakeAudio = () => {
  soundManager.init();
  soundManager.resume();
};

const handleToggleRace = () => {
  wakeAudio();
  const st = useGameStore.getState();
  if (st.raceActive) st.stopRace();
  else st.startRace();
};

const handleFastTravel = () => {
  wakeAudio();
  const st = useGameStore.getState();
  if (st.raceActive) st.stopRace();
  const [curX, , curZ] = st.carPosition;
  if (st.vehicleType === 'boat') {
    const goingToBay = curZ < 60;
    st.teleportTo(goingToBay ? [762, WATER_SURFACE_Y, 174] : [405, WATER_SURFACE_Y, -96], Math.PI / 2);
  } else {
    const goingToParis = curX < 330;
    const yAlt = st.vehicleType === 'helicopter' ? 6.0 : 0.3;
    st.teleportTo(goingToParis ? [395, yAlt, -35] : [-3.0, yAlt, 10.0], goingToParis ? Math.PI * 0.4 : 0);
  }
};

const handleCycleCamera = () => useGameStore.getState().cycleCameraMode();
const handleCycleTime = () => useGameStore.getState().cycleTimeOfDay();
const handleTriggerReset = () => useGameStore.getState().triggerReset();
const handleToggleSound = () => {
  wakeAudio();
  useGameStore.getState().toggleSound();
};

const BrandGroup = memo(function BrandGroup() {
  return (
    <div className="brand-group">
      <span className="brand-badge" onClick={reloadGame} title="Reload Game">
        Zr
      </span>
      <h1 className="brand-title" onClick={reloadGame} title="Reload Game">
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
  );
});

const HeaderActions = memo(function HeaderActions({ onOpenGarage, onOpenHelp }) {
  const {
    cameraMode,
    timeOfDay,
    soundEnabled,
    raceActive,
    carName,
    carBrand,
    vehicleType,
    inEastZone
  } = useGameStore(
    useShallow((s) => {
      const pos = s.teleportTarget?.pos || s.carPosition;
      return {
        cameraMode: s.cameraMode,
        timeOfDay: s.timeOfDay,
        soundEnabled: s.soundEnabled,
        raceActive: s.raceActive,
        carName: s.carName,
        carBrand: s.carBrand,
        vehicleType: s.vehicleType,
        inEastZone: s.vehicleType === 'boat' ? pos[2] >= 60 : pos[0] >= 330
      };
    })
  );

  const isBoat = vehicleType === 'boat';

  return (
    <div className="header-actions">
      {/* Race Mode Toggle */}
      <button
        className={`action-pill ${raceActive ? 'race-active-pill' : 'race-idle-pill'}`}
        onClick={handleToggleRace}
        title={raceActive ? 'End Race' : 'Start Circuit Race'}
      >
        <Flag size={16} />
        <span>{raceActive ? 'ABORT RACE' : 'START RACE'}</span>
      </button>

      {/* Garage / Vehicle, Marina & Helipad Selector */}
      <button
        className="action-pill car-selector-pill"
        onClick={onOpenGarage}
        title={`Switch Vehicle / Boat / Helicopter (${carName})`}
      >
        {vehicleType === 'helicopter' ? <Fan size={16} /> : isBoat ? <Ship size={16} /> : <Car size={16} />}
        <span>{(carBrand || 'MCLAREN').toUpperCase()}</span>
      </button>

      {/* Fast Travel between Districts / Harbor Zones */}
      <button
        className="action-pill"
        onClick={handleFastTravel}
        title={
          isBoat
            ? 'Jump between Seine Marina & Open Harbor Bay'
            : (inEastZone ? 'Return to Main City' : 'Teleport to Paris District (or drive East Highway)')
        }
      >
        <MapPin size={15} />
        <span>{isBoat ? (inEastZone ? 'MARINA' : 'OPEN BAY') : (inEastZone ? 'CITY' : 'PARIS')}</span>
      </button>

      {/* Camera View Switcher (Icon Only) */}
      <button
        className="icon-action-btn"
        onClick={handleCycleCamera}
        title={`Switch Camera: ${cameraMode.toUpperCase()} (Press C)`}
      >
        <Camera size={18} />
      </button>

      {/* Time of Day / Weather Switcher (Icon Only) */}
      <button
        className="icon-action-btn"
        onClick={handleCycleTime}
        title={`Toggle Weather/Time: ${timeOfDay.toUpperCase()} (Press T)`}
      >
        {TIME_ICONS[timeOfDay] || TIME_ICONS.night}
      </button>

      {/* Sound Toggle */}
      <button
        className="icon-action-btn"
        onClick={handleToggleSound}
        title="Toggle Audio (Press M)"
      >
        {soundEnabled ? ICON_VOLUME_ON : ICON_VOLUME_OFF}
      </button>

      {/* Reset Car */}
      <button
        className="icon-action-btn reset-btn"
        onClick={handleTriggerReset}
        title="Reset Car Upright (Press R)"
      >
        <RotateCcw size={18} />
      </button>

      {/* Controls Help */}
      <button
        className="icon-action-btn"
        onClick={onOpenHelp}
        title="Controls & Instructions"
      >
        <HelpCircle size={18} />
      </button>
    </div>
  );
});

const HelpModal = memo(function HelpModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card help-modal" onClick={stopPropagation}>
        <div className="modal-header">
          <div className="modal-title-row">
            <Keyboard className="text-cyan" size={24} />
            <h2>GAME CONTROLS & HOW TO PLAY</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="keys-grid">
            {HELP_CONTROLS.map((row) => (
              <div key={row.desc} className="key-row">
                <div className="key-badges">
                  {row.keys.map((k) => (
                    <span key={k} className={row.wide ? 'key-cap wide-key' : 'key-cap'}>
                      {k}
                    </span>
                  ))}
                </div>
                <span className="key-desc">{row.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer" style={MODAL_FOOTER_STYLE}>
          <button className="primary-btn" onClick={onClose}>
            GOT IT, LET'S RACE!
          </button>
          <div style={MODAL_CREDIT_STYLE}>
            Created with passion by{' '}
            <a
              href="https://zeesu-royalist.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              style={MODAL_AUTHOR_STYLE}
            >
              Zeesu Royalist
            </a>{' '}
            •{' '}
            <a
              href="https://zeesu-royalist.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              style={MODAL_SITE_STYLE}
            >
              zeesu-royalist.vercel.app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
});

export function ControlsOverlay() {
  const [isGarageOpen, setIsGarageOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const openGarage = useCallback(() => setIsGarageOpen(true), []);
  const closeGarage = useCallback(() => setIsGarageOpen(false), []);
  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  return (
    <>
      <header className="game-header">
        <BrandGroup />
        <HeaderActions onOpenGarage={openGarage} onOpenHelp={openHelp} />
      </header>

      <CarCustomizerModal isOpen={isGarageOpen} onClose={closeGarage} />
      {isHelpOpen && <HelpModal onClose={closeHelp} />}
    </>
  );
}
