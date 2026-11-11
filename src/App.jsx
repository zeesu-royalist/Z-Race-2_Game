import { memo, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { GameCanvas } from './components/GameCanvas';
import { SpeedometerHUD } from './components/SpeedometerHUD';
import { ControlsOverlay } from './components/ControlsOverlay';
import { TouchControls } from './components/TouchControls';
import { soundManager } from './utils/AudioSystem';
import { useGameStore } from './store/gameStore';

const INTERACTION_EVENTS = ['click', 'pointerdown', 'keydown', 'touchstart'];
const CAPTURE_PASSIVE_OPTS = { capture: true, passive: true };

const detectTouchDevice = () =>
  typeof window !== 'undefined' && (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth <= 1024
  );

if (typeof window !== 'undefined') {
  window.soundManager = soundManager;
}

const LoadingOverlay = memo(function LoadingOverlay() {
  const { active, progress } = useProgress();
  const [ready, setReady] = useState(false);

  // Single 3.5s fail-safe fallback timer on mount (avoids recreating timers on every progress tick)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready && progress === 100 && !active) setReady(true);
  }, [ready, progress, active]);

  if (ready && !active) return null;

  return (
    <div className="game-loading-overlay">
      <div className="loading-card">
        <div className="loading-spinner" />
        <div className="loading-title">WAIT A SECOND...</div>
        <div className="loading-subtitle">{Math.round(progress)}%</div>
      </div>
    </div>
  );
});

export default function App() {
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);

  useEffect(() => {
    const st = useGameStore.getState();
    st.fetchCars();
    st.fetchBoats();
    st.fetchHelicopters();

    let cleanupHmr;
    if (import.meta.hot) {
      const onCars = (list) => useGameStore.getState().syncCarsList(list);
      const onBoats = (list) => useGameStore.getState().syncBoatsList(list);
      const onHelis = (list) => useGameStore.getState().syncHelicoptersList(list);
      import.meta.hot.on('cars-updated', onCars);
      import.meta.hot.on('boats-updated', onBoats);
      import.meta.hot.on('helicopters-updated', onHelis);
      cleanupHmr = () => {
        import.meta.hot.off('cars-updated', onCars);
        import.meta.hot.off('boats-updated', onBoats);
        import.meta.hot.off('helicopters-updated', onHelis);
      };
    }

    const updateTouch = () => setIsTouchDevice(detectTouchDevice());
    const coarseMql = window.matchMedia?.('(pointer: coarse)');
    window.addEventListener('resize', updateTouch, { passive: true });
    window.addEventListener('orientationchange', updateTouch, { passive: true });
    coarseMql?.addEventListener?.('change', updateTouch);

    soundManager.init();

    // Auto-detach capture listeners after first user interaction (fixes DOM capture removal leak)
    const detachInteractionListeners = () => {
      for (let i = 0; i < INTERACTION_EVENTS.length; i++) {
        window.removeEventListener(INTERACTION_EVENTS[i], handleUserInteraction, true);
      }
    };
    const handleUserInteraction = () => {
      soundManager.init();
      soundManager.resume();
      screen.orientation?.lock?.('landscape').catch(() => {});
      detachInteractionListeners();
    };
    for (let i = 0; i < INTERACTION_EVENTS.length; i++) {
      window.addEventListener(INTERACTION_EVENTS[i], handleUserInteraction, CAPTURE_PASSIVE_OPTS);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        soundManager.setEnabled(false);
        soundManager.ctx?.suspend?.().catch(() => {});
      } else {
        const soundEnabled = useGameStore.getState().soundEnabled;
        soundManager.setEnabled(soundEnabled);
        if (soundEnabled) soundManager.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanupHmr?.();
      window.removeEventListener('resize', updateTouch);
      window.removeEventListener('orientationchange', updateTouch);
      coarseMql?.removeEventListener?.('change', updateTouch);
      detachInteractionListeners();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className="game-viewport">
      <GameCanvas />
      <ControlsOverlay />
      <SpeedometerHUD />
      {isTouchDevice && <TouchControls />}
      <LoadingOverlay />
    </div>
  );
}
