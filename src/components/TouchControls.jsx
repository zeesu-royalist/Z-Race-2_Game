import React, { useCallback } from 'react';
import { inputState } from './Car';
import { useGameStore } from '../store/gameStore';
import { soundManager } from '../utils/AudioSystem';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Zap, Disc } from 'lucide-react';

export function TouchControls() {
  const vehicleType = useGameStore((s) => s.vehicleType);
  const isHeli = vehicleType === 'helicopter';

  const handleTouch = useCallback((key, active, e) => {
    if (e && e.cancelable) e.preventDefault();
    soundManager.init();
    soundManager.resume();
    if (key in inputState) inputState[key] = active;
  }, []);

  const touchProps = (key) => ({
    onPointerDown: (e) => {
      if (e.target && e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      }
      handleTouch(key, true, e);
    },
    onPointerUp: (e) => {
      if (e.target && e.target.releasePointerCapture) {
        try { e.target.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      handleTouch(key, false, e);
    },
    onPointerCancel: (e) => handleTouch(key, false, e),
    onContextMenu: (e) => e.preventDefault()
  });

  return (
    <div className="touch-controls-container">
      {/* Left side: Steering Controls */}
      <div className="touch-steering-group">
        <button type="button" className="touch-btn steer-btn" {...touchProps('left')} aria-label="Steer Left">
          <ChevronLeft size={28} />
        </button>
        <button type="button" className="touch-btn steer-btn" {...touchProps('right')} aria-label="Steer Right">
          <ChevronRight size={28} />
        </button>
      </div>

      {/* Right side: Pedals, Climb/Land or Handbrake/Boost */}
      <div className="touch-pedals-group">
        <div className="touch-aux-row">
          <button type="button" className="touch-btn aux-btn handbrake-btn" {...touchProps('handbrake')} aria-label={isHeli ? 'Climb Up' : 'Handbrake'}>
            {isHeli ? <ArrowUp size={16} /> : <Disc size={16} />}
            <span>{isHeli ? 'CLIMB' : 'DRIFT'}</span>
          </button>
          <button
            type="button"
            className="touch-btn aux-btn boost-btn"
            {...touchProps(isHeli ? 'descend' : 'nitro')}
            aria-label={isHeli ? 'Descend Down' : 'Nitro Boost'}
          >
            {isHeli ? <ArrowDown size={16} /> : <Zap size={16} />}
            <span>{isHeli ? 'DOWN' : 'NITRO'}</span>
          </button>
        </div>

        <div className="touch-drive-row">
          <button type="button" className="touch-btn pedal-btn brake-pedal" {...touchProps('backward')} aria-label="Brake or Reverse">
            <ArrowDown size={22} />
            <span>BRAKE</span>
          </button>
          <button type="button" className="touch-btn pedal-btn gas-pedal" {...touchProps('forward')} aria-label="Accelerate">
            <ArrowUp size={24} />
            <span>GAS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
