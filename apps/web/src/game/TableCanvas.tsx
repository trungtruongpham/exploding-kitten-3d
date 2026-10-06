import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Update } from '../net';
import { TableScene, type Pick } from './TableScene';

interface Props {
  update: Update | null;
  selection: string[];
  targetable: string[];
  onPick: (p: Pick | null) => void;
  onReady: (t: TableScene) => void;
}

const REDUCE = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function Director({ update, selection, targetable, labels, onReady, sceneRef }: Omit<Props, 'onPick'> & { labels: React.RefObject<HTMLDivElement>; sceneRef: React.MutableRefObject<TableScene | null> }) {
  const { scene, camera, gl, size } = useThree();
  useEffect(() => {
    const t = new TableScene(scene, camera as THREE.PerspectiveCamera, labels.current!, gl.capabilities.getMaxAnisotropy(), REDUCE);
    sceneRef.current = t;
    onReady(t);
    return () => {
      t.dispose();
      sceneRef.current = null;
    };
    // the scene lives for the whole game screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    sceneRef.current?.setViewport(size.width, size.height, gl.getDrawingBufferSize(new THREE.Vector2()).y);
  }, [size.width, size.height, gl, sceneRef]);
  useEffect(() => {
    if (update) sceneRef.current?.sync(update.view, update.events);
  }, [update, sceneRef]);
  useEffect(() => sceneRef.current?.setSelection(selection), [selection, sceneRef]);
  useEffect(() => sceneRef.current?.setTargetable(targetable), [targetable, sceneRef]);
  useFrame((_, dt) => sceneRef.current?.frame(dt));
  return null;
}

export function TableCanvas(props: Props) {
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TableScene | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: { yaw: number; pitch: number }; moved: boolean } | null>(null);

  const ndc = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const;
  };

  return (
    <div
      ref={wrap}
      className={`stage${props.targetable.length ? ' targeting' : ''}`}
      onPointerDown={(e) => {
        const t = sceneRef.current;
        if (!t) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, start: t.dragStart(), moved: false };
      }}
      onPointerMove={(e) => {
        const t = sceneRef.current;
        if (!t) return;
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
          if (d.moved) t.dragBy(dx, dy, d.start);
          return;
        }
        if (e.pointerType === 'mouse') {
          const p = t.pick(...ndc(e));
          t.setHover(p?.kind === 'card' ? p.id : null);
          wrap.current!.classList.toggle('pointing', !!p);
        }
      }}
      onPointerUp={(e) => {
        const t = sceneRef.current;
        const d = drag.current;
        drag.current = null;
        t?.dragEnd();
        if (!t || !d || d.moved) return;
        props.onPick(t.pick(...ndc(e)));
      }}
      onPointerCancel={() => {
        drag.current = null;
        sceneRef.current?.dragEnd();
      }}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 45, near: 0.1, far: 60, position: [0, 3.4, 6.6] }} gl={{ antialias: true }}>
        <Director update={props.update} selection={props.selection} targetable={props.targetable} labels={labels} onReady={props.onReady} sceneRef={sceneRef} />
      </Canvas>
      <div className="labels" ref={labels} />
    </div>
  );
}
