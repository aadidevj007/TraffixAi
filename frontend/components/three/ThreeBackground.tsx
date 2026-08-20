'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Float, Line, Text } from '@react-three/drei';
import * as THREE from 'three';

/* ── Road Grid (intersection) ──────────────────────────────────────────── */
function RoadGrid() {
    const group = useRef<THREE.Group>(null);

    const gridLines = useMemo(() => {
        const lines: { start: [number, number, number]; end: [number, number, number] }[] = [];
        // Horizontal road lanes
        for (let i = -6; i <= 6; i += 3) {
            lines.push({ start: [-12, -3.5, i as number], end: [12, -3.5, i as number] });
        }
        // Vertical road lanes
        for (let i = -6; i <= 6; i += 3) {
            lines.push({ start: [i as number, -3.5, -12], end: [i as number, -3.5, 12] });
        }
        return lines;
    }, []);

    return (
        <group ref={group} position={[0, 0, 0]}>
            {/* Road plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.5, 0]}>
                <planeGeometry args={[28, 28]} />
                <meshStandardMaterial
                    color="#030b18"
                    metalness={0.3}
                    roughness={0.9}
                    transparent
                    opacity={0.95}
                />
            </mesh>

            {/* Grid lines */}
            {gridLines.map((line, i) => (
                <Line
                    key={i}
                    points={[line.start, line.end]}
                    color={i % 4 === 0 ? '#06b6d4' : '#0c2a3d'}
                    lineWidth={i % 4 === 0 ? 1 : 0.5}
                    transparent
                    opacity={i % 4 === 0 ? 0.3 : 0.12}
                />
            ))}

            {/* Center intersection highlight */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.49, 0]}>
                <planeGeometry args={[6, 6]} />
                <meshStandardMaterial
                    color="#06b6d4"
                    transparent
                    opacity={0.04}
                    emissive="#06b6d4"
                    emissiveIntensity={0.1}
                />
            </mesh>
        </group>
    );
}

/* ── Moving Vehicle ─────────────────────────────────────────────────────── */
interface VehicleProps {
    startPos: [number, number, number];
    direction: [number, number, number];
    speed: number;
    color: string;
    detected: boolean;
    delay: number;
}

function Vehicle({ startPos, direction, speed, color, detected, delay }: VehicleProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const boxRef = useRef<THREE.LineSegments>(null);
    const pulseRef = useRef<THREE.Mesh>(null);
    const timeRef = useRef(delay);

    const boxGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 0.6, 2.2)), []);

    useFrame(({ clock }) => {
        timeRef.current += 0.01 * speed;
        const t = timeRef.current;

        if (meshRef.current) {
            const x = startPos[0] + direction[0] * (((t * 2) % 30) - 15);
            const z = startPos[2] + direction[2] * (((t * 2) % 30) - 15);
            meshRef.current.position.set(x, startPos[1], z);

            if (boxRef.current) {
                boxRef.current.position.copy(meshRef.current.position);
                boxRef.current.position.y += 0.05;
            }
            if (pulseRef.current) {
                pulseRef.current.position.copy(meshRef.current.position);
                const pulse = Math.sin(clock.elapsedTime * 4) * 0.5 + 0.5;
                pulseRef.current.scale.setScalar(1 + pulse * 0.3);
                (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = detected ? 0.15 + pulse * 0.1 : 0;
            }
        }
    });

    return (
        <group>
            {/* Vehicle body */}
            <mesh ref={meshRef} position={startPos}>
                <boxGeometry args={[1.0, 0.5, 1.8]} />
                <meshStandardMaterial
                    color={color}
                    metalness={0.7}
                    roughness={0.3}
                    emissive={color}
                    emissiveIntensity={0.15}
                />
            </mesh>

            {/* Detection bounding box */}
            {detected && (
                <lineSegments ref={boxRef} geometry={boxGeo} position={startPos}>
                    <lineBasicMaterial color="#06b6d4" transparent opacity={0.9} />
                </lineSegments>
            )}

            {/* Alert pulse ring */}
            <mesh ref={pulseRef} position={startPos} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.2, 1.5, 32]} />
                <meshBasicMaterial color="#06b6d4" transparent opacity={0} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

/* ── Vehicles Config ─────────────────────────────────────────────────────── */
const VEHICLES: VehicleProps[] = [
    { startPos: [-14, -3.2, 0], direction: [1, 0, 0], speed: 1.2, color: '#1e3a5f', detected: true, delay: 0 },
    { startPos: [14, -3.2, -3], direction: [-1, 0, 0], speed: 0.9, color: '#1a2e4a', detected: false, delay: 2 },
    { startPos: [0, -3.2, -14], direction: [0, 0, 1], speed: 1.4, color: '#2d1b4e', detected: true, delay: 1 },
    { startPos: [3, -3.2, 14], direction: [0, 0, -1], speed: 1.0, color: '#1f3520', detected: false, delay: 3 },
    { startPos: [-14, -3.2, 3], direction: [1, 0, 0], speed: 1.1, color: '#3d1f1f', detected: true, delay: 0.5 },
    { startPos: [-3, -3.2, -14], direction: [0, 0, 1], speed: 0.8, color: '#1e3040', detected: false, delay: 1.5 },
];

/* ── Neural Network Nodes ────────────────────────────────────────────────── */
function NeuralNetwork() {
    const group = useRef<THREE.Group>(null);

    const { nodes, connections } = useMemo(() => {
        const layers = [3, 5, 4, 2];
        const ns: { pos: [number, number, number]; layer: number; idx: number }[] = [];
        let connList: { a: number; b: number }[] = [];

        layers.forEach((count, layer) => {
            for (let i = 0; i < count; i++) {
                ns.push({
                    pos: [
                        (layer - 1.5) * 1.8 - 4,
                        (i - (count - 1) / 2) * 1.2 + 1,
                        -6,
                    ],
                    layer,
                    idx: ns.length,
                });
            }
        });

        // Connect adjacent layers
        let offset = 0;
        layers.forEach((count, li) => {
            if (li < layers.length - 1) {
                for (let a = 0; a < count; a++) {
                    for (let b = 0; b < layers[li + 1]; b++) {
                        connList.push({ a: offset + a, b: offset + count + b });
                    }
                }
            }
            offset += count;
        });

        return { nodes: ns, connections: connList };
    }, []);

    useFrame(({ clock }) => {
        if (group.current) {
            group.current.rotation.y = Math.sin(clock.elapsedTime * 0.2) * 0.15;
            group.current.position.y = Math.sin(clock.elapsedTime * 0.4) * 0.3;
        }
    });

    return (
        <group ref={group}>
            {/* Connections */}
            {connections.map(({ a, b }, i) => (
                <Line
                    key={`conn-${i}`}
                    points={[nodes[a].pos, nodes[b].pos]}
                    color="#06b6d4"
                    lineWidth={0.5}
                    transparent
                    opacity={0.12}
                />
            ))}
            {/* Nodes */}
            {nodes.map((n, i) => (
                <Float key={i} speed={1 + i * 0.2} floatIntensity={0.1}>
                    <mesh position={n.pos}>
                        <sphereGeometry args={[0.1, 12, 12]} />
                        <meshStandardMaterial
                            color="#06b6d4"
                            emissive="#06b6d4"
                            emissiveIntensity={1.2}
                            metalness={0.8}
                            roughness={0.1}
                        />
                    </mesh>
                </Float>
            ))}
        </group>
    );
}

/* ── Particle Data Stream ─────────────────────────────────────────────────── */
function DataParticles() {
    const COUNT = 300;
    const ref = useRef<THREE.Points>(null);

    const { positions, colors, speeds } = useMemo(() => {
        const pos = new Float32Array(COUNT * 3);
        const col = new Float32Array(COUNT * 3);
        const spd = new Float32Array(COUNT);
        const c1 = new THREE.Color('#06b6d4');
        const c2 = new THREE.Color('#8b5cf6');
        const c3 = new THREE.Color('#f59e0b');

        for (let i = 0; i < COUNT; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 20;
            pos[i * 3 + 1] = Math.random() * 12 - 4;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
            const rand = Math.random();
            const c = rand < 0.6 ? c1 : rand < 0.8 ? c2 : c3;
            col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
            spd[i] = 0.01 + Math.random() * 0.04;
        }
        return { positions: pos, colors: col, speeds: spd };
    }, []);

    const posRef = useRef(positions.slice());

    useFrame(() => {
        if (!ref.current) return;
        const pos = ref.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3 + 1] += speeds[i];
            if (pos[i * 3 + 1] > 8) pos[i * 3 + 1] = -4;
        }
        ref.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                <bufferAttribute attach="attributes-color" args={[colors, 3]} />
            </bufferGeometry>
            <pointsMaterial size={0.06} vertexColors transparent opacity={0.7} sizeAttenuation />
        </points>
    );
}

/* ── Scanning Plane ─────────────────────────────────────────────────────── */
function ScanPlane() {
    const ref = useRef<THREE.Mesh>(null);

    useFrame(({ clock }) => {
        if (ref.current) {
            ref.current.position.z = Math.sin(clock.elapsedTime * 0.5) * 12;
            (ref.current.material as THREE.MeshBasicMaterial).opacity =
                0.04 + Math.abs(Math.sin(clock.elapsedTime * 0.5)) * 0.04;
        }
    });

    return (
        <mesh ref={ref} rotation={[0, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[28, 14]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.06} side={THREE.DoubleSide} />
        </mesh>
    );
}

/* ── Alert Rings ────────────────────────────────────────────────────────── */
function AlertRings() {
    const rings = useRef<THREE.Group>(null);

    useFrame(({ clock }) => {
        if (!rings.current) return;
        rings.current.children.forEach((child, i) => {
            const t = (clock.elapsedTime * 0.8 + i * 1.5) % 3;
            child.scale.setScalar(1 + t * 0.8);
            (child as THREE.Mesh).material && ((child as any).material.opacity = Math.max(0, 0.6 - t * 0.2));
        });
    });

    return (
        <group ref={rings}>
            {[[-2, -3.4, 0], [2, -3.4, -2]].map((pos, i) => (
                <mesh key={i} position={pos as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.8, 1.0, 32]} />
                    <meshBasicMaterial color={i === 0 ? '#06b6d4' : '#f59e0b'} transparent opacity={0.5} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
    );
}

/* ── Camera Towers ──────────────────────────────────────────────────────── */
function CameraTowers() {
    const positions: [number, number, number][] = [
        [-8, -3.5, -8], [8, -3.5, -8], [-8, -3.5, 8], [8, -3.5, 8]
    ];

    return (
        <group>
            {positions.map((pos, i) => (
                <group key={i} position={pos}>
                    {/* Pole */}
                    <mesh position={[0, 1.5, 0]}>
                        <cylinderGeometry args={[0.05, 0.07, 3, 8]} />
                        <meshStandardMaterial color="#1a2a3a" metalness={0.8} roughness={0.3} />
                    </mesh>
                    {/* Camera head */}
                    <mesh position={[0, 3.1, 0]}>
                        <boxGeometry args={[0.3, 0.2, 0.4]} />
                        <meshStandardMaterial
                            color="#06b6d4"
                            emissive="#06b6d4"
                            emissiveIntensity={0.5}
                            metalness={0.9}
                            roughness={0.1}
                        />
                    </mesh>
                    {/* Glow dot */}
                    <pointLight position={[0, 3.1, 0]} intensity={0.3} color="#06b6d4" distance={4} />
                </group>
            ))}
        </group>
    );
}

/* ── Ambient lighting ───────────────────────────────────────────────────── */
function Lighting() {
    return (
        <>
            <ambientLight intensity={0.15} />
            <pointLight position={[0, 10, 0]} intensity={0.5} color="#06b6d4" />
            <pointLight position={[-8, 5, -8]} intensity={0.4} color="#8b5cf6" />
            <pointLight position={[8, 5, 8]} intensity={0.3} color="#f59e0b" />
            <directionalLight position={[5, 8, 5]} intensity={0.3} color="#a5f3fc" />
            <hemisphereLight args={['#0c2030', '#020408', 0.3]} />
        </>
    );
}

/* ── Camera Controller ──────────────────────────────────────────────────── */
function CameraController() {
    const { camera } = useThree();

    useFrame(({ clock }) => {
        const t = clock.elapsedTime * 0.08;
        camera.position.x = Math.sin(t) * 3;
        camera.position.y = 6 + Math.sin(t * 0.7) * 1.5;
        camera.position.z = 14 + Math.cos(t * 0.5) * 2;
        camera.lookAt(0, -2, 0);
    });

    return null;
}

/* ── Main Export ─────────────────────────────────────────────────────────── */
export default function ThreeBackground() {
    return (
        <div className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
            <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 8, 16], fov: 55 }}
                gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
                style={{ background: 'transparent' }}
                onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                }}
            >
                <CameraController />
                <Lighting />
                <Stars radius={80} depth={50} count={4000} factor={3} saturation={0.5} fade speed={0.3} />
                <RoadGrid />
                <CameraTowers />
                {VEHICLES.map((v, i) => <Vehicle key={i} {...v} />)}
                <NeuralNetwork />
                <DataParticles />
                <ScanPlane />
                <AlertRings />
                <fog attach="fog" args={['#020408', 20, 45]} />
            </Canvas>
        </div>
    );
}
