import { useState, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { STLExporter } from 'three-stdlib'
import { Download, RefreshCw, Box, Plus, Trash2, Camera } from 'lucide-react'
import './index.css'

interface ControlPoint {
  h: number;
  r: number;
}

interface MaterialPreset {
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  thickness?: number;
  opacity?: number;
}

const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  clay: { name: 'Raw Clay', color: '#a68a6b', roughness: 0.9, metalness: 0 },
  terracotta: { name: 'Terracotta', color: '#bc6c25', roughness: 0.8, metalness: 0 },
  glazed: { name: 'Glazed Ceramic', color: '#606c38', roughness: 0.1, metalness: 0.2 },
  porcelain: { name: 'White Porcelain', color: '#fefae0', roughness: 0.2, metalness: 0 },
  glass: { name: 'Tinted Glass', color: '#a2d2ff', roughness: 0.05, metalness: 0, transmission: 0.95, thickness: 0.5, opacity: 1 },
  metal: { name: 'Bronze', color: '#b8860b', roughness: 0.3, metalness: 0.9 }
}

interface VaseProps {
  height: number;
  controlPoints: ControlPoint[];
  segments: number;
  wallThickness: number;
  twist: number;
  ribs: number;
  ribAmplitude: number;
  rings: number;
  ringAmplitude: number;
  material: MaterialPreset;
  meshRef: RefObject<THREE.Mesh | null>;
}

function Vase({ height, controlPoints, segments, wallThickness, twist, ribs, ribAmplitude, rings, ringAmplitude, material, meshRef }: VaseProps) {
  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    const detail = 128 // Increase detail for patterns

    // Sort control points by height fraction to ensure valid curve
    const sortedPoints = [...controlPoints].sort((a, b) => a.h - b.h)

    // Create a CatmullRomCurve3 for a smooth profile
    const curvePoints = sortedPoints.map(p => new THREE.Vector3(p.r, p.h * height, 0))
    const curve = new THREE.CatmullRomCurve3(curvePoints)

    // Outer surface
    for (let i = 0; i <= detail; i++) {
      const p = curve.getPoint(i / detail)
      points.push(new THREE.Vector2(p.x, p.y))
    }

    // Internal hollow
    if (wallThickness > 0) {
      for (let i = detail; i >= 0; i--) {
        const p = curve.getPoint(i / detail)
        points.push(new THREE.Vector2(Math.max(0.05, p.x - wallThickness), p.y))
      }
    } else {
      points.push(new THREE.Vector2(0, height))
      points.push(new THREE.Vector2(0, 0))
    }

    const geo = new THREE.LatheGeometry(points, segments)

    const position = geo.attributes.position
    const vector = new THREE.Vector3()

    for (let i = 0; i < position.count; i++) {
      vector.fromBufferAttribute(position, i)

      // 1. Apply Twist
      const twistAngle = (vector.y / height) * twist
      let x = vector.x
      let z = vector.z

      if (twist !== 0) {
        const cosT = Math.cos(twistAngle)
        const sinT = Math.sin(twistAngle)
        const nx = x * cosT - z * sinT
        const nz = x * sinT + z * cosT
        x = nx
        z = nz
      }

      // 2. Apply Patterns
      const angle = Math.atan2(z, x)
      let radiusOffset = 0

      // Vertical Ribs
      if (ribs > 0 && ribAmplitude > 0) {
        radiusOffset += Math.sin(angle * ribs) * ribAmplitude
      }

      // Horizontal Rings
      if (rings > 0 && ringAmplitude > 0) {
        radiusOffset += Math.sin((vector.y / height) * rings * Math.PI * 2) * ringAmplitude
      }

      if (radiusOffset !== 0) {
        const radius = Math.sqrt(x * x + z * z)
        const scale = (radius + radiusOffset) / radius
        x *= scale
        z *= scale
      }

      position.setXYZ(i, x, vector.y, z)
    }

    geo.computeVertexNormals()
    return geo
  }, [height, controlPoints, segments, wallThickness, twist, ribs, ribAmplitude, rings, ringAmplitude])

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      {material.transmission ? (
        <meshPhysicalMaterial
          color={material.color}
          roughness={material.roughness}
          metalness={material.metalness}
          transmission={material.transmission}
          thickness={material.thickness}
          transparent
          opacity={material.opacity}
          side={THREE.DoubleSide}
        />
      ) : (
        <meshStandardMaterial
          color={material.color}
          roughness={material.roughness}
          metalness={material.metalness}
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  )
}

function App() {
  const meshRef = useRef<THREE.Mesh>(null)
  const [params, setParams] = useState({
    height: 15,
    controlPoints: [
      { h: 0, r: 3 },    // Base
      { h: 0.3, r: 5 },  // Lower body
      { h: 0.7, r: 4 },  // Upper body
      { h: 1, r: 2.5 }   // Top
    ] as ControlPoint[],
    segments: 64,
    wallThickness: 0.4,
    twist: 0,
    ribs: 0,
    ribAmplitude: 0.2,
    rings: 0,
    ringAmplitude: 0.2,
    materialKey: 'clay'
  })

  const updateParam = (key: string, val: string | number) => {
    setParams(prev => ({
      ...prev,
      [key]: key === 'materialKey' ? val : (typeof val === 'string' ? parseFloat(val) : val)
    }))
  }

  const updateControlPoint = (index: number, field: keyof ControlPoint, val: string) => {
    const newPoints = [...params.controlPoints]
    newPoints[index] = { ...newPoints[index], [field]: parseFloat(val) }
    setParams(prev => ({ ...prev, controlPoints: newPoints }))
  }

  const addControlPoint = () => {
    const newH = 0.5
    setParams(prev => ({
      ...prev,
      controlPoints: [...prev.controlPoints, { h: newH, r: 4 }].sort((a, b) => a.h - b.h)
    }))
  }

  const removeControlPoint = (index: number) => {
    if (params.controlPoints.length <= 2) return
    const newPoints = params.controlPoints.filter((_, i) => i !== index)
    setParams(prev => ({ ...prev, controlPoints: newPoints }))
  }

  const resetParams = () => setParams({
    height: 15,
    controlPoints: [
      { h: 0, r: 3 },
      { h: 0.3, r: 5 },
      { h: 0.7, r: 4 },
      { h: 1, r: 2.5 }
    ],
    segments: 64,
    wallThickness: 0.4,
    twist: 0,
    ribs: 0,
    ribAmplitude: 0.2,
    rings: 0,
    ringAmplitude: 0.2,
    materialKey: 'clay'
  })

  const takeScreenshot = () => {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      const link = document.createElement('a')
      link.setAttribute('download', 'vase-snapshot.png')
      link.setAttribute('href', canvas.toDataURL('image/png'))
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const exportSTL = () => {
    if (!meshRef.current) return
    const exporter = new STLExporter()
    const result = exporter.parse(meshRef.current) as string | ArrayBuffer
    const blob = new Blob([result], { type: 'model/stl' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'vase-design.stl')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="app-container">
      <div className="canvas-container">
        <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
          <PerspectiveCamera makeDefault position={[10, 20, 30]} fov={35} />
          <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />

          <ambientLight intensity={0.6} />
          <spotLight position={[15, 25, 15]} angle={0.2} penumbra={1} intensity={1.5} castShadow />

          <Vase
            {...params}
            material={MATERIAL_PRESETS[params.materialKey]}
            meshRef={meshRef}
          />

          <Environment preset="studio" />
          <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={20} blur={2.5} far={4.5} />

          <gridHelper args={[30, 30, 0x444444, 0x222222]} position={[0, 0, 0]} />
        </Canvas>
      </div>

      <aside className="sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Box size={24} />
            Vase Creator
          </h1>
          <button className="secondary" onClick={resetParams} title="Reset">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="control-group">
          <div className="control-label">
            <span>Material Preset</span>
          </div>
          <div className="material-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '0.5rem' }}>
            {Object.entries(MATERIAL_PRESETS).map(([key, mat]) => (
              <button
                key={key}
                className={`material-button ${params.materialKey === key ? 'active' : ''}`}
                onClick={() => updateParam('materialKey', key)}
                title={mat.name}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: params.materialKey === key ? '2px solid #fff' : '2px solid transparent',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10px'
                }}
              >
                <div style={{ width: '100%', paddingTop: '100%', borderRadius: '4px', background: mat.color }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{mat.name.split(' ')[1] || mat.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

        <div className="control-group">
          <div className="control-label">
            <span>Overall Height</span>
            <span>{params.height.toFixed(1)}</span>
          </div>
          <input
            type="range" min="5" max="40" step="0.5"
            value={params.height}
            onChange={(e) => updateParam('height', e.target.value)}
          />
        </div>

        <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

        <div className="control-group">
          <div className="control-label">
            <span>Profile Shape</span>
            <button className="secondary" onClick={addControlPoint} style={{ padding: '2px 8px', fontSize: '12px' }}>
              <Plus size={12} /> Add Point
            </button>
          </div>

          <div className="points-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            {params.controlPoints.map((p, i) => (
              <div key={i} className="point-item" style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '12px', opacity: 0.6 }}>Point {i + 1}</span>
                  {i !== 0 && i !== params.controlPoints.length - 1 && (
                    <button className="secondary" onClick={() => removeControlPoint(i)} style={{ padding: '2px', border: 'none', background: 'transparent' }}>
                      <Trash2 size={12} color="#ff4d4d" />
                    </button>
                  )}
                </div>

                <div className="control-group">
                  <div className="control-label">
                    <span>Radius</span>
                    <span>{p.r.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min="0.1" max="15" step="0.1"
                    value={p.r}
                    onChange={(e) => updateControlPoint(i, 'r', e.target.value)}
                  />
                </div>

                {i !== 0 && i !== params.controlPoints.length - 1 && (
                  <div className="control-group">
                    <div className="control-label">
                      <span>Height Position</span>
                      <span>{(p.h * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range" min="0.05" max="0.95" step="0.01"
                      value={p.h}
                      onChange={(e) => updateControlPoint(i, 'h', e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

        <div className="control-group">
          <div className="control-label">
            <span>Wall Thickness</span>
            <span>{params.wallThickness.toFixed(2)}</span>
          </div>
          <input
            type="range" min="0.1" max="2" step="0.05"
            value={params.wallThickness}
            onChange={(e) => updateParam('wallThickness', e.target.value)}
          />
        </div>

        <div className="control-group">
          <div className="control-label">
            <span>Twist (Spiral)</span>
            <span>{(params.twist / Math.PI).toFixed(2)}π</span>
          </div>
          <input
            type="range" min={-Math.PI * 4} max={Math.PI * 4} step={0.1}
            value={params.twist}
            onChange={(e) => updateParam('twist', e.target.value)}
          />
        </div>

        <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

        <div className="control-group">
          <div className="control-label">
            <span>Vertical Ribs</span>
            <span>{params.ribs}</span>
          </div>
          <input
            type="range" min="0" max="64" step="1"
            value={params.ribs}
            onChange={(e) => updateParam('ribs', e.target.value)}
          />
        </div>

        {params.ribs > 0 && (
          <div className="control-group">
            <div className="control-label">
              <span>Rib Depth</span>
              <span>{params.ribAmplitude.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0.01" max="1" step="0.01"
              value={params.ribAmplitude}
              onChange={(e) => updateParam('ribAmplitude', e.target.value)}
            />
          </div>
        )}

        <div className="control-group">
          <div className="control-label">
            <span>Horizontal Rings</span>
            <span>{params.rings}</span>
          </div>
          <input
            type="range" min="0" max="40" step="1"
            value={params.rings}
            onChange={(e) => updateParam('rings', e.target.value)}
          />
        </div>

        {params.rings > 0 && (
          <div className="control-group">
            <div className="control-label">
              <span>Ring Depth</span>
              <span>{params.ringAmplitude.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0.01" max="1" step="0.01"
              value={params.ringAmplitude}
              onChange={(e) => updateParam('ringAmplitude', e.target.value)}
            />
          </div>
        )}

        <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />

        <div className="control-group">
          <div className="control-label">
            <span>Detail (Segments)</span>
            <span>{params.segments}</span>
          </div>
          <input
            type="range" min="3" max="128" step="1"
            value={params.segments}
            onChange={(e) => updateParam('segments', e.target.value)}
          />
        </div>

        <div className="actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
          <button
            className="export-button"
            onClick={exportSTL}
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              padding: '0.8rem',
              borderRadius: '8px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}
          >
            <Download size={18} />
            Export STL
          </button>

          <button
            className="secondary-button"
            onClick={takeScreenshot}
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '0.6rem',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Camera size={18} />
            Save Image (PNG)
          </button>

          <button
            className="text-button"
            onClick={resetParams}
            style={{
              background: 'none',
              color: 'rgba(255,255,255,0.4)',
              border: 'none',
              padding: '0.4rem',
              fontSize: '12px',
              cursor: 'pointer',
              textDecoration: 'underline',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <RefreshCw size={12} />
            Reset Design
          </button>
        </div>
      </aside>
    </div>
  )
}

export default App
