'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, Ring, Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ── Animated distorted globe ──────────────────────────────────────────── */
function Globe() {
    const mesh = useRef<THREE.Mesh>(null);
    useFrame(({ clock }) => {
        if (!mesh.current) return;
        mesh.current.rotation.y += 0.003;
        mesh.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.1;
    });

    return (
        <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.5}>
            <Sphere ref={mesh} args={[2, 64, 64]}>
                <MeshDistortMaterial
                    color="#06b6d4"
                    attach="material"
                    distort={0.35}
                    speed={2}
                    roughness={0.1}
                    metalness={0.8}
                    transparent
                    opacity={0.85}
                />
            </Sphere>

            {/* Orbit rings */}
            <Ring args={[2.5, 2.6, 64]} rotation={[Math.PI / 2.5, 0, 0]}>
                <meshBasicMaterial color="#06b6d4" transparent opacity={0.3} />
            </Ring>
            <Ring args={[3, 3.1, 64]} rotation={[Math.PI / 4, 0, Math.PI / 6]}>
                <meshBasicMaterial color="#8b5cf6" transparent opacity={0.2} />
            </Ring>
            <Ring args={[3.6, 3.7, 64]} rotation={[Math.PI / 6, Math.PI / 3, 0]}>
                <meshBasicMaterial color="#3b82f6" transparent opacity={0.15} />
            </Ring>
        </Float>
    );
}

/* ── Particle field ─────────────────────────────────────────────────────── */
function Particles() {
    const COUNT = 200;
    const positions = useMemo(() => {
        const arr = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
            arr[i * 3] = (Math.random() - 0.5) * 20;
            arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
        }
        return arr;
    }, []);

    const pts = useRef<THREE.Points>(null);
    useFrame(({ clock }) => {
        if (!pts.current) return;
        pts.current.rotation.y = clock.elapsedTime * 0.02;
        pts.current.rotation.x = clock.elapsedTime * 0.01;
    });

    return (
        <points ref={pts}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
            </bufferGeometry>
            <pointsMaterial size={0.05} color="#06b6d4" transparent opacity={0.6} sizeAttenuation />
        </points>
    );
}

/* ── Data node octahedra ────────────────────────────────────────────────── */
function DataNodes() {
    const group = useRef<THREE.Group>(null);
    useFrame(({ clock }) => {
        if (group.current) group.current.rotation.y = clock.elapsedTime * 0.1;
    });

    const nodes = useMemo(() =>
        Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return {
                x: Math.cos(angle) * 4,
                y: (Math.random() - 0.5) * 2,
                z: Math.sin(angle) * 4,
                color: i % 2 === 0 ? '#06b6d4' : '#8b5cf6',
            };
        }), []);

    return (
        <group ref={group}>
            {nodes.map((n, i) => (
                <mesh key={i} position={[n.x, n.y, n.z]}>
                    <octahedronGeometry args={[0.12]} />
                    <meshStandardMaterial
                        color={n.color}
                        emissive={n.color}
                        emissiveIntensity={0.5}
                        metalness={0.8}
                        roughness={0.2}
                    />
                </mesh>
            ))}
        </group>
    );
}

/* ── Canvas ─────────────────────────────────────────────────────────────── */
export default function ThreeBackground() {
    return (
        <div className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
            <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 0, 8], fov: 60 }}
                gl={{ antialias: true, alpha: true }}
                style={{ background: 'transparent' }}
                onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                }}
            >
                <ambientLight intensity={0.3} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#06b6d4" />
                <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />
                <directionalLight position={[5, 5, 5]} intensity={0.5} />

                <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={0.5} />
                <Globe />
                <Particles />
                <DataNodes />
            </Canvas>
        </div>
    );
}
