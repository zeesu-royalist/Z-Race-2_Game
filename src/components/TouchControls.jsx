import { memo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Zap, Disc } from 'lucide-react';
import { inputState } from './Car';
import { useGameStore } from '../store/gameStore';
import { soundManager } from '../utils/AudioSystem';

const ICON_LEFT = <ChevronLeft size={28} />;
const ICON_RIGHT = <ChevronRight size={28} />;
const ICON_BRAKE = <ArrowDown size={22} />;
const ICON_GAS = <ArrowUp size={24} />;

const HELI_AUX_BUTTONS = [
  { key: 'descend', cls: 'boost-btn', label: 'Descend Down', text: 'DOWN', icon: <ArrowDown size={16} /> },
  { key: 'handbrake', cls: 'handbrake-btn', label: 'Climb Up', text: 'CLIMB', icon: <ArrowUp size={16} /> }
];

const CAR_AUX_BUTTONS = [
  { key: 'handbrake', cls: 'handbrake-btn', label: 'Handbrake', text: 'DRIFT', icon: <Disc size={16} /> },
  { key: 'nitro', cls: 'boost-btn', label: 'Nitro Boost', text: 'NITRO', icon: <Zap size={16} /> }
];

const activeTouchKeys = new Set();

function releaseAllTouchKeys() {
  if (activeTouchKeys.size === 0) return;
  activeTouchKeys.forEach((key) => {
    if (key in inputState) inputState[key] = false;
  });
  activeTouchKeys.clear();
}

const onPointerDown = (e) => {
  if (e.cancelable) e.preventDefault();
  const el = e.currentTarget;
  const key = el.dataset.key;
  if (el.setPointerCapture) {
    try { el.setPointerCapture(e.pointerId); } catch {}
  }
  soundManager.init();
  soundManager.resume();
  if (key && key in inputState) {
    activeTouchKeys.add(key);
    inputState[key] = true;
  }
};

const onPointerUp = (e) => {
  if (e.cancelable) e.preventDefault();
  const el = e.currentTarget;
  const key = el.dataset.key;
  if (e.type !== 'lostpointercapture' && el.releasePointerCapture) {
    try { el.releasePointerCapture(e.pointerId); } catch {}
  }
  if (key && key in inputState) {
    activeTouchKeys.delete(key);
    inputState[key] = false;
  }
};

const preventContextMenu = (e) => e.preventDefault();

/** Zero-allocation mobile touch overlay with pointer capture & automatic stuck-key cleanup. */
export const TouchControls = memo(function TouchControls() {
  const isHeli = useGameStore((s) => s.vehicleType === 'helicopter');

  useEffect(() => {
    const onHideOrBlur = () => {
      if (document.hidden || !document.hasFocus()) releaseAllTouchKeys();
    };
    window.addEventListener('blur', releaseAllTouchKeys);
    document.addEventListener('visibilitychange', onHideOrBlur);
    return () => {
      window.removeEventListener('blur', releaseAllTouchKeys);
      document.removeEventListener('visibilitychange', onHideOrBlur);
      releaseAllTouchKeys();
    };
  }, []);

  // Release held aux keys if switching between Car/Boat and Helicopter mid-press
  useEffect(() => () => releaseAllTouchKeys(), [isHeli]);

  const auxButtons = isHeli ? HELI_AUX_BUTTONS : CAR_AUX_BUTTONS;

  return (
    <div className="touch-controls-container">
      {/* Left side: Steering Controls */}
      <div className="touch-steering-group">
        <button
          type="button"
          className="touch-btn steer-btn"
          data-key="left"
          aria-label="Steer Left"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onContextMenu={preventContextMenu}
        >
          {ICON_LEFT}
        </button>
        <button
          type="button"
          className="touch-btn steer-btn"
          data-key="right"
          aria-label="Steer Right"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onContextMenu={preventContextMenu}
        >
          {ICON_RIGHT}
        </button>
      </div>

      {/* Right side: Pedals, Descend/Climb or Handbrake/Boost */}
      <div className="touch-pedals-group">
        <div className="touch-aux-row">
          {auxButtons.map(({ key, cls, label, text, icon }) => (
            <button
              key={text}
              type="button"
              className={`touch-btn aux-btn ${cls}`}
              data-key={key}
              aria-label={label}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onLostPointerCapture={onPointerUp}
              onContextMenu={preventContextMenu}
            >
              {icon}
              <span>{text}</span>
            </button>
          ))}
        </div>

        <div className="touch-drive-row">
          <button
            type="button"
            className="touch-btn pedal-btn brake-pedal"
            data-key="backward"
            aria-label="Brake or Reverse"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
            onContextMenu={preventContextMenu}
          >
            {ICON_BRAKE}
            <span>BRAKE</span>
          </button>
          <button
            type="button"
            className="touch-btn pedal-btn gas-pedal"
            data-key="forward"
            aria-label="Accelerate"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onLostPointerCapture={onPointerUp}
            onContextMenu={preventContextMenu}
          >
            {ICON_GAS}
            <span>GAS</span>
          </button>
        </div>
      </div>
    </div>
  );
});
