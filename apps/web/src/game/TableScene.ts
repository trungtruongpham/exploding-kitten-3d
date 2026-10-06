import * as THREE from 'three';
import type { CardType, ClientView, GameEvent } from '@meobom/engine';
import { T } from '../i18n';
import { backTexture, faceTexture } from './cardArt';
import { Particles } from './particles';
import { buildRoom, makeCat, makePaw, SEAT_STYLE, type CatParts } from './props';

/**
 * The 3D table. React owns the HUD and hands this class each server update; it diffs the cards it
 * knows by id, flies new ones in from where the events say they came from, and plays the effects.
 */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CW = 0.62;
const CH = 0.88;
const GAP = 0.0025;
const DECK_T = 0.0085;
const DECK_POS = V(-0.52, 0, 0.2);
const DISC_POS = V(0.56, 0, 0.2);
const HAND_DIST = 2.4;
const UP = V(0, 1, 0);
const Q_FACEUP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const Q_FACEDOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const qFlat = (up: boolean, yaw: number) => new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(up ? Q_FACEUP : Q_FACEDOWN);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rvec = (s: number) => V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(s);
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h % 1000) / 1000;
};
const deckTopY = (n: number) => 0.004 + n * DECK_T;
const CONFETTI = ['#ffb547', '#ff5b3d', '#4fc3f7', '#7ed957', '#ff6fa8', '#b48cff', '#fff4e2'];

type Loc =
  | { k: 'hand'; i: number; n: number }
  | { k: 'discard'; i: number }
  | { k: 'reveal'; player: string }
  | { k: 'peek'; i: number }
  | { k: 'leaving'; pos: THREE.Vector3; q: THREE.Quaternion; scale: number; world: true };

interface CardObj {
  id: string;
  type: CardType;
  mesh: THREE.Group;
  loc: Loc;
  delay: number;
}

interface Seat {
  id: string;
  rel: number;
  angle: number;
  cat: (THREE.Group & { userData: CatParts }) | null;
  fan: THREE.Group;
  fanCount: number;
  label: HTMLDivElement | null;
  count: HTMLElement | null;
  alive: boolean;
}

export type Pick = { kind: 'card'; id: string } | { kind: 'deck' } | { kind: 'seat'; id: string };

interface Tween {
  t: number;
  dur: number;
  fn: (e: number) => void;
  res: () => void;
}
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class TableScene {
  private root = new THREE.Group();
  private hand = new THREE.Group();
  private cards = new Map<string, CardObj>();
  private seats = new Map<string, Seat>();
  private seatOrder: string[] = [];
  private tweens: Tween[] = [];
  private glow = new Particles(900, true);
  private debris = new Particles(900, false);
  private deck: THREE.Mesh;
  private edgeTex: THREE.CanvasTexture;
  private ring: THREE.Mesh;
  private ringLight: THREE.PointLight;
  private paw = makePaw();
  private planeGeo = new THREE.PlaneGeometry(CW, CH);
  private backMat: THREE.MeshStandardMaterial;
  private faceMats = new Map<CardType, THREE.MeshStandardMaterial>();
  private ray = new THREE.Raycaster();
  private ringAngle = Math.PI / 2;
  private ringTarget = Math.PI / 2;
  private yaw = 0;
  private pitch = 0;
  private yawT = 0;
  private pitchT = 0;
  private dragging = false;
  private camR = 6.8;
  private camPitch = 0.52;
  private visH = 2;
  private visW = 3.5;
  private shake = 0;
  private time = 0;
  private you: string | null = null;
  private view: ClientView | null = null;
  private selected = new Set<string>();
  private hovered: string | null = null;
  private targetable = new Set<string>();
  private deckCount = 0;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private labelsEl: HTMLElement,
    private aniso: number,
    private reduceMotion: boolean,
  ) {
    scene.background = new THREE.Color('#140e0c');
    scene.fog = new THREE.Fog('#140e0c', 11, 22);
    scene.add(this.root);
    scene.add(camera);
    camera.add(this.hand);

    // three r155+ uses physical light units, so the sample's intensities are scaled by π
    this.root.add(new THREE.HemisphereLight('#ffd9a8', '#2a1a14', 0.32 * Math.PI));
    this.root.add(new THREE.AmbientLight('#ffe2c0', 0.08 * Math.PI));
    const lamp = new THREE.SpotLight('#ffd49c', 1.25 * Math.PI, 0, 0.62, 0.6, 0);
    lamp.position.set(0, 7.5, 0.6);
    lamp.target.position.set(0, 0, 0.2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.0004;
    this.root.add(lamp, lamp.target);

    this.root.add(buildRoom());

    this.backMat = new THREE.MeshStandardMaterial({ map: backTexture(aniso), alphaTest: 0.5, roughness: 0.55 });
    this.edgeTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const x = c.getContext('2d')!;
      x.fillStyle = '#efe2c8';
      x.fillRect(0, 0, 4, 4);
      x.fillStyle = '#b9a07a';
      x.fillRect(0, 3, 4, 1);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const edge = new THREE.MeshStandardMaterial({ map: this.edgeTex, roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: backTexture(aniso), roughness: 0.55 });
    this.deck = new THREE.Mesh(new THREE.BoxGeometry(CW, 1, CH), [edge, edge, top, edge, edge, edge]);
    this.deck.castShadow = this.deck.receiveShadow = true;
    this.deck.position.copy(DECK_POS);
    this.deck.rotation.y = -0.08;
    this.root.add(this.deck);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.028, 10, 48), new THREE.MeshBasicMaterial({ color: '#ffb547' }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);
    this.ringLight = new THREE.PointLight('#ffb547', 0.9 * Math.PI, 2.6, 0);
    this.root.add(this.ringLight);

    this.root.add(this.glow.points, this.debris.points, this.paw);
    this.setDeckCount(0);
  }

  /* ---------------- sizing + camera ---------------- */

  setViewport(w: number, h: number, drawingBufferHeight: number) {
    const aspect = w / h;
    if (aspect < 0.8) [this.camera.fov, this.camR, this.camPitch] = [62, 9.4, 0.72];
    else if (aspect < 1.2) [this.camera.fov, this.camR, this.camPitch] = [52, 8, 0.6];
    else [this.camera.fov, this.camR, this.camPitch] = [45, 6.8, 0.52];
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.visH = 2 * HAND_DIST * Math.tan((this.camera.fov * Math.PI) / 360);
    this.visW = this.visH * aspect;
    const scale = drawingBufferHeight / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.glow.material.uniforms.uScale.value = this.debris.material.uniforms.uScale.value = scale;
  }

  dragBy(dx: number, dy: number, start: { yaw: number; pitch: number }) {
    this.dragging = true;
    this.yawT = Math.max(-0.7, Math.min(0.7, start.yaw - dx * 0.004));
    this.pitchT = Math.max(-0.25, Math.min(0.35, start.pitch + dy * 0.003));
  }
  dragStart() {
    return { yaw: this.yawT, pitch: this.pitchT };
  }
  dragEnd() {
    this.dragging = false;
  }

  /* ---------------- interaction ---------------- */

  setSelection(ids: string[]) {
    this.selected = new Set(ids);
  }
  setHover(id: string | null) {
    this.hovered = id;
  }
  setTargetable(ids: string[]) {
    this.targetable = new Set(ids);
    this.refreshLabels();
  }

  pick(ndcX: number, ndcY: number): Pick | null {
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    if (this.targetable.size) {
      const objs: THREE.Object3D[] = [];
      for (const s of this.seats.values()) if (this.targetable.has(s.id)) [s.cat, s.fan].forEach((o) => o && objs.push(o));
      const hit = this.ray.intersectObjects(objs, true)[0];
      if (hit) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData.seatId) o = o.parent;
        if (o) return { kind: 'seat', id: o.userData.seatId as string };
      }
      return null;
    }
    const hit = this.ray.intersectObjects(this.hand.children, true)[0];
    if (hit) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.cardId) o = o.parent;
      if (o) return { kind: 'card', id: o.userData.cardId as string };
    }
    if (this.deck.visible && this.ray.intersectObject(this.deck, false)[0]) return { kind: 'deck' };
    return null;
  }

  /* ---------------- cards ---------------- */

  private makeCard(type: CardType, faceVisible = true): THREE.Group {
    let fm = this.faceMats.get(type);
    if (!fm) {
      fm = new THREE.MeshStandardMaterial({ map: faceTexture(type, this.aniso), alphaTest: 0.5, roughness: 0.55 });
      this.faceMats.set(type, fm);
    }
    const g = new THREE.Group();
    const f = new THREE.Mesh(this.planeGeo, fm);
    f.position.z = GAP;
    f.castShadow = true;
    f.visible = faceVisible;
    const b = new THREE.Mesh(this.planeGeo, this.backMat);
    b.position.z = -GAP;
    b.rotation.y = Math.PI;
    b.castShadow = true;
    g.add(f, b);
    return g;
  }

  private deckSpawn(): { pos: THREE.Vector3; q: THREE.Quaternion; scale: number } {
    return { pos: DECK_POS.clone().setY(deckTopY(this.deckCount + 1) + 0.02), q: qFlat(false, -0.08), scale: 1 };
  }

  private fanSpawn(playerId: string): { pos: THREE.Vector3; q: THREE.Quaternion; scale: number } {
    const s = this.seats.get(playerId);
    if (!s) return this.deckSpawn();
    return { pos: s.fan.localToWorld(V(0, 0.06, 0.28)), q: Q_FACEDOWN.clone(), scale: 0.62 };
  }

  private ghost(from: { pos: THREE.Vector3; q: THREE.Quaternion; scale: number }, to: { pos: THREE.Vector3; q: THREE.Quaternion; scale: number }, delay = 0, dur = 0.55) {
    const g = this.makeCard('snip', false);
    g.position.copy(from.pos);
    g.quaternion.copy(from.q);
    g.scale.setScalar(from.scale);
    g.visible = false;
    this.root.add(g);
    void this.wait(delay).then(() => {
      g.visible = true;
      return this.tween(dur, (e) => {
        g.position.lerpVectors(from.pos, to.pos, e);
        g.position.y += Math.sin(e * Math.PI) * 0.5;
        g.quaternion.copy(from.q).slerp(to.q, e);
        g.scale.setScalar(from.scale + (to.scale - from.scale) * e);
      });
    }).then(() => this.root.remove(g));
  }

  /* ---------------- seats ---------------- */

  private seatAngle(rel: number, n: number) {
    // you sit at the near edge; everyone else spreads across the far arc so all stay in view
    return rel === 0 ? Math.PI / 2 : Math.PI + (Math.PI * rel) / n;
  }

  private rebuildSeats(view: ClientView) {
    for (const s of this.seats.values()) {
      if (s.cat) this.root.remove(s.cat);
      this.root.remove(s.fan);
      s.label?.remove();
    }
    this.seats.clear();
    const n = view.players.length;
    const me = Math.max(0, view.players.findIndex((p) => p.id === view.you));
    view.players.forEach((p, i) => {
      const rel = (i - me + n) % n;
      const angle = this.seatAngle(rel, n);
      const dir = V(Math.cos(angle), 0, Math.sin(angle));
      const style = SEAT_STYLE[i % SEAT_STYLE.length];
      const fan = new THREE.Group();
      fan.position.copy(dir.clone().multiplyScalar(2.75)).setY(0.01);
      fan.lookAt(0, 0.01, 0);
      fan.userData.seatId = p.id;
      this.root.add(fan);
      let cat: Seat['cat'] = null;
      let label: HTMLDivElement | null = null;
      let count: HTMLElement | null = null;
      if (p.id !== view.you) {
        cat = makeCat(style.fur, style.accent);
        cat.position.copy(dir.clone().multiplyScalar(3.95)).setY(-0.62);
        cat.lookAt(0, -0.62, 0);
        cat.userData.seatId = p.id;
        this.root.add(cat);
        label = document.createElement('div');
        label.className = 'plabel';
        const dot = document.createElement('i');
        dot.style.background = style.accent;
        const nm = document.createElement('span');
        nm.textContent = p.name;
        count = document.createElement('em');
        label.append(dot, nm, count);
        this.labelsEl.append(label);
      }
      this.seats.set(p.id, { id: p.id, rel, angle, cat, fan, fanCount: -1, label, count, alive: p.alive });
    });
    this.seatOrder = view.players.map((p) => p.id);
  }

  private rebuildFan(s: Seat, count: number) {
    if (s.fanCount === count) return;
    s.fanCount = count;
    while (s.fan.children.length) s.fan.remove(s.fan.children[0]);
    if (s.id === this.you) return;
    const k = Math.min(count, 10);
    for (let j = 0; j < k; j++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (j - (k - 1) / 2) * 0.13;
      const c = this.makeCard('snip', false);
      c.scale.setScalar(0.62);
      c.position.set(0, j * 0.004, 0.28);
      c.quaternion.copy(Q_FACEDOWN);
      pivot.add(c);
      s.fan.add(pivot);
    }
  }

  private refreshLabels() {
    const v = this.view;
    if (!v) return;
    for (const p of v.players) {
      const s = this.seats.get(p.id);
      if (!s?.label || !s.count) continue;
      s.count.textContent = p.alive ? T.cards(p.handCount) : T.out;
      s.label.classList.toggle('turn', v.turn === p.id && p.alive && v.phase.kind !== 'over');
      s.label.classList.toggle('out', !p.alive);
      s.label.classList.toggle('target', this.targetable.has(p.id));
      s.label.classList.toggle('bot', p.isBot);
    }
  }

  private setDeckCount(n: number) {
    this.deckCount = n;
    const h = Math.max(n * DECK_T, 0.001);
    this.deck.scale.y = h;
    this.deck.position.y = h / 2 + 0.004;
    this.deck.visible = n > 0;
    this.edgeTex.repeat.set(1, Math.max(n, 1));
  }

  /* ---------------- the update ---------------- */

  sync(view: ClientView, events: GameEvent[]) {
    const prev = this.view;
    this.you = view.you;
    const idsChanged = !prev || prev.players.map((p) => p.id).join() !== view.players.map((p) => p.id).join() || events.some((e) => e.kind === 'dealt');
    if (idsChanged) {
      this.rebuildSeats(view);
      if (events.some((e) => e.kind === 'dealt')) {
        for (const c of this.cards.values()) this.root.remove(c.mesh), this.hand.remove(c.mesh);
        this.cards.clear();
        this.glow.clear();
        this.debris.clear();
      }
    }
    this.view = view;

    type Spot = { pos: THREE.Vector3; q: THREE.Quaternion; scale: number };
    const origin = new Map<string, Spot>();
    const dest = new Map<string, Spot>();
    let explodedSeat: string | null = null;
    const deckSpot = (): Spot => this.deckSpawn();

    for (const e of events) {
      switch (e.kind) {
        case 'dealt':
          for (const pid of e.players) if (pid !== view.you) for (let k = 0; k < 4; k++) this.ghost(deckSpot(), this.fanSpawn(pid), k * 0.12 + this.seatIndex(pid) * 0.04, 0.45);
          break;
        case 'drew':
          if (e.card) origin.set(e.card.id, deckSpot());
          else this.ghost(deckSpot(), this.fanSpawn(e.player));
          break;
        case 'fuseDrawn':
          origin.set(e.card.id, deckSpot());
          this.flinchAll();
          break;
        case 'played':
          if (e.actor !== view.you) {
            e.cards.forEach((c) => origin.set(c.id, this.fanSpawn(e.actor)));
            this.leap(e.actor, e.type === 'pounce');
          }
          break;
        case 'hissed':
          if (e.player !== view.you) origin.set(e.card.id, this.fanSpawn(e.player));
          void this.wait(0.35).then(() => this.swat(e.player));
          break;
        case 'defused': {
          if (e.player !== view.you) origin.set(e.card.id, this.fanSpawn(e.player));
          this.sparking = false;
          const fuse = [...this.cards.values()].find((c) => c.loc.k === 'reveal');
          const at = fuse ? fuse.mesh.localToWorld(V(CW * 0.18, CH * 0.42, 0.05)) : V(0, 1, 0);
          for (let k = 0; k < 40; k++) this.debris.spawn(at, rvec(0.8).add(V(0, 0.9, 0)), pick(['#8d8a86', '#b7b2aa', '#6b6763']), 1.4, 0.12, 0.5, 0.3, 0.95, 0.55);
          break;
        }
        case 'inserted': {
          const n = view.deckCount;
          const fromTop = e.position ?? Math.floor(Math.random() * n);
          dest.set(e.cardId, { pos: DECK_POS.clone().setY(deckTopY(n - fromTop)), q: qFlat(false, -0.08), scale: 1 });
          break;
        }
        case 'exploded':
          explodedSeat = e.player;
          this.explode(e.player, e.cardId);
          break;
        case 'gave':
          if (e.to === view.you && e.card) origin.set(e.cardId, this.fanSpawn(e.from));
          else if (e.from === view.you) dest.set(e.cardId, this.fanSpawn(e.to));
          else this.ghost(this.fanSpawn(e.from), this.fanSpawn(e.to));
          break;
        case 'shuffled':
          this.wobbleDeck();
          break;
        case 'win':
          this.celebrate(e.player);
          break;
        default:
          break;
      }
    }

    // where each known card should be now
    const want = new Map<string, { type: CardType; loc: Loc }>();
    view.hand.forEach((c, i) => want.set(c.id, { type: c.type, loc: { k: 'hand', i, n: view.hand.length } }));
    view.discard.forEach((c, i) => want.set(c.id, { type: c.type, loc: { k: 'discard', i } }));
    if (view.phase.kind === 'defuse' || view.phase.kind === 'placeFuse') {
      want.set(view.phase.card.id, { type: 'fuse', loc: { k: 'reveal', player: view.phase.player } });
    }
    this.sparking = view.phase.kind === 'defuse';

    for (const [id, c] of this.cards) {
      if (id.startsWith('peek:') || id.startsWith('gone:')) continue;
      if (want.has(id)) continue;
      const d = dest.get(id);
      if (d) c.loc = { k: 'leaving', pos: d.pos, q: d.q, scale: d.scale, world: true };
      else {
        c.mesh.parent?.remove(c.mesh);
        this.cards.delete(id);
      }
    }
    let stagger = 0;
    for (const [id, w] of want) {
      const existing = this.cards.get(id);
      if (existing) {
        existing.loc = w.loc;
        continue;
      }
      const from = origin.get(id) ?? (explodedSeat && w.loc.k === 'discard' ? this.fanSpawn(explodedSeat) : deckSpot());
      const mesh = this.makeCard(w.type);
      mesh.userData.cardId = id;
      mesh.position.copy(from.pos);
      mesh.quaternion.copy(from.q);
      mesh.scale.setScalar(from.scale);
      this.root.add(mesh);
      const isDeal = events.some((e) => e.kind === 'dealt') || !prev;
      this.cards.set(id, { id, type: w.type, mesh, loc: w.loc, delay: isDeal && w.loc.k === 'hand' ? 0.25 + stagger++ * 0.08 : 0 });
    }

    for (const p of view.players) {
      const s = this.seats.get(p.id);
      if (!s) continue;
      this.rebuildFan(s, p.alive ? p.handCount : 0);
      if (s.alive && !p.alive && s.cat && !events.some((e) => e.kind === 'exploded' && e.player === p.id)) s.cat.visible = false;
      s.alive = p.alive;
    }
    const turnSeat = this.seats.get(view.turn);
    if (turnSeat) this.ringTarget = turnSeat.angle;
    (this.ring.material as THREE.MeshBasicMaterial).color.set(view.pending > 1 ? '#ff5b3d' : '#ffb547');
    this.ringLight.color.copy((this.ring.material as THREE.MeshBasicMaterial).color);
    this.ring.visible = view.phase.kind !== 'over';
    this.setDeckCount(view.deckCount);
    this.refreshLabels();
  }

  private sparking = false;

  private seatIndex(id: string) {
    return Math.max(0, this.seatOrder.indexOf(id));
  }

  /** Shows the three Peek cards in front of you; they slide back into the deck on hidePeek(). */
  showPeek(top: CardType[]) {
    this.hidePeek();
    top.forEach((t, i) => {
      const mesh = this.makeCard(t);
      const s = this.deckSpawn();
      mesh.position.copy(s.pos);
      mesh.quaternion.copy(s.q);
      this.root.add(mesh);
      this.cards.set(`peek:${i}`, { id: `peek:${i}`, type: t, mesh, loc: { k: 'peek', i }, delay: i * 0.1 });
    });
  }
  hidePeek() {
    const peeks = [...this.cards].filter(([id]) => id.startsWith('peek:'));
    for (const [id, c] of peeks) {
      const s = this.deckSpawn();
      c.loc = { k: 'leaving', pos: s.pos, q: s.q, scale: 1, world: true };
      this.cards.delete(id);
      this.cards.set(`gone:${id}:${Math.random()}`, c);
    }
  }

  /* ---------------- effects ---------------- */

  private tween(dur: number, fn: (e: number) => void): Promise<void> {
    if (this.reduceMotion) dur = Math.min(dur, 0.2);
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn: (e) => fn(easeIO(e)), res }));
  }
  private wait(s: number): Promise<void> {
    return new Promise((res) => this.tweens.push({ t: 0, dur: s, fn: () => {}, res }));
  }

  private flinchAll() {
    for (const s of this.seats.values()) {
      const cat = s.cat;
      if (!cat || !s.alive) continue;
      const s0 = cat.scale.x;
      void this.tween(0.35, (e) => cat.scale.set(s0 * (1 + 0.1 * Math.sin(e * Math.PI)), s0 * (1 - 0.08 * Math.sin(e * Math.PI)), s0));
    }
  }

  private leap(playerId: string, toNext: boolean) {
    const s = this.seats.get(playerId);
    const cat = s?.cat;
    if (!cat) return;
    const p0 = cat.position.clone();
    let dir = V();
    if (toNext) {
      const order = this.seatOrder;
      const nextId = order[(order.indexOf(playerId) + 1) % order.length];
      const nx = this.seats.get(nextId);
      const target = nx?.cat ? nx.cat.position : V(0, -0.62, 6);
      dir = target.clone().sub(p0).normalize().multiplyScalar(0.35);
    }
    void this.tween(0.55, (e) => {
      cat.position.copy(p0).addScaledVector(dir, Math.sin(e * Math.PI));
      cat.position.y = p0.y + Math.sin(e * Math.PI) * 0.55;
    });
  }

  private async swat(hisserId: string) {
    const s = this.seats.get(hisserId);
    const from = hisserId === this.you || !s?.cat ? this.camera.localToWorld(V(0, -0.6, -1.4)) : s.cat.position.clone().add(V(0, 0.9, 0));
    const hit = DISC_POS.clone().add(V(0, 0.18, 0));
    const dir = hit.clone().sub(from).setY(0).normalize();
    const end = hit.clone().add(dir.multiplyScalar(1.1)).add(V(0, 0.5, 0));
    const paw = this.paw;
    paw.visible = true;
    paw.position.copy(from);
    paw.lookAt(hit);
    await this.tween(0.28, (e) => paw.position.lerpVectors(from, hit, e));
    for (let k = 0; k < 14; k++) this.debris.spawn(hit, rvec(1.6).add(V(0, 1.2, 0)), pick(['#fff4e2', '#ffd2a0']), 0.5, 0.07, 0.02, -4);
    await this.tween(0.3, (e) => paw.position.lerpVectors(hit, end, e));
    paw.visible = false;
  }

  private explode(playerId: string, fuseId: string) {
    const fuse = this.cards.get(fuseId);
    const s = this.seats.get(playerId);
    const at = fuse ? fuse.mesh.getWorldPosition(V()) : s?.cat ? s.cat.position.clone().add(V(0, 1.2, 0)) : V(0, 1, 2);
    if (fuse) {
      fuse.mesh.parent?.remove(fuse.mesh);
      this.cards.delete(fuseId);
    }
    this.sparking = false;
    this.shake = this.reduceMotion ? 0 : playerId === this.you ? 1.3 : 0.8;
    for (let k = 0; k < 160; k++) this.debris.spawn(at, rvec(rand(1.5, 5)).add(V(0, 2, 0)), pick(CONFETTI), rand(1.2, 2.4), 0.07, 0.05, -5, 0.97);
    for (let k = 0; k < 60; k++) this.debris.spawn(at, rvec(rand(0.5, 1.8)), pick(['#2a2420', '#3a332e', '#1d1916']), rand(1, 2), 0.3, 0.9, 0.4, 0.94, 0.8);
    for (let k = 0; k < 80; k++) this.glow.spawn(at, rvec(rand(1, 4)), pick(['#ffcf6a', '#ff8a3d', '#fff1c2']), rand(0.3, 0.8), 0.18, 0.02, -2, 0.94);
    const cat = s?.cat;
    if (cat && s) {
      cat.userData.mats.forEach((m) => m.color.set('#2b2622'));
      const p0 = cat.position.clone();
      const out = V(Math.cos(s.angle), 0, Math.sin(s.angle)).multiplyScalar(2.5);
      void this.tween(1.6, (e) => {
        cat.position.set(p0.x + out.x * e, p0.y + Math.sin(e * Math.PI * 0.9) * 3.2 - e * e * 1.5, p0.z + out.z * e);
        cat.rotation.z = e * 8;
        cat.rotation.x = e * 3;
      }).then(() => (cat.visible = false));
    }
  }

  private wobbleDeck() {
    const y0 = this.deck.rotation.y;
    void this.tween(0.6, (e) => (this.deck.rotation.y = y0 + Math.sin(e * Math.PI * 3) * 0.1 * (1 - e)));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const from = this.deckSpawn();
      const out = { pos: DECK_POS.clone().add(V(Math.cos(a) * 0.7, 0.5, Math.sin(a) * 0.7)), q: qFlat(false, a), scale: 1 };
      this.ghost(from, out, 0, 0.3);
      this.ghost(out, from, 0.3, 0.3);
    }
  }

  private celebrate(playerId: string) {
    const cat = this.seats.get(playerId)?.cat;
    if (!cat) {
      for (let k = 0; k < 120; k++) this.debris.spawn(this.camera.localToWorld(V(rand(-1, 1), 1, -3)), rvec(rand(1, 3)), pick(CONFETTI), 2.2, 0.07, 0.05, -2, 0.98);
      return;
    }
    const y0 = cat.position.y;
    void this.tween(1.4, (e) => (cat.position.y = y0 + Math.abs(Math.sin(e * Math.PI * 3)) * 0.4));
  }

  /* ---------------- per frame ---------------- */

  frame(rawDt: number) {
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;

    const list = this.tweens;
    this.tweens = [];
    const keep: Tween[] = [];
    for (const tw of list) {
      tw.t += dt;
      const k = Math.min(tw.t / tw.dur, 1);
      tw.fn(k);
      if (k >= 1) tw.res();
      else keep.push(tw);
    }
    this.tweens = keep.concat(this.tweens);

    // camera
    this.yaw += (this.yawT - this.yaw) * Math.min(1, dt * 6);
    this.pitch += (this.pitchT - this.pitch) * Math.min(1, dt * 6);
    if (!this.dragging) {
      this.yawT *= Math.pow(0.25, dt);
      this.pitchT *= Math.pow(0.25, dt);
    }
    const p = this.camPitch + this.pitch;
    const tgt = V(0, 0, 0.35);
    this.camera.position.set(tgt.x + Math.sin(this.yaw) * this.camR * Math.cos(p), tgt.y + Math.sin(p) * this.camR, tgt.z + Math.cos(this.yaw) * this.camR * Math.cos(p));
    this.camera.lookAt(tgt);
    if (this.shake > 0) {
      this.camera.position.add(rvec(this.shake * 0.12));
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    this.camera.updateMatrixWorld();

    // turn ring
    const da = ((this.ringTarget - this.ringAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.ringAngle += da * Math.min(1, dt * 5);
    this.ring.position.set(Math.cos(this.ringAngle) * 1.8, 0.02, Math.sin(this.ringAngle) * 1.8);
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.04);
    this.ringLight.position.set(this.ring.position.x, 0.6, this.ring.position.z);

    // idle cats
    for (const s of this.seats.values()) {
      if (!s.cat || !s.alive) continue;
      const u = s.cat.userData;
      u.body.scale.y = 1.08 + Math.sin(this.time * 2 + u.phase) * 0.03;
      u.headPivot.rotation.y = Math.sin(this.time * 0.7 + u.phase) * 0.18;
    }

    this.updateCards(dt);

    // fuse sparks
    if (this.sparking) {
      for (const c of this.cards.values()) {
        if (c.loc.k !== 'reveal') continue;
        const tip = c.mesh.localToWorld(V(CW * 0.18, CH * 0.42, 0.04));
        for (let k = 0; k < 4; k++) this.glow.spawn(tip, rvec(rand(0.4, 1.6)).add(V(0, 0.6, 0)), pick(['#ffcf6a', '#ff8a3d', '#fff1c2']), rand(0.2, 0.5), 0.07, 0.01, -3, 0.95);
        if (Math.random() < 0.5) this.debris.spawn(tip, V(rand(-0.1, 0.1), 0.5, rand(-0.1, 0.1)), '#4a4440', 1, 0.05, 0.25, 0.2, 0.96, 0.5);
        c.mesh.rotation.z += (Math.random() - 0.5) * 0.02;
      }
    }
    this.glow.update(dt);
    this.debris.update(dt);
    this.placeLabels();
  }

  private updateCards(dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    const sc = Math.min(0.5, (this.visH * 0.2) / CH);
    const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const tmpQ = new THREE.Quaternion();
    for (const [id, c] of this.cards) {
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      const m = c.mesh;
      let pos: THREE.Vector3;
      let q: THREE.Quaternion;
      let scale = 1;
      let parent: THREE.Object3D = this.root;
      const L = c.loc;
      if (L.k === 'hand') {
        parent = this.hand;
        const off = L.i - (L.n - 1) / 2;
        const spacing = Math.min(CW * sc * 0.82, (this.visW * 0.92 - CW * sc) / Math.max(L.n - 1, 1));
        let y = -this.visH / 2 + CH * sc * 0.56 - off * off * 0.004;
        if (this.selected.has(id)) y += CH * sc * 0.28;
        else if (this.hovered === id) y += CH * sc * 0.12;
        pos = V(off * spacing, y, -HAND_DIST + L.i * 0.004);
        q = tmpQ.setFromEuler(new THREE.Euler(0, 0, -off * 0.035)).clone();
        scale = sc;
      } else if (L.k === 'discard') {
        pos = DISC_POS.clone().add(V((hash(id) - 0.5) * 0.1, 0.006 + L.i * 0.004, (hash(id + 'z') - 0.5) * 0.1));
        q = qFlat(true, (hash(id) - 0.5) * 1);
      } else if (L.k === 'reveal') {
        if (L.player === this.you) pos = this.camera.localToWorld(V(0, 0.12, -2.4));
        else {
          const s = this.seats.get(L.player);
          const a = s ? s.angle : Math.PI / 2;
          pos = V(Math.cos(a) * 1.5, 1.25, Math.sin(a) * 1.5);
        }
        q = camQ.clone();
        if (this.view?.phase.kind === 'placeFuse') {
          // snipped: it settles down toward the deck while its owner picks a spot
          pos.lerp(DECK_POS.clone().add(V(-0.75, 0.4, 0)), 0.6);
        }
      } else if (L.k === 'peek') {
        pos = this.camera.localToWorld(V((L.i - 1) * 0.75, 0.2, -2.6));
        q = camQ.clone();
      } else {
        pos = L.pos;
        q = L.q;
        scale = L.scale;
      }
      if (m.parent !== parent) parent.attach(m);
      m.position.lerp(pos, k);
      m.quaternion.slerp(q, k);
      m.scale.setScalar(m.scale.x + (scale - m.scale.x) * k);
      if (L.k === 'leaving' && m.position.distanceTo(pos) < 0.03) {
        m.parent?.remove(m);
        this.cards.delete(id);
      }
    }
  }

  private placeLabels() {
    const w = this.labelsEl.clientWidth;
    const h = this.labelsEl.clientHeight;
    for (const s of this.seats.values()) {
      if (!s.label || !s.cat) continue;
      const v = s.cat.position.clone().add(V(0, 2.05, 0)).project(this.camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      s.label.style.display = vis ? '' : 'none';
      s.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.camera.remove(this.hand);
    for (const s of this.seats.values()) s.label?.remove();
    this.glow.dispose();
    this.debris.dispose();
  }
}
