import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { CityMap } from './CityMap';
import { Car } from './Car';
import { RivalCars } from './RivalCars';
import { CameraRig } from './CameraRig';
import { RacingSystem } from './RacingSystem';
import { TireSkidmarks } from './TireSkidmarks';



function EnvironmentLights() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const shadowSize = 512;

  if (timeOfDay === 'sunset') {
    return (
      <>
        <Sky
          distance={450000}
          sunPosition={[200, 15, 60]}
          turbidity={8}
          rayleigh={5}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />
        <ambientLight intensity={0.65} color="#ffd4a3" />
        <directionalLight
          position={[140, 60, 60]}
          intensity={2.6}
          color="#ff9944"
          castShadow
          shadow-mapSize={[shadowSize, shadowSize]}
          shadow-camera-near={10}
          shadow-camera-far={260}
          shadow-camera-left={-55}
          shadow-camera-right={55}
          shadow-camera-top={55}
          shadow-camera-bottom={-55}
          shadow-bias={-0.0003}
        />
        <hemisphereLight skyColor="#ff9955" groundColor="#332211" intensity={0.7} />
        <fog attach="fog" args={['#a85c42', 100, 480]} />
        <Environment preset="sunset" environmentIntensity={0.8} />
      </>
    );
  }

  if (timeOfDay === 'night') {
    return (
      <>
        <color attach="background" args={['#06080e']} />
        <ambientLight intensity={0.35} color="#4466aa" />
        <directionalLight
          position={[60, 80, 60]}
          intensity={0.7}
          color="#99bbff"
          castShadow
          shadow-mapSize={[shadowSize, shadowSize]}
          shadow-camera-near={10}
          shadow-camera-far={260}
          shadow-camera-left={-55}
          shadow-camera-right={55}
          shadow-camera-top={55}
          shadow-camera-bottom={-55}
          shadow-bias={-0.0003}
        />
        <hemisphereLight skyColor="#0c1626" groundColor="#050608" intensity={0.4} />
        <fog attach="fog" args={['#070a12', 80, 450]} />
        <Environment preset="night" environmentIntensity={0.5} />
      </>
    );
  }

  // Day (Default)
  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[120, 80, 100]}
        turbidity={4}
        rayleigh={1.2}
        mieCoefficient={0.002}
        mieDirectionalG={0.8}
      />
      <ambientLight intensity={0.85} color="#ffffff" />
      <directionalLight
        position={[100, 110, 80]}
        intensity={2.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0003}
      />
      <hemisphereLight skyColor="#87ceeb" groundColor="#3a4042" intensity={0.7} />
      <fog attach="fog" args={['#b8d8ea', 120, 500]} />
      <Environment preset="city" environmentIntensity={0.85} />
    </>
  );
}

export function GameCanvas() {
  const handleCreated = ({ gl }) => {
    const dom = gl.domElement;
    if (dom) {
      // Automatic WebGL Context Loss Recovery for Low-End Mobile & Integrated GPUs
      dom.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('[Z-Race] WebGL context lost. Recovering automatically...');
      }, false);

      dom.addEventListener('webglcontextrestored', () => {
        console.log('[Z-Race] WebGL context restored successfully.');
      }, false);
    }
  };

  return (
    <Canvas
      resize={{ offsetSize: true }}
      shadows={{ type: THREE.BasicShadowMap }}
      dpr={1}
      camera={{ position: [10, 5, -20], fov: 62, near: 0.2, far: 500 }}
      gl={{
        antialias: true,
        stencil: false,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15
      }}
      onCreated={handleCreated}
    >
      <Suspense fallback={null}>
        <EnvironmentLights />
        <CityMap />
        <TireSkidmarks />
        <Car />
        <RivalCars />
        <RacingSystem />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
