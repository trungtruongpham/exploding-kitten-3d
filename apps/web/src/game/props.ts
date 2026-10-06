import * as THREE from 'three';

/** Static set dressing and the cat avatars, built imperatively and mounted into the R3F scene. */

const gradTex = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
export const toon = (c: string) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradTex });

export function buildRoom(): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: '#3b261d', roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  floor.receiveShadow = true;
  g.add(floor);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 13, 12, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: '#2a1914', roughness: 1, side: THREE.BackSide }),
  );
  wall.position.y = 3.5;
  g.add(wall);

  const propMat = new THREE.MeshStandardMaterial({ color: '#4a2f22', roughness: 0.9 });
  const jarColors = ['#6d4a33', '#8a5a3a', '#3f5b44', '#7a6a4a'];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k - 3) * 0.32 - Math.PI / 2;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), propMat);
    const r = 12.4;
    shelf.position.set(Math.cos(a) * r, 2 + (k % 2) * 1.2, Math.sin(a) * r);
    shelf.lookAt(0, shelf.position.y, 0);
    g.add(shelf);
    for (let j = 0; j < 3; j++) {
      const jar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.4 + ((k * 3 + j) % 4) * 0.08, 12),
        new THREE.MeshStandardMaterial({ color: jarColors[(k + j) % 4], roughness: 0.6 }),
      );
      jar.position.copy(shelf.position).add(new THREE.Vector3((j - 1) * 0.6 * Math.cos(a + Math.PI / 2), 0.3, (j - 1) * 0.6 * Math.sin(a + Math.PI / 2)));
      g.add(jar);
    }
  }
  const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const warm = [new THREE.MeshBasicMaterial({ color: '#ffcf7a' }), new THREE.MeshBasicMaterial({ color: '#ff9f5a' })];
  for (let s = 0; s < 3; s++) {
    const a0 = Math.PI * 1.25 + s * 0.55 - Math.PI / 2;
    const a1 = a0 + 0.5;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = a0 + (a1 - a0) * t;
      const b = new THREE.Mesh(bulbGeo, warm[i % 2]);
      b.position.set(Math.cos(a) * 11.6, 5.6 - Math.sin(t * Math.PI) * 0.9, Math.sin(a) * 11.6);
      g.add(b);
    }
  }

  // table
  const feltTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d')!;
    x.fillStyle = '#2f5a4c';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,210' : '120,90,50'},${Math.random() * 0.08})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    x.strokeStyle = 'rgba(255,214,150,.22)';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(256, 256, 215, 0, Math.PI * 2);
    x.stroke();
    x.strokeStyle = 'rgba(255,214,150,.12)';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(256, 256, 200, 0, Math.PI * 2);
    x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const wood = new THREE.MeshStandardMaterial({ color: '#6a3a20', roughness: 0.45, metalness: 0.05 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.12, 0.26, 72), wood);
  rim.position.y = -0.13;
  rim.receiveShadow = rim.castShadow = true;
  g.add(rim);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(3.02, 3.02, 0.02, 72), [wood, new THREE.MeshStandardMaterial({ map: feltTex, roughness: 1 }), wood]);
  felt.position.y = -0.004;
  felt.receiveShadow = true;
  g.add(felt);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 2.2, 32), new THREE.MeshStandardMaterial({ color: '#4f2b18', roughness: 0.6 }));
  leg.position.y = -1.3;
  g.add(leg);

  // a mug of cocoa, because it's a café
  const mug = new THREE.Group();
  const mugMat = new THREE.MeshStandardMaterial({ color: '#e8dccb', roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.3, 20), mugMat);
  body.position.y = 0.15;
  body.castShadow = true;
  mug.add(body);
  const cocoa = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.3 }));
  cocoa.rotation.x = -Math.PI / 2;
  cocoa.position.y = 0.28;
  mug.add(cocoa);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 16), mugMat);
  handle.position.set(0.19, 0.16, 0);
  mug.add(handle);
  mug.position.set(1.75, 0, -1.2);
  g.add(mug);
  return g;
}

export const SEAT_STYLE = [
  { fur: '#e7a35c', accent: '#ffb547' },
  { fur: '#f1ece4', accent: '#4fc3f7' },
  { fur: '#d4843a', accent: '#7ed957' },
  { fur: '#3d3843', accent: '#ff6fa8' },
  { fur: '#9b9ba6', accent: '#b48cff' },
];

export interface CatParts {
  headPivot: THREE.Group;
  body: THREE.Mesh;
  mats: THREE.MeshToonMaterial[];
  phase: number;
}

export function makeCat(fur: string, accent: string): THREE.Group & { userData: CatParts } {
  const g = new THREE.Group() as THREE.Group & { userData: CatParts };
  const mats: THREE.MeshToonMaterial[] = [];
  const m = (c: string) => {
    const mm = toon(c);
    mats.push(mm);
    return mm;
  };
  const furM = m(fur);
  const accM = m(accent);
  const pinkM = m('#f2a0a8');
  const inkM = new THREE.MeshBasicMaterial({ color: '#1a1218' });
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.22, 28), accM);
  g.add(cushion);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), furM);
  body.scale.set(1, 1.08, 0.92);
  body.position.y = 0.55;
  g.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.y = 1.18;
  g.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), furM);
  head.scale.set(1.08, 0.95, 1);
  headPivot.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), furM);
    ear.position.set(s * 0.24, 0.36, -0.02);
    ear.rotation.z = -s * 0.38;
    headPivot.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), pinkM);
    inner.position.set(s * 0.23, 0.33, 0.06);
    inner.rotation.z = -s * 0.38;
    headPivot.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), inkM);
    eye.position.set(s * 0.15, 0.04, 0.35);
    eye.scale.z = 0.6;
    headPivot.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff' }));
    hl.position.set(s * 0.15 + 0.02, 0.07, 0.39);
    headPivot.add(hl);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), furM);
    paw.scale.set(1, 0.7, 1.3);
    paw.position.set(s * 0.22, 0.14, 0.4);
    g.add(paw);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), pinkM);
  nose.position.set(0, -0.06, 0.4);
  headPivot.add(nose);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 24), accM);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.92;
  g.add(collar);
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.065, 8, 20, Math.PI * 1.1), furM);
  tail.position.set(0.18, 0.45, -0.42);
  tail.rotation.set(0, 0.5, 0.3);
  g.add(tail);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.userData = { headPivot, body, mats, phase: Math.random() * 6 };
  return g;
}

export function makePaw(): THREE.Group {
  const g = new THREE.Group();
  const fm = toon('#f6efe6');
  const pm = toon('#f2a0a8');
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), fm);
  pad.scale.set(1, 0.55, 1.25);
  g.add(pad);
  const bean = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), pm);
  bean.position.set(0, -0.08, 0.04);
  bean.scale.y = 0.5;
  g.add(bean);
  for (let t = 0; t < 4; t++) {
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), fm);
    toe.position.set(-0.15 + t * 0.1, -0.02, 0.23 - Math.abs(t - 1.5) * 0.04);
    g.add(toe);
  }
  g.visible = false;
  return g;
}
