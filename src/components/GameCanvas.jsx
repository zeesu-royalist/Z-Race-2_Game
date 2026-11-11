import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { CityMap } from './CityMap';
import { Car } from './Car';
import { RivalCars } from './RivalCars';
import { DockedBoats } from './DockedBoats';
import { CityCrowds } from './CityCrowds';
import { CameraRig } from './CameraRig';
import { RacingSystem } from './RacingSystem';
import { TireSkidmarks } from './TireSkidmarks';

const SHADOW_MAP_SIZE = [512, 512];

// On high-DPI compact mobile viewports (e.g. 844x390), dpr=1 upscales 9x on 3x screens and pixelates NPCs/edges;
// capping mobile DPR at [1, 2] yields ~1.3MP (still below 1080p desktop) with crisp anti-aliased edges.
const CANVAS_DPR =
  typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) <= 600
    ? [1, 2]
    : 1;

const RESIZE_CONFIG = { offsetSize: true };
const SHADOW_CONFIG = { type: THREE.PCFShadowMap };
const CAMERA_CONFIG = { position: [390.53, 1.8, -36.45], fov: 62, near: 0.2, far: 1200 };
const GL_CONFIG = {
  antialias: true,
  stencil: false,
  alpha: false,
  powerPreference: 'high-performance',
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.15
};

const TIME_PRESETS = {
  sunset: {
    sky: { sunPosition: [200, 15, 60], turbidity: 8, rayleigh: 5, mieCoefficient: 0.005, mieDirectionalG: 0.85 },
    ambientIntensity: 0.65,
    ambientColor: '#ffd4a3',
    dirPos: [140, 60, 60],
    dirIntensity: 2.6,
    dirColor: '#ff9944',
    hemiSky: '#ff9955',
    hemiGround: '#332211',
    hemiIntensity: 0.7,
    fog: ['#a85c42', 180, 920],
    envPreset: 'sunset',
    envIntensity: 0.8
  },
  night: {
    sky: null,
    bgColor: '#06080e',
    ambientIntensity: 0.35,
    ambientColor: '#4466aa',
    dirPos: [60, 80, 60],
    dirIntensity: 0.7,
    dirColor: '#99bbff',
    hemiSky: '#0c1626',
    hemiGround: '#050608',
    hemiIntensity: 0.4,
    fog: ['#070a12', 150, 860],
    envPreset: 'night',
    envIntensity: 0.5
  },
  day: {
    sky: { sunPosition: [120, 80, 100], turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.002, mieDirectionalG: 0.8 },
    ambientIntensity: 0.85,
    ambientColor: '#ffffff',
    dirPos: [100, 110, 80],
    dirIntensity: 2.8,
    dirColor: '#ffffff',
    hemiSky: '#87ceeb',
    hemiGround: '#3a4042',
    hemiIntensity: 0.7,
    fog: ['#b8d8ea', 200, 960],
    envPreset: 'city',
    envIntensity: 0.85
  }
};

function EnvironmentLights() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const p = TIME_PRESETS[timeOfDay] || TIME_PRESETS.day;

  return (
    <>
      {p.sky ? (
        <Sky
          distance={450000}
          sunPosition={p.sky.sunPosition}
          turbidity={p.sky.turbidity}
          rayleigh={p.sky.rayleigh}
          mieCoefficient={p.sky.mieCoefficient}
          mieDirectionalG={p.sky.mieDirectionalG}
        />
      ) : (
        <color attach="background" args={[p.bgColor]} />
      )}
      <ambientLight intensity={p.ambientIntensity} color={p.ambientColor} />
      <directionalLight
        position={p.dirPos}
        intensity={p.dirIntensity}
        color={p.dirColor}
        castShadow
        shadow-mapSize={SHADOW_MAP_SIZE}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0003}
      />
      <hemisphereLight skyColor={p.hemiSky} groundColor={p.hemiGround} intensity={p.hemiIntensity} />
      <fog attach="fog" args={p.fog} />
      {/* Isolated Suspense keeps city/vehicles mounted while HDRI preset switches */}
      <Suspense fallback={null}>
        <Environment preset={p.envPreset} environmentIntensity={p.envIntensity} />
      </Suspense>
    </>
  );
}

export function GameCanvas() {
  const domCleanupRef = useRef(null);
  const [isVisible, setIsVisible] = useState(
    () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden')
  );

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      domCleanupRef.current?.();
    };
  }, []);

  const handleCreated = ({ gl }) => {
    gl.debug.checkShaderErrors = import.meta.env.DEV;
    const dom = gl.domElement;
    if (!dom) return;
    domCleanupRef.current?.();
    const onLost = (e) => {
      e.preventDefault();
      console.warn('[Z-Race] WebGL context lost. Recovering automatically...');
    };
    const onRestored = () => {
      console.log('[Z-Race] WebGL context restored successfully.');
    };
    dom.addEventListener('webglcontextlost', onLost, false);
    dom.addEventListener('webglcontextrestored', onRestored, false);
    domCleanupRef.current = () => {
      dom.removeEventListener('webglcontextlost', onLost, false);
      dom.removeEventListener('webglcontextrestored', onRestored, false);
    };
  };

  return (
    <Canvas
      frameloop={isVisible ? 'always' : 'never'}
      resize={RESIZE_CONFIG}
      shadows={SHADOW_CONFIG}
      dpr={CANVAS_DPR}
      camera={CAMERA_CONFIG}
      gl={GL_CONFIG}
      onCreated={handleCreated}
    >
      <EnvironmentLights />
      {/* Core playable world mounts first; heavy ambient layers stream in independently */}
      <Suspense fallback={null}>
        <CityMap />
        <TireSkidmarks />
        <Car />
        <RacingSystem />
      </Suspense>
      <Suspense fallback={null}><RivalCars /></Suspense>
      <Suspense fallback={null}><DockedBoats /></Suspense>
      <Suspense fallback={null}><CityCrowds /></Suspense>
      <CameraRig />
    </Canvas>
  );
}
