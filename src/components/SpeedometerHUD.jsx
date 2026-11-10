import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Zap, Flame, Timer, Trophy } from 'lucide-react';

const formatTime = (secs) => {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export function SpeedometerHUD() {
  const raceActive = useGameStore((s) => s.raceActive);
  const raceCountdown = useGameStore((s) => s.raceCountdown);
  const bestLapTime = useGameStore((s) => s.bestLapTime);
  const currentCheckpoint = useGameStore((s) => s.currentCheckpoint);
  const totalCheckpoints = useGameStore((s) => s.totalCheckpoints);
  const raceFinished = useGameStore((s) => s.raceFinished);

  const speedRef = useRef(null);
  const gearRef = useRef(null);
  const rpmValRef = useRef(null);
  const rpmFillRef = useRef(null);
  const nitroRef = useRef(null);
  const lapTimeRef = useRef(null);
  const posRef = useRef(null);
  const driftRef = useRef(null);
  const driftScoreRef = useRef(null);

  useEffect(() => {
    let animId;
    let prev = {};

    const update = () => {
      const s = useGameStore.getState();
      const speed = Math.round(s.speed);
      const rpm = Math.round(s.rpm);
      const nitro = Math.round(s.nitro);

      if (speed !== prev.speed && speedRef.current) speedRef.current.textContent = speed;
      if (s.gear !== prev.gear && gearRef.current) {
        gearRef.current.textContent = s.gear;
        gearRef.current.classList.toggle('gear-rev', s.gear === 'R');
      }

      // Smooth RPM / Speed filling bar that turns RED as speed/RPM rises and empties on slowdown
      if (rpm !== prev.rpm || speed !== prev.speed) {
        const fillPct = Math.max(0, Math.min(100, Math.max(((rpm - 900) / 7100) * 100, (speed / 210) * 100)));
        if (rpmFillRef.current) rpmFillRef.current.style.width = `${fillPct}%`;
        if (rpmValRef.current) {
          rpmValRef.current.textContent = rpm;
          rpmValRef.current.style.color = fillPct > 68 ? '#ff1e42' : fillPct > 38 ? '#ffaa00' : '#ffffff';
          rpmValRef.current.style.textShadow = fillPct > 68 ? '0 0 8px #ff1e42' : 'none';
        }
      }

      if (nitro !== prev.nitro && nitroRef.current) {
        nitroRef.current.style.width = `${nitro}%`;
      }
      if (s.isNitroActive !== prev.nitroActive && nitroRef.current) {
        nitroRef.current.classList.toggle('nitro-burning', !!s.isNitroActive);
      }

      if (lapTimeRef.current && s.raceActive) {
        const t = formatTime(s.lapTime);
        if (t !== prev.time) { lapTimeRef.current.textContent = t; prev.time = t; }
      }

      if (posRef.current && s.raceActive && s.racePosition !== prev.pos) {
        posRef.current.textContent = s.racePosition;
        prev.pos = s.racePosition;
      }

      if (driftRef.current) {
        if (s.isDrifting) {
          if (!prev.drifting) driftRef.current.style.display = 'flex';
          if (driftScoreRef.current && s.driftScore !== prev.driftScore) {
            driftScoreRef.current.textContent = `+${s.driftScore}`;
          }
        } else if (prev.drifting) {
          driftRef.current.style.display = 'none';
        }
      }

      prev = { speed, rpm, gear: s.gear, nitro, nitroActive: s.isNitroActive, drifting: s.isDrifting, driftScore: s.driftScore, time: prev.time, pos: prev.pos };
      animId = requestAnimationFrame(update);
    };

    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="hud-container">
      {/* 3... 2... 1... Countdown */}
      {raceCountdown !== null && (
        <div className="race-countdown-overlay">
          <div key={raceCountdown} className={`countdown-num ${raceCountdown === 0 ? 'countdown-go' : ''}`}>
            {raceCountdown === 0 ? 'GO!' : raceCountdown}
          </div>
        </div>
      )}

      {/* Race Finished (Auto-dismiss via onAnimationEnd) */}
      {raceFinished && (
        <div className="race-finish-banner" onAnimationEnd={() => useGameStore.setState({ raceFinished: false })}>
          <div className="banner-badge">P{useGameStore.getState().racePosition} OF 7</div>
          <div className={`banner-title ${useGameStore.getState().racePosition === 1 ? 'gold' : ''}`}>
            {useGameStore.getState().racePosition === 1 ? '1ST PLACE VICTORY' : 'RACE COMPLETED'}
          </div>
          <div className="banner-time">{formatTime(useGameStore.getState().lapTime)}</div>
        </div>
      )}

      {/* SPEEDOMETER CLUSTER (Top-Right, Minimal Cyber Blade) */}
      <div className="speedometer-cluster">
        <div className="cyber-hud-topline" />

        {/* Speed & Gear */}
        <div className="cyber-hud-main">
          <div className="cyber-gear-box">
            <span className="cyber-gear-label">GEAR</span>
            <span ref={gearRef} className="cyber-gear-val">1</span>
          </div>
          <div className="cyber-speed-group">
            <span ref={speedRef} className="cyber-speed-digits">0</span>
            <span className="cyber-unit-kmh">KM/H</span>
          </div>
        </div>

        {/* Dynamic Tachometer Bar (Smooth progressive fill that turns red) */}
        <div className="cyber-tach-bar-row">
          <div className="cyber-rpm-track">
            <div ref={rpmFillRef} className="cyber-rpm-fill" style={{ width: '0%' }} />
          </div>
          <span ref={rpmValRef} className="cyber-rpm-num">900</span>
        </div>

        {/* Nitro Boost Rail */}
        <div className="cyber-nitro-row">
          <Zap size={9} className="cyber-zap" />
          <div className="cyber-nitro-track">
            <div ref={nitroRef} className="cyber-nitro-fill" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Race Telemetry (Under Speedometer during Race) */}
        {raceActive && (
          <div className="cyber-race-telemetry">
            <div className="race-sub-row">
              <div className="race-sub-col">
                <span className="race-sub-label">POS</span>
                <span className="race-pos-val">P<span ref={posRef}>{useGameStore.getState().racePosition}</span><small className="race-total-rank">/7</small></span>
              </div>
              <div className="race-sub-divider" />
              <div className="race-sub-col">
                <span className="race-sub-label"><Timer size={9} className="icon-pulse" /> TIME</span>
                <span ref={lapTimeRef} className="race-time-val">{formatTime(useGameStore.getState().lapTime)}</span>
              </div>
            </div>
            <div className="race-sub-row race-sub-row-secondary">
              <div className="race-sub-col">
                <span className="race-sub-label">GATE</span>
                <span className="race-gate-val">{currentCheckpoint} / {totalCheckpoints}</span>
              </div>
              {bestLapTime !== null && (
                <>
                  <div className="race-sub-divider" />
                  <div className="race-sub-col">
                    <span className="race-sub-label"><Trophy size={10} color="#ffd700" /> BEST</span>
                    <span className="race-best-val">{formatTime(bestLapTime)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Drift Score (Under Speedometer, or under Telemetry during race) */}
        <div ref={driftRef} className="drift-score-popup" style={{ display: 'none' }}>
          <div className="drift-title"><Flame size={12} className="flame-icon" /> DRIFT</div>
          <div ref={driftScoreRef} className="drift-score">+0</div>
        </div>
      </div>
    </div>
  );
}
