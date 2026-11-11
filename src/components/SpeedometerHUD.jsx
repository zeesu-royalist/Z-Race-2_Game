import { memo, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Zap, Flame, Timer, Trophy, Waves, Ship, Car, Fan } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const ICON_CAR = <Car size={16} />;
const ICON_FAN = <Fan size={16} />;
const ICON_SHIP = <Ship size={16} />;
const ICON_WAVES = <Waves size={16} />;
const ICON_ZAP = <Zap size={9} className="cyber-zap" />;
const ICON_TIMER = <Timer size={9} className="icon-pulse" />;
const ICON_TROPHY = <Trophy size={10} color="#ffd700" />;
const ICON_FLAME = <Flame size={12} className="flame-icon" />;

const RPM_INIT_STYLE = { width: '0%' };
const NITRO_INIT_STYLE = { width: '100%' };
const DRIFT_HIDE_STYLE = { display: 'none' };

const formatTime = (secs) => {
  const totalCs = Math.max(0, Math.round(secs * 100));
  const m = (totalCs / 6000) | 0;
  const s = ((totalCs % 6000) / 100) | 0;
  const cs = totalCs % 100;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${cs < 10 ? '0' : ''}${cs}`;
};

const handleProximitySwitch = () => {
  const st = useGameStore.getState();
  const prompt = st.nearbyPrompt;
  if (prompt?.kind === 'board_boat' || prompt?.kind === 'board_heli') {
    st.boardWorldVehicle(
      prompt.vehicleType || (prompt.kind === 'board_heli' ? 'helicopter' : 'boat'),
      prompt.targetId,
      prompt.carParkSpot || st.carPosition,
      prompt.carRotY ?? st.carRotation
    );
  } else if (prompt?.kind === 'return_car') {
    st.returnToParkedCar(st.carPosition, st.carRotation);
  }
};

const handleWaterRespawn = () => useGameStore.getState().triggerReset();
const handleFinishBannerEnd = () => useGameStore.setState({ raceFinished: false });

const CountdownOverlay = memo(function CountdownOverlay() {
  const raceCountdown = useGameStore((s) => s.raceCountdown);
  if (raceCountdown === null) return null;
  return (
    <div className="race-countdown-overlay">
      <div key={raceCountdown} className={`countdown-num ${raceCountdown === 0 ? 'countdown-go' : ''}`}>
        {raceCountdown === 0 ? 'GO!' : raceCountdown}
      </div>
    </div>
  );
});

const FinishBanner = memo(function FinishBanner() {
  const raceFinished = useGameStore((s) => s.raceFinished);
  if (!raceFinished) return null;
  const { racePosition, lapTime } = useGameStore.getState();
  return (
    <div className="race-finish-banner" onAnimationEnd={handleFinishBannerEnd}>
      <div className="banner-badge">P{racePosition} OF 7</div>
      <div className={`banner-title ${racePosition === 1 ? 'gold' : ''}`}>
        {racePosition === 1 ? '1ST PLACE VICTORY' : 'RACE COMPLETED'}
      </div>
      <div className="banner-time">{formatTime(lapTime)}</div>
    </div>
  );
});

const ProximityPrompt = memo(function ProximityPrompt() {
  const nearbyPrompt = useGameStore((s) => s.nearbyPrompt);
  if (!nearbyPrompt) return null;
  const isReturn = nearbyPrompt.kind === 'return_car';
  return (
    <div className={`proximity-switch-pill ${isReturn ? 'is-car-return' : ''}`}>
      {isReturn ? ICON_CAR : nearbyPrompt.kind === 'board_heli' ? ICON_FAN : ICON_SHIP}
      <span className="proximity-prompt-text">Enter in this vehicle</span>
      <button type="button" className="proximity-enter-btn" onClick={handleProximitySwitch}>
        ENTER (E)
      </button>
    </div>
  );
});

const WaterAlert = memo(function WaterAlert() {
  const showWaterAlert = useGameStore((s) => s.isInWater && !s.nearbyPrompt);
  if (!showWaterAlert) return null;
  return (
    <button type="button" className="water-alert-pill" onClick={handleWaterRespawn}>
      {ICON_WAVES}
      <span>IN WATER — TAP OR PRESS [R] TO RESPAWN ON ROAD</span>
    </button>
  );
});

const RaceTelemetry = memo(function RaceTelemetry({ posRef, lapTimeRef }) {
  const { currentCheckpoint, totalCheckpoints, bestLapTime } = useGameStore(
    useShallow((s) => ({
      currentCheckpoint: s.currentCheckpoint,
      totalCheckpoints: s.totalCheckpoints,
      bestLapTime: s.bestLapTime
    }))
  );

  const st = useGameStore.getState();

  return (
    <div className="cyber-race-telemetry">
      <div className="race-sub-row">
        <div className="race-sub-col">
          <span className="race-sub-label">POS</span>
          <span className="race-pos-val">P<span ref={posRef}>{st.racePosition}</span><small className="race-total-rank">/7</small></span>
        </div>
        <div className="race-sub-divider" />
        <div className="race-sub-col">
          <span className="race-sub-label">{ICON_TIMER} TIME</span>
          <span ref={lapTimeRef} className="race-time-val">{formatTime(st.lapTime)}</span>
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
              <span className="race-sub-label">{ICON_TROPHY} BEST</span>
              <span className="race-best-val">{formatTime(bestLapTime)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

/** Zero-GC telemetry HUD with isolated alert overlays and visibility-aware RAF updates. */
export function SpeedometerHUD() {
  const { raceActive, vehicleType } = useGameStore(
    useShallow((s) => ({ raceActive: s.raceActive, vehicleType: s.vehicleType }))
  );

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
    let animId = 0;
    let running = !document.hidden;

    let prevSpeed = -1;
    let prevRpm = -1;
    let prevFillPct = -1;
    let prevRpmTier = -1;
    let prevGear = null;
    let prevNitro = -1;
    let prevNitroActive = null;
    let prevDrifting = false;
    let prevDriftScore = -1;
    let prevLapCs = -1;
    let prevPos = -1;

    const update = () => {
      if (!running) return;
      const s = useGameStore.getState();
      const speed = Math.round(s.speed);
      const rpm = Math.round(s.rpm);
      const nitro = Math.round(s.nitro);

      const speedChanged = speed !== prevSpeed;
      if (speedChanged) {
        prevSpeed = speed;
        if (speedRef.current) speedRef.current.textContent = speed;
      }

      if (s.gear !== prevGear) {
        prevGear = s.gear;
        if (gearRef.current) {
          gearRef.current.textContent = s.gear;
          gearRef.current.classList.toggle('gear-rev', s.gear === 'R');
        }
      }

      if (rpm !== prevRpm || speedChanged) {
        if (rpm !== prevRpm && rpmValRef.current) {
          rpmValRef.current.textContent = rpm;
        }
        prevRpm = rpm;

        const fillPct = Math.max(0, Math.min(100, Math.round(Math.max(((rpm - 900) / 7100) * 100, (speed / 210) * 100))));
        if (fillPct !== prevFillPct) {
          prevFillPct = fillPct;
          if (rpmFillRef.current) rpmFillRef.current.style.width = `${fillPct}%`;

          const tier = fillPct > 68 ? 2 : fillPct > 38 ? 1 : 0;
          if (tier !== prevRpmTier && rpmValRef.current) {
            prevRpmTier = tier;
            rpmValRef.current.style.color = tier === 2 ? '#ff1e42' : tier === 1 ? '#ffaa00' : '#ffffff';
            rpmValRef.current.style.textShadow = tier === 2 ? '0 0 8px #ff1e42' : 'none';
          }
        }
      }

      if (nitro !== prevNitro) {
        prevNitro = nitro;
        if (nitroRef.current) nitroRef.current.style.width = `${nitro}%`;
      }

      const nitroActive = !!s.isNitroActive;
      if (nitroActive !== prevNitroActive) {
        prevNitroActive = nitroActive;
        if (nitroRef.current) nitroRef.current.classList.toggle('nitro-burning', nitroActive);
      }

      if (s.raceActive) {
        if (lapTimeRef.current) {
          const lapCs = Math.max(0, Math.round(s.lapTime * 100));
          if (lapCs !== prevLapCs) {
            prevLapCs = lapCs;
            lapTimeRef.current.textContent = formatTime(s.lapTime);
          }
        }
        if (posRef.current && s.racePosition !== prevPos) {
          prevPos = s.racePosition;
          posRef.current.textContent = s.racePosition;
        }
      } else if (prevLapCs !== -1) {
        prevLapCs = -1;
        prevPos = -1;
      }

      if (driftRef.current) {
        if (s.isDrifting) {
          if (!prevDrifting) {
            prevDrifting = true;
            driftRef.current.style.display = 'flex';
          }
          if (driftScoreRef.current && s.driftScore !== prevDriftScore) {
            prevDriftScore = s.driftScore;
            driftScoreRef.current.textContent = `+${s.driftScore}`;
          }
        } else if (prevDrifting) {
          prevDrifting = false;
          prevDriftScore = -1;
          driftRef.current.style.display = 'none';
        }
      }

      animId = requestAnimationFrame(update);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        if (animId) { cancelAnimationFrame(animId); animId = 0; }
      } else if (!running) {
        running = true;
        animId = requestAnimationFrame(update);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (running) animId = requestAnimationFrame(update);

    return () => {
      running = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="hud-container">
      <CountdownOverlay />
      <FinishBanner />
      <ProximityPrompt />
      <WaterAlert />

      {/* SPEEDOMETER CLUSTER (Top-Right, Minimal Cyber Blade) */}
      <div className="speedometer-cluster">
        <div className="cyber-hud-topline" />

        {/* Speed & Gear / Altitude */}
        <div className="cyber-hud-main">
          <div className="cyber-gear-box">
            <span className="cyber-gear-label">{vehicleType === 'helicopter' ? 'ALT' : 'GEAR'}</span>
            <span ref={gearRef} className="cyber-gear-val">1</span>
          </div>
          <div className="cyber-speed-group">
            <span ref={speedRef} className="cyber-speed-digits">0</span>
            <span className="cyber-unit-kmh">KM/H</span>
          </div>
        </div>

        {/* Dynamic Tachometer Bar */}
        <div className="cyber-tach-bar-row">
          <div className="cyber-rpm-track">
            <div ref={rpmFillRef} className="cyber-rpm-fill" style={RPM_INIT_STYLE} />
          </div>
          <span ref={rpmValRef} className="cyber-rpm-num">900</span>
        </div>

        {/* Nitro Boost Rail */}
        <div className="cyber-nitro-row">
          {ICON_ZAP}
          <div className="cyber-nitro-track">
            <div ref={nitroRef} className="cyber-nitro-fill" style={NITRO_INIT_STYLE} />
          </div>
        </div>

        {raceActive && <RaceTelemetry posRef={posRef} lapTimeRef={lapTimeRef} />}

        {/* Drift Score */}
        <div ref={driftRef} className="drift-score-popup" style={DRIFT_HIDE_STYLE}>
          <div className="drift-title">{ICON_FLAME} DRIFT</div>
          <div ref={driftScoreRef} className="drift-score">+0</div>
        </div>
      </div>
    </div>
  );
}
