import React, { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { GameCanvas } from './components/GameCanvas';
import { SpeedometerHUD } from './components/SpeedometerHUD';
import { ControlsOverlay } from './components/ControlsOverlay';
import { TouchControls } from './components/TouchControls';
import { soundManager } from './utils/AudioSystem';
import { useGameStore } from './store/gameStore';

function LoadingOverlay() {
  const { active, progress } = useProgress();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (progress === 100 && !active) setReady(true);
    const t = setTimeout(() => setReady(true), 3500);
    return () => clearTimeout(t);
  }, [progress, active]);

  if (ready && !active) return null;

  return (
    <div className="game-loading-overlay">
      <div className="loading-card">
        <div className="loading-spinner" />
        <div className="loading-title">CAR IS LOADING...</div>
        <div className="loading-subtitle">{Math.round(progress)}%</div>
      </div>
    </div>
  );
}

export default function App() {
  if (typeof window !== 'undefined') {
    window.useGameStore = useGameStore;
    window.soundManager = soundManager;
  }
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const fetchCars = useGameStore((s) => s.fetchCars);
  const syncCarsList = useGameStore((s) => s.syncCarsList);

  useEffect(() => {
    fetchCars();

    if (import.meta.hot) {
      import.meta.hot.on('cars-updated', (updatedCars) => {
        syncCarsList(updatedCars);
      });
    }

    const updateTouch = () => {
      setIsTouchDevice(
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches ||
        window.innerWidth <= 1024
      );
    };
    updateTouch();
    window.addEventListener('resize', updateTouch);
    window.addEventListener('orientationchange', updateTouch);
    soundManager.init();

    const handleUserInteraction = () => {
      soundManager.init();
      soundManager.resume();
      if (screen.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    };

    const events = ['click', 'pointerdown', 'keydown', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { capture: true, passive: true }));

    const handleVisibilityChange = () => {
      if (document.hidden) {
        soundManager.setEnabled(false);
      } else {
        const soundEnabled = useGameStore.getState().soundEnabled;
        soundManager.setEnabled(soundEnabled);
        if (soundEnabled) soundManager.resume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', updateTouch);
      window.removeEventListener('orientationchange', updateTouch);
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchCars, syncCarsList]);

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
