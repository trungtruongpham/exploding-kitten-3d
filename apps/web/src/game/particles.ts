import * as THREE from 'three';

/** Points with per-particle size and fading alpha, for sparks, confetti, soot and smoke. */
export class Particles {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private i = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private g: Float32Array;
  private drag: Float32Array;
  private a0: Float32Array;
  private geo: THREE.BufferGeometry;

  constructor(private max: number, additive: boolean) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.g = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader:
        'attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float uScale; void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader:
        'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); if(d > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.25, d)); }',
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, color: string, life: number, s0: number, s1: number, g = -3.5, drag = 0.97, a = 1) {
    const i = this.i;
    this.i = (i + 1) % this.max;
    const c = new THREE.Color(color);
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([c.r, c.g, c.b, a], i * 4);
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.g[i] = g;
    this.drag[i] = drag;
    this.a0[i] = a;
    this.size[i] = s0;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - Math.max(this.life[i], 0) / this.maxLife[i];
      const dr = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3 + 1] += this.g[i] * dt;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= dr;
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      this.size[i] = this.life[i] <= 0 ? 0 : this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.col[i * 4 + 3] = this.a0[i] * (1 - k * k);
    }
    for (const name of ['position', 'rgba', 'size']) this.geo.attributes[name].needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
