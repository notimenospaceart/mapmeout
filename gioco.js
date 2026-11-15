/* MAP ME OUT — into the hole
   Un omino rosa attraversa, in prima persona e in loop, otto ambienti costruiti con il vocabolario delle tavole:
   schermi con cornice bianca, lenti, chip, lastre, semafori, sfere, cavi. Quando incontra un elemento, appare il suo dato.
   Tutto gira nel browser (WebGL2), senza librerie esterne. I dati sono in dati.js (misurati dai file originali). */
(() => {
'use strict';
const DATI = window.MMO_DATI || { loops: [], ops: {}, totale: 0 };
const $ = s => document.querySelector(s);
const cv = $('#gl');
const gl = cv.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) {
  const e = document.createElement('div'); e.id = 'errore';
  e.textContent = 'Questo browser non ha WebGL2: apri il gioco con Safari, Chrome o Brave aggiornati.';
  document.body.appendChild(e); return;
}
const TOCCO = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (TOCCO) document.body.classList.add('tocco');
const WEB = document.documentElement.dataset.web === '1';          // la copia messa online (non quella sul Mac)
// link: «g…» vale 24 ore da quando lo crei, «p…» è il tuo e non scade. È un cancello leggero, non una cassaforte.
const SALE = 'mmo·sposa·1485';
function firma(t) { let h = 2166136261; for (const c of SALE + t) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).padStart(7, '0').slice(0, 5); }
const codice24 = () => { const t = (Math.floor(Date.now() / 36e5) + 24).toString(36); return 'g' + t + firma(t); };
const CODICE_PERENNE = 'p' + firma('perenne');
function linkValido() { const h = location.hash.replace('#', ''); if (h === CODICE_PERENNE) return true; if (h[0] !== 'g' || h.length < 7) return false; const t = h.slice(1, -5); return firma(t) === h.slice(-5) && parseInt(t, 36) * 36e5 > Date.now(); }
// ogni visitatore ha la sua disposizione dello spazio: il suo passaggio è già una variabile
let SEME = 0;
if (WEB) { try { SEME = parseInt(localStorage.getItem('mmo-seme') || '0', 10) || 0; if (!SEME) { SEME = 1 + Math.floor(Math.random() * 9998); localStorage.setItem('mmo-seme', SEME); } } catch (e) { SEME = 1 + Math.floor(Math.random() * 9998); } }

/* ------------------------------------------------------------ numeri */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, mod = (a, n) => ((a % n) + n) % n;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const it = (v, d = 0) => Number(v).toFixed(d).replace('.', ',');
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const Z2 = [0, 0];
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const M4 = {
  id() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; },
  cat(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); },
  tr(x, y, z) { const m = M4.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
  sc(x, y, z) { const m = M4.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
  rx(a) { const m = M4.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
  ry(a) { const m = M4.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
  rz(a) { const m = M4.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; },
  look(e, c, u) {
    let fx = c[0] - e[0], fy = c[1] - e[1], fz = c[2] - e[2], l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let sx = fy * u[2] - fz * u[1], sy = fz * u[0] - fx * u[2], sz = fx * u[1] - fy * u[0]; l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx, m = new Float32Array(16);
    m[0] = sx; m[4] = sy; m[8] = sz; m[1] = ux; m[5] = uy; m[9] = uz; m[2] = -fx; m[6] = -fy; m[10] = -fz; m[15] = 1;
    m[12] = -(sx * e[0] + sy * e[1] + sz * e[2]); m[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); m[14] = fx * e[0] + fy * e[1] + fz * e[2]; return m;
  },
  pt(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; },
  dir(m, d) { return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]]; }
};

/* ------------------------------------------------------------ geometria */
class Geo {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  v(p, n, u, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(u[0], u[1]); this.c.push(clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255), c.length > 3 ? clamp(c[3], 0, 255) : 0); }
  tri(a, b, c, n, col, ua, ub, uc) { this.v(a, n, ua || Z2, col); this.v(b, n, ub || Z2, col); this.v(c, n, uc || Z2, col); }
  quad(a, b, c, d, col, n, uv) {
    if (!n) n = norm(cross(sub(b, a), sub(d, a)));
    const u = uv || [0, 0, 1, 1];
    this.tri(a, b, c, n, col, [u[0], u[1]], [u[2], u[1]], [u[2], u[3]]); this.tri(a, c, d, n, col, [u[0], u[1]], [u[2], u[3]], [u[0], u[3]]);
  }
  box(M, sx, sy, sz, col, cols) {
    const h = [sx / 2, sy / 2, sz / 2];
    const F = [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
               [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]],
               [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]]];
    F.forEach((f, i) => { const q = f.slice(0, 4).map(c => M4.pt(M, [c[0] * h[0], c[1] * h[1], c[2] * h[2]])); this.quad(q[0], q[1], q[2], q[3], (cols && cols[i]) || col, norm(M4.dir(M, f[4]))); });
  }
  disc(M, r, col, segs = 40) {
    const c0 = M4.pt(M, [0, 0, 0]), n = norm(M4.dir(M, [0, 0, 1]));
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, b = (i + 1) / segs * Math.PI * 2;
      this.tri(c0, M4.pt(M, [Math.cos(a) * r, Math.sin(a) * r, 0]), M4.pt(M, [Math.cos(b) * r, Math.sin(b) * r, 0]), n, col,
        [.5, .5], [.5 + .5 * Math.cos(a), .5 + .5 * Math.sin(a)], [.5 + .5 * Math.cos(b), .5 + .5 * Math.sin(b)]);
    }
  }
  anello(M, r0, r1, col, segs = 48) {
    const n = norm(M4.dir(M, [0, 0, 1]));
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, b = (i + 1) / segs * Math.PI * 2, P = (r, t) => M4.pt(M, [Math.cos(t) * r, Math.sin(t) * r, 0]);
      this.quad(P(r0, a), P(r1, a), P(r1, b), P(r0, b), col, n);
    }
  }
  cil(M, r, y0, y1, col, segs = 20, tappi = true) {
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, b = (i + 1) / segs * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const p = [M4.pt(M, [ca * r, y0, sa * r]), M4.pt(M, [cb * r, y0, sb * r]), M4.pt(M, [cb * r, y1, sb * r]), M4.pt(M, [ca * r, y1, sa * r])];
      const na = norm(M4.dir(M, [ca, 0, sa])), nb = norm(M4.dir(M, [cb, 0, sb]));
      this.v(p[0], na, Z2, col); this.v(p[1], nb, Z2, col); this.v(p[2], nb, Z2, col); this.v(p[0], na, Z2, col); this.v(p[2], nb, Z2, col); this.v(p[3], na, Z2, col);
      if (tappi) {
        this.tri(M4.pt(M, [0, y1, 0]), p[3], p[2], norm(M4.dir(M, [0, 1, 0])), col); this.tri(M4.pt(M, [0, y0, 0]), p[1], p[0], norm(M4.dir(M, [0, -1, 0])), col);
      }
    }
  }
  sfera(M, r, col, seg = 28, anelli = 18) {
    const P = (i, j) => { const t = i / anelli * Math.PI, f = j / seg * Math.PI * 2; return [Math.sin(t) * Math.cos(f), Math.cos(t), Math.sin(t) * Math.sin(f)]; };
    for (let i = 0; i < anelli; i++) for (let j = 0; j < seg; j++) {
      const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      const w = q.map(n => M4.pt(M, [n[0] * r, n[1] * r, n[2] * r])), nn = q.map(n => norm(M4.dir(M, n))), uv = q.map(n => [n[0] * .5 + .5, n[1] * .5 + .5]);
      for (const k of [0, 1, 2, 0, 2, 3]) this.v(w[k], nn[k], uv[k], col);
    }
  }
  prisma(M, pts, d, col, colLato) {            // contorno 2D (stellato rispetto al centro) estruso lungo z locale
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const nf = norm(M4.dir(M, [0, 0, 1])), nb = norm(M4.dir(M, [0, 0, -1]));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.tri(M4.pt(M, [cx, cy, d / 2]), M4.pt(M, [a[0], a[1], d / 2]), M4.pt(M, [b[0], b[1], d / 2]), nf, col);
      this.tri(M4.pt(M, [cx, cy, -d / 2]), M4.pt(M, [b[0], b[1], -d / 2]), M4.pt(M, [a[0], a[1], -d / 2]), nb, col);
      this.quad(M4.pt(M, [a[0], a[1], -d / 2]), M4.pt(M, [b[0], b[1], -d / 2]), M4.pt(M, [b[0], b[1], d / 2]), M4.pt(M, [a[0], a[1], d / 2]), colLato || col);
    }
  }
  nastro(pts, y, w, col) {                      // striscia piatta sul pavimento lungo una spezzata [x,z]
    const lato = i => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      return [[pts[i][0] - dz * w / 2, y, pts[i][1] + dx * w / 2], [pts[i][0] + dz * w / 2, y, pts[i][1] - dx * w / 2]];
    };
    for (let i = 0; i < pts.length - 1; i++) { const A = lato(i), B = lato(i + 1); this.quad(A[0], A[1], B[1], B[0], col, [0, 1, 0]); }
  }
}

class Lin {                                     // linee a spessore costante in pixel (il tratto d'inchiostro)
  constructor() { this.a = []; this.b = []; this.s = []; this.c = []; this.w = []; }
  seg(a, b, col, w = 1.4) {
    const al = col.length > 3 ? col[3] : 255;
    for (const s of [[0, -1], [0, 1], [1, 1], [0, -1], [1, 1], [1, -1]]) { this.a.push(a[0], a[1], a[2]); this.b.push(b[0], b[1], b[2]); this.s.push(s[0], s[1]); this.c.push(col[0], col[1], col[2], al); this.w.push(w); }
  }
  poly(pts, col, w, chiusa) { for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1], col, w); if (chiusa) this.seg(pts[pts.length - 1], pts[0], col, w); }
  circ(M, r, col, w, n = 48, a0 = 0, a1 = Math.PI * 2) { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(M4.pt(M, [Math.cos(a) * r, Math.sin(a) * r, 0])); } this.poly(p, col, w, false); }
  rett(M, lw, lh, col, w) { const x = lw / 2, y = lh / 2; this.poly([[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]].map(p => M4.pt(M, p)), col, w, true); }
  box(M, sx, sy, sz, col, w) {
    const h = [sx / 2, sy / 2, sz / 2], c = (i, j, k) => M4.pt(M, [i * h[0], j * h[1], k * h[2]]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { this.seg(c(-1, s, t), c(1, s, t), col, w); this.seg(c(s, -1, t), c(s, 1, t), col, w); this.seg(c(s, t, -1), c(s, t, 1), col, w); }
  }
}

/* ------------------------------------------------------------ programmi */
function compila(vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name] = gl.getUniformLocation(p, inf.name); }
  return { p, u };
}
const PM = compila(`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aU; layout(location=3) in vec4 aC;
uniform mat4 uVP, uM, uNM; out vec3 vN; out vec2 vU; out vec4 vC;
void main(){ vec4 w = uM*vec4(aP,1.); vN = mat3(uNM)*aN; vU = aU; vC = aC; gl_Position = uVP*w; }`,
`#version 300 es
precision highp float;
in vec3 vN; in vec2 vU; in vec4 vC; uniform sampler2D uT; uniform int uModo; uniform vec4 uTinta; uniform vec4 uUV; uniform vec3 uL; out vec4 o;
void main(){
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  float l = dot(n, uL)*.5+.5;
  float sh = mix(1., .58+.5*l, vC.a);
  if(uModo==0){ o = vec4(vC.rgb*uTinta.rgb*sh, 1.); }
  else if(uModo==1){ vec2 uv = vec2(mix(uUV.x,uUV.z,vU.x), mix(uUV.y,uUV.w,vU.y)); o = vec4(texture(uT,uv).rgb*uTinta.rgb*sh, 1.); }
  else if(uModo==2){ vec4 t = texture(uT, vU); o = vec4(t.rgb*vC.rgb, t.a*uTinta.a); }
  else { float r = length(vU*2.-1.); float a = smoothstep(1.,0.,r); o = vec4(vC.rgb*uTinta.rgb, a*a*vC.a*uTinta.a); }
}`);
const PL = compila(`#version 300 es
layout(location=0) in vec3 aA; layout(location=1) in vec3 aB; layout(location=2) in vec2 aS; layout(location=3) in vec4 aC; layout(location=4) in float aW;
uniform mat4 uVP, uM; uniform vec2 uRis; uniform float uDpr; uniform vec2 uAB; out vec4 vC;
void main(){
  vec4 a = uVP*uM*vec4(aA,1.), b = uVP*uM*vec4(aB,1.); vC = aC; float nw = .05;
  if(a.w < nw && b.w < nw){ gl_Position = vec4(2.,2.,2.,1.); return; }
  if(a.w < nw) a = mix(a, b, (nw-a.w)/(b.w-a.w));
  if(b.w < nw) b = mix(b, a, (nw-b.w)/(a.w-b.w));
  vec2 sa = a.xy/a.w*uRis*.5, sb = b.xy/b.w*uRis*.5, d = sb-sa; float l = length(d); d = l > 1e-5 ? d/l : vec2(1.,0.);
  vec4 p = mix(a, b, aS.x);
  vec2 off = (vec2(-d.y, d.x)*aS.y*.5 + d*(aS.x*2.-1.)*.35) * max(aW, .0)*uDpr;
  p.xy += off/(uRis*.5)*p.w; float dd = min(.0025*p.w*p.w, 1.2) + .012; p.z = (uAB.x + uAB.y/max(p.w - dd, .1))*p.w;
  gl_Position = p;
}`, `#version 300 es
precision highp float; in vec4 vC; uniform float uAlfa; out vec4 o; void main(){ o = vec4(vC.rgb, vC.a*uAlfa); }`);

function mkMesh(g) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = (loc, data, size, type, nd) => { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, !!nd, 0, 0); };
  b(0, new Float32Array(g.p), 3, gl.FLOAT); b(1, new Float32Array(g.n), 3, gl.FLOAT); b(2, new Float32Array(g.u), 2, gl.FLOAT); b(3, new Uint8Array(g.c), 4, gl.UNSIGNED_BYTE, true);
  gl.bindVertexArray(null); return { vao, n: g.p.length / 3 };
}
function mkLin(l) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = (loc, data, size, type, nd) => { const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, !!nd, 0, 0); };
  b(0, new Float32Array(l.a), 3, gl.FLOAT); b(1, new Float32Array(l.b), 3, gl.FLOAT); b(2, new Float32Array(l.s), 2, gl.FLOAT); b(3, new Uint8Array(l.c), 4, gl.UNSIGNED_BYTE, true); b(4, new Float32Array(l.w), 1, gl.FLOAT);
  gl.bindVertexArray(null); return { vao, n: l.a.length / 3 };
}
function texDa(src, mip = true, scala = 1) {
  let s = src;
  if (scala !== 1 && src.width) { const c = document.createElement('canvas'); c.width = Math.round(src.width * scala); c.height = Math.round(src.height * scala); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); s = c; }
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); const e = gl.getExtension('EXT_texture_filter_anisotropic'); if (e) gl.texParameterf(gl.TEXTURE_2D, e.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); }
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}

/* ------------------------------------------------------------ forme unitarie (per ciò che si muove o porta un'immagine) */
const BIANCO = [255, 255, 255, 0];
const U = (() => {
  const q = new Geo(); q.quad([-.5, -.5, 0], [.5, -.5, 0], [.5, .5, 0], [-.5, .5, 0], BIANCO, [0, 0, 1]);
  const d = new Geo(); d.disc(M4.id(), .5, BIANCO, 56);
  const c = new Geo(); c.box(M4.id(), 1, 1, 1, [255, 255, 255, 120]);
  const s = new Geo(); s.sfera(M4.id(), 1, [255, 255, 255, 255], 36, 22);
  const cg = new Geo(); cg.cil(M4.id(), 1, -1, 0, [255, 255, 255, 255], 14, true);       // arto: pende dal perno
  const denti = 16, pg = []; for (let k = 0; k < denti; k++) { const da = Math.PI * 2 / denti, a = k * da; for (const [r, f] of [[.86, 0], [.86, .22], [1, .32], [1, .68], [.86, .78]]) pg.push([Math.cos(a + f * da) * r, Math.sin(a + f * da) * r]); }
  const ig = new Geo(); ig.prisma(M4.id(), pg, .07, [255, 255, 255, 40], [225, 225, 225, 40]);
  const il = new Lin(); for (const z of [-.036, .036]) il.poly(pg.map(p => [p[0], p[1], z]), [27, 27, 32], 1.5, true);
  const cl = new Lin(); cl.box(M4.id(), 1, 1, 1, [27, 27, 32], 1.5);
  return { quad: mkMesh(q), disco: mkMesh(d), cubo: mkMesh(c), sfera: mkMesh(s), arto: mkMesh(cg), ingr: mkMesh(ig), ingrL: mkLin(il), cuboL: mkLin(cl), denti };
})();

/* ------------------------------------------------------------ atlante dei testi (chip, didascalie, grafici) */
const ATH = 1024, ATL = document.createElement('canvas'); ATL.width = 2048; ATL.height = ATH; const ax = ATL.getContext('2d');   // un foglio di scritte per ogni ambiente
let atMax = 0;
let atx = 0, aty = 0, atr = 0;
function atlante(w, h, disegna) {
  if (atx + w > 2048) { atx = 0; aty += atr; atr = 0; }
  const x = atx, y = aty; ax.save(); ax.translate(x, y); ax.beginPath(); ax.rect(0, 0, w, h); ax.clip(); disegna(ax, w, h); ax.restore();
  atx += w + 4; atr = Math.max(atr, h + 4);
  atMax = Math.max(atMax, y + h);
  return [x / 2048, 1 - (y + h) / ATH, (x + w) / 2048, 1 - y / ATH];
}
const SANS = '"MMO Sans", Helvetica, Arial, sans-serif', MONO = '"MMO Mono", Menlo, Consolas, monospace';

/* ------------------------------------------------------------ il mondo */
const W = 36, L = 60, T = 1.6, N = 8, Y0 = 0.014, LIMX = W / 2 - 1.7;
const C = { ink: [27, 27, 32], lime: [143, 210, 42], ciano: [63, 200, 224], magenta: [224, 52, 156], rosso: [216, 38, 46], nero: [31, 31, 36], oro: [168, 137, 74],
  mattone: [168, 80, 63], blu: [42, 63, 216], verde: [47, 143, 74], grigio: [154, 154, 154], rosa: [230, 107, 143], salmone: [224, 147, 135], malva: [181, 137, 146], azzurro: [143, 228, 232], oliva: [150, 160, 70] };
const NOMI = { lime: C.lime, ciano: C.ciano, magenta: C.magenta, oliva: C.oliva, verde: C.verde };
const AMB = [
  { nome: 'bianco', bg: [246, 246, 243], ink: [27, 27, 32], alto: 11, ombra: .20 },
  { nome: 'carta', bg: [239, 230, 211], ink: [40, 36, 30], alto: 9, ombra: .20 },
  { nome: 'acqua', bg: [98, 214, 210], ink: [18, 34, 38], alto: 14, ombra: .20 },
  { nome: 'rosa', bg: [207, 169, 165], ink: [30, 24, 28], alto: 10, ombra: .20 },
  { nome: 'notte', bg: [21, 21, 28], ink: [236, 236, 230], alto: 8, ombra: 0 },
  { nome: 'menta', bg: [221, 235, 226], ink: [27, 27, 32], alto: 16, ombra: .18 },
  { nome: 'sposa', bg: [232, 214, 216], pav: [190, 224, 140], soff: [214, 230, 206], ink: [27, 27, 32], alto: 12, ombra: .2 },
  { nome: 'erba', bg: [250, 250, 247], pav: [137, 176, 62], tpav: 'assets/img/erba.jpg', tess: [137, 176, 62], soff: [255, 255, 255], ink: [27, 27, 32], alto: 11, ombra: .22 }
];
const TESS = j => AMB[j].tess || AMB[j].bg;      // il colore con cui un ambiente si riconosce nelle mappe
const BUCHI = [{ cx: 0, hw: 2.2, h: 4.6, arco: false }, { cx: -7, hw: 1.8, h: 3.0, arco: true }, { cx: 8, hw: 2.6, h: 5.0, arco: false },
               { cx: -3, hw: 2.0, h: 2.8, arco: true }, { cx: 10, hw: 1.7, h: 4.0, arco: false }, { cx: -9, hw: 2.4, h: 3.4, arco: true }, { cx: 5, hw: 2.1, h: 3.3, arco: true }, { cx: -5, hw: 2.3, h: 4.2, arco: false }];
const tono = (c, f) => [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255), 0];
const con = (c, a) => [c[0], c[1], c[2], a];
const rigaMis = m => `luce ${m[0]}  bordi ${m[1]}%` + (m[2] != null ? `  tinta ${m[2]}°` : '');

// quali loop in quale ambiente (a rotazione, così ogni ambiente ha tutta la varietà)
const LOOP_AMB = Array.from({ length: N }, () => []);
DATI.loops.forEach((l, i) => LOOP_AMB[i % N].push(i));
const mediaAmb = i => { const ls = LOOP_AMB[i].map(k => DATI.loops[k]); const m = j => ls.length ? Math.round(ls.reduce((s, l) => s + l.mis[j], 0) / ls.length) : 0; return { n: ls.length, luce: m(0), bordi: m(1) }; };

const QUADRI = [
  { amb: 0, lato: 1, z: 41, w: 4.8, h: 6.0, y: 4.5, img: 'assets/img/vivo_0306.jpg', titolo: 'IMG 0306 · vivo', sotto: 'immagine del generatore, 4×5', p: '3072×3840 px' },
  { amb: 0, lato: -1, z: 19, w: 2.7, h: 4.8, y: 3.4, img: 'assets/img/live_09.jpg', vq: 'assets/img/live_09.mp4', titolo: 'LIVE · MapMeOut 9', sotto: 'video del live, in movimento quando sei in questo ambiente', p: '2160×3840 px · 60 fps · 31,2 s' },
  { amb: 1, lato: 1, z: 30, w: 2.7, h: 4.8, y: 3.4, img: 'assets/img/live_10.jpg', vq: 'assets/img/live_10.mp4', titolo: 'LIVE · MapMeOut 10', sotto: 'video del live, in movimento quando sei in questo ambiente', p: '2160×3840 px · 60 fps · 31,2 s' },
  { amb: 2, lato: -1, z: 30, w: 2.7, h: 4.8, y: 7.2, img: 'assets/img/live_06.jpg', vq: 'assets/img/live_06.mp4', titolo: 'LIVE · MapMeOut 6', sotto: 'video del live, in movimento quando sei in questo ambiente', p: '2160×3840 px · 60 fps · 28,7 s' },
  { amb: 3, lato: 1, z: 30, w: 8.0, h: 4.5, y: 4.3, img: 'assets/img/vivo_0333.jpg', titolo: 'IMG 0333 · vivo', sotto: 'immagine del generatore, 16×9', p: '3840×2160 px' },
  { amb: 5, lato: 1, z: 30, w: 3.0, h: 9.0, y: 10.2, img: 'assets/img/ambiente_0327.jpg', titolo: 'IMG 0327 · ambiente', sotto: 'immagine del generatore, 1×3', p: '1280×3840 px' }
];
// i video della cartella «VIDEO DA METTERE SU PARETI» trovano da soli un muro libero
(DATI.pareti || []).forEach((v, j) => {
  const sposa = /sposa/i.test(v.nome), asp = v.w / v.h, h0 = asp < .8 ? 4.8 : asp > 1.2 ? 4.0 : 4.4, w = Math.min(8, h0 * asp), h = w / asp, giro = sposa ? [6] : [4, 1, 7, 3, 5, 0, 2, 6];
  for (let t = 0; t < giro.length; t++) {
    const amb = giro[(j + t) % giro.length];
    for (const z of [30, 14, 46]) for (const lato of [1, -1]) {
      if (QUADRI.some(q => q.fatto === v) || QUADRI.some(q => q.amb === amb && q.lato === lato && Math.abs(q.z - z) < 11)) continue;
      QUADRI.push({ fatto: v, amb, lato, z, w, h, y: (amb === 2 || amb === 5 ? 6.2 : amb === 6 ? 2.7 : 1.1) + h / 2, img: v.img, vq: v.f, titolo: 'VIDEO · ' + v.nome.replace(/ - animata$/, ''), sotto: 'video a parete, in movimento quando sei in questo ambiente', p: `${v.w}×${v.h} px · ${it(v.fps)} fps · ${it(v.dur, 1)} s` });
    }
    if (QUADRI.some(q => q.fatto === v)) break;
  }
});

function profiloBuco(b) {                        // contorno del buco, da in basso a sinistra a in basso a destra
  const p = [[b.cx - b.hw, 0], [b.cx - b.hw, b.h]];
  if (b.arco) { for (let i = 1; i < 14; i++) { const a = Math.PI - i / 14 * Math.PI; p.push([b.cx + Math.cos(a) * b.hw, b.h + Math.sin(a) * b.hw]); } }
  p.push([b.cx + b.hw, b.h], [b.cx + b.hw, 0]); return p;
}
function arrotonda(pts, r, n = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1], d1 = [b[0] - a[0], b[1] - a[1]], d2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(d1[0], d1[1]), l2 = Math.hypot(d2[0], d2[1]);
    if (l1 < 1e-3 || l2 < 1e-3) continue;
    const rr = Math.min(r, l1 / 2, l2 / 2), p1 = [b[0] - d1[0] / l1 * rr, b[1] - d1[1] / l1 * rr], p2 = [b[0] + d2[0] / l2 * rr, b[1] + d2[1] / l2 * rr];
    for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * p1[0] + 2 * u * t * b[0] + t * t * p2[0], u * u * p1[1] + 2 * u * t * b[1] + t * t * p2[1]]); }
  }
  out.push(pts[pts.length - 1]); return out;
}

let TOT_DATI = 0;
function costruisci(i) {
  const A = AMB[i], prima = AMB[mod(i - 1, N)], R = rng(1000 + i * 7919 + SEME * 104729), H = A.alto, ink = A.ink, scuro = i === 4;
  const a = { i, g: new Geo(), ga: new Geo(), go: new Geo(), l: new Lin(), mostre: [], din: [], lampade: [], oggetti: [], solidi: [] };
  const g = a.g, l = a.l, bordo = scuro ? [120, 120, 132] : C.ink;
  ax.clearRect(0, 0, 2048, ATH); atx = aty = atr = 0;
  const rr = (x, y) => x + (y - x) * R(), scegli = arr => arr[Math.floor(R() * arr.length)];
  const ogg = o => { o.id = `${i}:${o.tipo}:${a.oggetti.length}`; o.amb = i; a.oggetti.push(o); TOT_DATI++; return o; };
  const ombra = (x, z, r, f = 1) => { if (A.ombra > 0) a.go.quad([x - r, .008, z + r], [x + r, .008, z + r], [x + r, .008, z - r], [x - r, .008, z - r], [0, 0, 0, 255 * A.ombra * f], [0, 1, 0]); };
  const stelo = (x, z, y1) => l.seg([x, Y0, z], [x, y1, z], ink, 1.3);

  /* --- la stanza: campiture piatte e fili di prospettiva --- */
  const cPav = A.pav ? con(A.pav, 0) : scuro ? tono(A.bg, 1.25) : tono(A.bg, .972), cMuro = tono(A.bg, 1), cSoff = A.soff ? con(A.soff, 0) : scuro ? tono(A.bg, .8) : tono(A.bg, 1.025);
  if (A.tpav) { a.gp = new Geo(); a.gp.quad([-W / 2, 0, 0], [W / 2, 0, 0], [W / 2, 0, L], [-W / 2, 0, L], [255, 255, 255, 0], [0, 1, 0], [0, 0, W / 3, L / 3]); a.tpav = A.tpav; }
  else g.quad([-W / 2, 0, 0], [W / 2, 0, 0], [W / 2, 0, L], [-W / 2, 0, L], cPav, [0, 1, 0]);
  g.quad([-W / 2, H, 0], [W / 2, H, 0], [W / 2, H, L], [-W / 2, H, L], cSoff, [0, -1, 0]);
  g.quad([-W / 2, 0, 0], [-W / 2, 0, L], [-W / 2, H, L], [-W / 2, H, 0], cMuro, [1, 0, 0]);
  g.quad([W / 2, 0, 0], [W / 2, 0, L], [W / 2, H, L], [W / 2, H, 0], cMuro, [-1, 0, 0]);
  const filo = con(ink, 95), filoF = con(ink, 150), e = .03;
  for (const sx of [-1, 1]) for (const y of [e, H - e]) l.seg([sx * (W / 2 - e), y, T / 2], [sx * (W / 2 - e), y, L - T / 2], filoF, 1.2);
  const passo = i === 3 ? 6 : 12;
  for (let z = passo; z < L - 1; z += passo) l.poly([[-W / 2 + e, e, z], [W / 2 - e, e, z], [W / 2 - e, H - e, z], [-W / 2 + e, H - e, z]], filo, 1, true);
  for (const z of [T / 2 + e, L - T / 2 - e]) l.poly([[-W / 2 + e, e, z], [W / 2 - e, e, z], [W / 2 - e, H - e, z], [-W / 2 + e, H - e, z]], filoF, 1.2, true);

  /* --- il muro d'ingresso col suo buco (z = 0) --- */
  const B = BUCHI[i], prof = profiloBuco(B), cDentro = scuro || mod(i - 1, N) === 4 ? [44, 44, 52, 0] : tono([(A.bg[0] + prima.bg[0]) / 2, (A.bg[1] + prima.bg[1]) / 2, (A.bg[2] + prima.bg[2]) / 2], .8);
  const faccia = (z, Ht, col, nz) => {
    g.quad([-W / 2, 0, z], [B.cx - B.hw, 0, z], [B.cx - B.hw, Ht, z], [-W / 2, Ht, z], col, [0, 0, nz]);
    g.quad([B.cx + B.hw, 0, z], [W / 2, 0, z], [W / 2, Ht, z], [B.cx + B.hw, Ht, z], col, [0, 0, nz]);
    for (let k = 1; k < prof.length - 2; k++) g.quad([prof[k][0], prof[k][1], z], [prof[k + 1][0], prof[k + 1][1], z], [prof[k + 1][0], Ht, z], [prof[k][0], Ht, z], col, [0, 0, nz]);
  };
  faccia(T / 2, H, cMuro, 1); faccia(-T / 2, prima.alto, tono(prima.bg, 1), -1);
  for (let k = 0; k < prof.length - 1; k++) g.quad([prof[k][0], prof[k][1], -T / 2], [prof[k + 1][0], prof[k + 1][1], -T / 2], [prof[k + 1][0], prof[k + 1][1], T / 2], [prof[k][0], prof[k][1], T / 2], cDentro);
  l.poly(prof.map(p => [p[0], p[1], T / 2 + .012]), ink, 1.8); l.poly(prof.map(p => [p[0], p[1], -T / 2 - .012]), prima.ink, 1.8);
  for (const sx of [-1, 1]) l.seg([B.cx + sx * B.hw, Y0, -T / 2], [B.cx + sx * B.hw, Y0, T / 2], con(ink, 150), 1.2);
  a.solidi.push([-W / 2, B.cx - B.hw, -T / 2, T / 2], [B.cx + B.hw, W / 2, -T / 2, T / 2]);

  // didascalie accanto al buco: di là (verso questo ambiente) e di qua (verso il precedente)
  const dida = (z, versoPiuZ, j, colInk) => {
    const m = mediaAmb(j), w = 7.2, h = 1.136;
    const uv = atlante(900, 142, (x, cw, ch) => { x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.font = `700 58px ${SANS}`; x.fillText(`AMBIENTE ${j + 1} · ${AMB[j].nome}`, 4, 62); x.font = `400 42px ${MONO}`; x.fillText(`${m.n} tavole  luce ${m.luce}  bordi ${m.bordi}%`, 4, 122); });
    const sin = B.cx <= 0, x0 = sin ? B.cx + B.hw + .9 : B.cx - B.hw - .9 - w, y0 = 1.7;   // x0 = estremo con x minore
    if (versoPiuZ) a.ga.quad([x0 + w, y0, z], [x0, y0, z], [x0, y0 + h, z], [x0 + w, y0 + h, z], con(colInk, 255), [0, 0, -1], uv);
    else a.ga.quad([x0, y0, z], [x0 + w, y0, z], [x0 + w, y0 + h, z], [x0, y0 + h, z], con(colInk, 255), [0, 0, 1], uv);
  };
  dida(-T / 2 - .02, true, i, prima.ink); dida(T / 2 + .02, false, mod(i - 1, N), ink);
  ogg({ tipo: 'buco', x: B.cx, z: 0, y: Math.min(B.h * .62, 3.2), hw: B.hw, r: 0, rt: B.hw + 2.6, titolo: `BUCO ${i + 1}`, sotto: `passaggio verso l'ambiente ${i + 1} · ${A.nome}`,
    righe: [['m', `${it(B.hw * 2, 1)} × ${it(B.h + (B.arco ? B.hw : 0), 1)} m  ${B.arco ? 'ad arco' : 'rettangolare'}`], ['p', `muro spesso ${it(T, 1)} m · ${mediaAmb(i).n} tavole oltre`]] });

  /* --- griglia dei posti --- */
  const B2 = BUCHI[mod(i + 1, N)], xs = [-12, -6, 0, 6, 12], zs = [7, 15, 23, 31, 39, 47, 54];
  let posti = []; zs.forEach((z, zi) => xs.forEach((x, xi) => posti.push({ x, z, xi, zi })));
  const colonna = (cx) => xs.reduce((b, x) => Math.abs(x - cx) < Math.abs(b - cx) ? x : b, xs[0]);
  posti = posti.filter(p => !(p.zi === 0 && p.x === colonna(B.cx)) && !(p.zi === zs.length - 1 && p.x === colonna(B2.cx)));
  for (let k = posti.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1));[posti[k], posti[j]] = [posti[j], posti[k]]; }
  const loops = LOOP_AMB[i], postiM = posti.splice(0, loops.length);
  postiM.sort((p, q) => p.zi - q.zi || (p.zi % 2 ? q.xi - p.xi : p.xi - q.xi));
  const forme = ['tavola', 'lente', 'tavola', 'schermo', 'tavola', 'cubo', 'tavola', 'lente', 'tavola', 'schermo', 'tavola', 'sfera', 'tavola', 'lente', 'tavola'];
  for (let k = forme.length - 1; k > 0; k--) { const j = Math.floor(R() * (k + 1));[forme[k], forme[j]] = [forme[j], forme[k]]; }
  const anelli = [C.lime, C.mattone, C.oro, C.ciano, C.magenta, C.blu];
  const ancore = [[B.cx, 2.2]];
  let nIngr = 0;

  postiM.forEach((p, k) => {
    const li = loops[k], Lp = DATI.loops[li], forma = forme[k % forme.length];
    const x = clamp(p.x + rr(-1.5, 1.5), -LIMX + 1.6, LIMX - 1.6), z = p.z + rr(-2, 2), yaw = Math.PI + rr(-.75, .75), M0 = M4.mul(M4.tr(x, 0, z), M4.ry(yaw));
    const tex = `assets/loop/${Lp.n}.jpg`, fondo = [Lp.fondo[0], Lp.fondo[1], Lp.fondo[2]];
    const cq = [0, 1 - Lp.q[1], 1, 1 - Lp.q[0]], cs = [0, 1 - Lp.s[1], 1, 1 - Lp.s[0]];
    const nn = (v, u = '') => v == null ? '—' : v + u, ar = (v, u = '') => v ? (v[0] === v[1] ? v[0] + u : `${v[0]}–${v[1]}${u}`) : '—';
    const base = (tipo, mis, extra) => ({ tipo, loop: li, x, z, titolo: `${tipo.toUpperCase()} · ${Lp.n}`, sotto: Lp.titolo,
      righe: [['m', rigaMis(mis)], ['m', `contrasto ${nn(Lp.contrasto)}  saturazione ${nn(Lp.sat, '%')}  vuoto ${nn(Lp.vuoto, '%')}`],
        ['c', Lp.colori || []],
        ['p', `nel tempo · luce ${ar(Lp.luce_t)} · bordi ${ar(Lp.bordi_t, '%')} · movimento ${nn(Lp.mov, '%')}`],
        ['p', `operazioni · ${Lp.ops.length ? Lp.ops.join(' → ') : 'nessuna nel nome'}`],
        ['p', `file · ${it(Lp.dur, 2)} s · ${Lp.fotogrammi} fotogrammi · ${Lp.w}×${Lp.h} · ${it(Lp.fps)} fps`],
        ['p', `peso · ${it(Lp.mb, 1)} MB · ${nn(Lp.mbps != null ? it(Lp.mbps, 1) : null, ' Mbit/s')} · entropia ${nn(Lp.entropia != null ? it(Lp.entropia, 2) : null, ' bit')}`],
        ['p', `suono · uno a caso tra ${Math.max(1, SUONI.length - 1)}, ogni volta che ti avvicini${Lp.con_suono ? ' · loop nato con suono' : ''}`]].concat(extra || []) });
    if (forma === 'tavola') {                    // il parallelepipedo verticale: contiene il 2D e lo porta nel 3D
      const yc = 2.42, Mb = M4.mul(M0, M4.tr(0, yc, 0));
      g.box(Mb, 2.4, 4.08, .36, [255, 255, 255, 105]); l.box(Mb, 2.4, 4.08, .36, bordo, 1.5);
      for (const s of [1, -1]) {
        const Mf = M4.cat(M0, M4.tr(0, yc, s * .198), M4.ry(s > 0 ? 0 : Math.PI));
        a.mostre.push({ tex, video: li, forma: 'quad', M: M4.mul(Mf, M4.sc(2.16, 3.84, 1)), uv: [0, 0, 1, 1], fondo });
        l.rett(M4.mul(Mf, M4.tr(0, 0, .004)), 2.16, 3.84, bordo, 1);
      }
      ombra(x, z, 2.0); stelo(x, z, .38);
      ogg(Object.assign(base('tavola', Lp.mis), { y: 3.1, hw: 1.3, r: 1.25, rt: 4.2 }));
    } else if (forma === 'schermo') {            // lo schermo con cornice bianca spessa, piede e tre puntini
      const yc = 2.15, Mb = M4.mul(M0, M4.tr(0, yc, 0));
      g.box(Mb, 2.72, 2.12, .2, [255, 255, 255, 105]); l.box(Mb, 2.72, 2.12, .2, bordo, 1.5);
      const Mf = M4.mul(M0, M4.tr(0, yc, .12));
      a.mostre.push({ tex, video: li, forma: 'quad', M: M4.mul(Mf, M4.sc(2.4, 1.8, 1)), uv: cs, fondo }); l.rett(M4.mul(Mf, M4.tr(0, 0, .004)), 2.4, 1.8, bordo, 1);
      for (let d = 0; d < 3; d++) g.disc(M4.mul(M0, M4.tr(-1.12 + d * .13, yc - .98, .121)), .034, con(C.ink, 0), 12);
      l.seg(M4.pt(M0, [0, yc - 1.06, 0]), M4.pt(M0, [0, Y0, 0]), ink, 3); l.seg(M4.pt(M0, [-.62, Y0, 0]), M4.pt(M0, [.62, Y0, 0]), ink, 3);
      ombra(x, z, 1.5, .8);
      ogg(Object.assign(base('schermo', Lp.miss), { y: 2.5, hw: 1.45, r: 1.2, rt: 4.0 }));
    } else if (forma === 'lente') {              // la lente tonda con anello di colore e alone
      const yc = 2.05, r = 1.05, col = scegli(anelli), Mc = M4.mul(M0, M4.tr(0, yc, 0)), extra = [];
      for (const s of [1, -1]) {
        const Ms = M4.cat(Mc, M4.tr(0, 0, s * .06), M4.ry(s > 0 ? 0 : Math.PI));
        g.anello(Ms, r, r + .17, con(col, 0), 56); l.circ(M4.mul(Ms, M4.tr(0, 0, .004)), r + .17, bordo, 1.4, 64); l.circ(M4.mul(Ms, M4.tr(0, 0, .006)), r, bordo, 1, 64);
        a.mostre.push({ tex, video: li, forma: 'disco', M: M4.cat(Ms, M4.tr(0, 0, .003), M4.sc(r * 2, r * 2, 1)), uv: cq, fondo });
      }
      const q = 2.1; a.go.quad(M4.pt(Mc, [-q, -q, 0]), M4.pt(Mc, [q, -q, 0]), M4.pt(Mc, [q, q, 0]), M4.pt(Mc, [-q, q, 0]), [col[0], col[1], col[2], scuro ? 70 : 60], norm(M4.dir(Mc, [0, 0, 1])));
      if (nIngr < 2 && R() < .5) { nIngr++; const giri = 1.5 + nIngr; a.din.push({ tipo: 'ingr', M: M4.mul(Mc, M4.sc(1.62, 1.62, 1)), vel: giri * Math.PI * 2 / 60 }); extra.push(['p', `ingranaggio · ${U.denti} denti · ${it(giri, 1)} giri al minuto`]); }
      if (R() < (i === 1 ? .9 : .35)) matassa(a, M4.pt(Mc, [0, 0, 0]), 1.9, 70, R, con(scuro ? [200, 200, 200] : [90, 90, 90], 80));
      ombra(x, z, 1.25, .8); stelo(x, z, yc - r - .17);
      ogg(Object.assign(base('lente', Lp.misq, extra), { y: 2.5, hw: 1.3, r: .9, rt: 3.9 }));
    } else if (forma === 'cubo') {
      const s = 1.7, yc = 1.85;
      a.mostre.push({ tex, video: -1, forma: 'cubo', dinM: { t: [x, yc, z], yaw, s, vel: .16 }, uv: cq, fondo, ombre: .45 });
      ombra(x, z, 1.7); stelo(x, z, yc - s / 2);
      ogg(Object.assign(base('cubo', Lp.misq, [['p', `lato ${it(s, 1)} m · un giro ogni ${it(Math.PI * 2 / .16)} s`]]), { y: 2.3, hw: 1.3, r: 1.35, rt: 4.1 }));
    } else {
      const r = .98, yc = 2.0;
      a.mostre.push({ tex, video: -1, forma: 'sfera', dinM: { t: [x, yc, z], yaw, s: r, vel: .22 }, uv: cq, fondo, ombre: 1 });
      ombra(x, z, 1.45); stelo(x, z, yc - r);
      ogg(Object.assign(base('sfera', Lp.misq, [['p', `raggio ${it(r, 2)} m · un giro ogni ${it(Math.PI * 2 / .22)} s`]]), { y: 2.4, hw: 1.05, r: 1.0, rt: 3.9 }));
    }
    ancore.push([x, z]);
  });
  ancore.push([B2.cx, L - 2.2]);

  /* --- i cavi sul pavimento: il disegno diventa terreno; i chip stanno sui collegamenti --- */
  const tubi = [C.verde, C.magenta, C.ciano, C.grigio, C.lime, C.malva];
  const chipOgni = Math.max(2, Math.floor((ancore.length - 1) / 5));
  for (let k = 0; k < ancore.length - 1; k++) {
    const p = ancore[k], q = ancore[k + 1], zxz = Math.abs(q[1] - p[1]) > 2.5 && R() < .7;
    const zm = lerp(p[1], q[1], rr(.35, .65)), xm = lerp(p[0], q[0], rr(.35, .65));
    const sp = zxz ? [p, [p[0], zm], [q[0], zm], q] : [p, [xm, p[1]], [xm, q[1]], q];
    const pl = arrotonda(sp, .9);
    if (k % 3 === 1) { const col = scegli(tubi); g.nastro(pl, .011, .17, con(col, 0)); for (const s of [-1, 1]) l.poly(spostata(pl, s * .085).map(v => [v[0], Y0, v[1]]), ink, 1); }
    else l.poly(pl.map(v => [v[0], Y0, v[1]]), ink, 1.5);
    g.disc(M4.mul(M4.tr(q[0], Y0 + .002, q[1]), M4.rx(-Math.PI / 2)), .11, con(ink, 0), 14);
    if (k % chipOgni === 1 && k < ancore.length - 2) {
      const Ld = DATI.loops[loops[k]], op = Ld && Ld.ops.length ? Ld.ops[k % Ld.ops.length] : null;
      if (op) {
        const A1 = sp[1], A2 = sp[2], cx = (A1[0] + A2[0]) / 2, cz = (A1[1] + A2[1]) / 2;
        if (Math.abs(cx) < LIMX - 1 && cz > 3 && cz < L - 3) chip(cx, cz, op, loops[k - 1] != null ? DATI.loops[loops[k - 1]] : null, Ld);
      }
    }
  }
  function chip(x, z, op, La, Lb) {
    const M = M4.mul(M4.tr(x, .08, z), M4.ry(Math.PI)), lw = 1.9, ld = .8, cc = scuro ? [62, 62, 74, 60] : [31, 31, 36, 60];
    g.box(M, lw, .16, ld, cc); l.box(M, lw, .16, ld, scuro ? [150, 150, 165] : C.ink, 1.2);
    const uv = atlante(380, 160, (c, cw, ch) => { c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; let fs = 66; c.font = `700 ${fs}px ${SANS}`; const t = op.toUpperCase(); while (c.measureText(t).width > cw - 36 && fs > 20) { fs -= 3; c.font = `700 ${fs}px ${SANS}`; } c.fillText(t, cw / 2, ch / 2 + 3); });
    const P = (px, pz) => M4.pt(M, [px, .083, pz]);
    a.ga.quad(P(-lw / 2, ld / 2), P(lw / 2, ld / 2), P(lw / 2, -ld / 2), P(-lw / 2, -ld / 2), [255, 255, 255, 255], [0, 1, 0], uv);
    for (let d = 0; d < 8; d++) { const px = -lw / 2 + .16 + d * (lw - .32) / 7; for (const s of [-1, 1]) l.seg(M4.pt(M, [px, -.066, s * ld / 2]), M4.pt(M, [px, -.066, s * (ld / 2 + .16)]), ink, 2); }
    const qui = loops.map(k => DATI.loops[k]).filter(v => v.ops.includes(op)).map(v => v.n), tot = (DATI.ops[op] || []).length;
    ogg({ tipo: 'chip', x, z, y: .3, hw: 1.0, r: 0, rt: 2.1, titolo: op.toUpperCase(), sotto: `operazione · in ${tot} loop su ${DATI.totale}`,
      righe: [['m', `qui: ${qui.join(' ')}`], ['p', La && Lb ? `sul cavo tra ${La.n} e ${Lb.n}` : 'sul cavo']] });
  }

  /* --- gli altri elementi --- */
  const posto = () => posti.length ? posti.shift() : null;
  for (let k = 0; k < 2; k++) {                  // lastre a parallelogramma coi piedini
    const p = posto(); if (!p) break; const nome = scegli(Object.keys(NOMI)), col = NOMI[nome], x = p.x + rr(-1.5, 1.5), z = p.z + rr(-2, 2), yaw = rr(-.6, .6), q = .46;
    const M = M4.cat(M4.tr(x, q, z), M4.ry(yaw), M4.rx(-Math.PI / 2 + rr(.06, .16))), sh = .34, pts = [[-1.1 - sh, -.56], [1.1 - sh, -.56], [1.1 + sh, .56], [-1.1 + sh, .56]];
    g.prisma(M, pts, .07, con(col, 40), con(tono(col, .8), 40));
    for (const zz of [.036, -.036]) l.poly(pts.map(v => M4.pt(M, [v[0], v[1], zz])), bordo, 1.5, true);
    for (let d = 0; d < 7; d++) { const t = (d + .5) / 7, pp = M4.pt(M, [lerp(pts[0][0], pts[1][0], t), -.56, -.036]); l.seg(pp, [pp[0], pp[1] - .24, pp[2]], bordo, 1.6); }
    ombra(x, z, 1.6, .9);
    ogg({ tipo: 'lastra', x, z, y: .6, hw: 1.5, r: 0, rt: 2.6, titolo: `LASTRA · ${nome}`, sotto: 'parallelogramma con sette piedini',
      righe: [['m', `${hex(col)}  2,2 × 1,1 m`], ['p', `x ${it(x, 1)}  z ${it(z, 1)}  quota ${it(q, 2)} m`]] });
  }
  {                                              // il semaforo: palo, lampada, base ellittica rossa. La luce segue il suono
    const p = posto(); if (p) {
      const x = p.x + rr(-1, 1), z = p.z + rr(-1.5, 1.5), yaw = Math.PI + rr(-.5, .5), M0 = M4.mul(M4.tr(x, 0, z), M4.ry(yaw)), yc = 3.55;
      g.disc(M4.cat(M4.tr(x, .012, z), M4.rx(-Math.PI / 2), M4.sc(1.35, .62, 1)), 1, con(C.rosso, 0), 44); l.circ(M4.cat(M4.tr(x, Y0 + .002, z), M4.rx(-Math.PI / 2), M4.sc(1.35, .62, 1)), 1, C.ink, 1.3, 56);
      l.seg([x, Y0, z], [x, yc - .7, z], scuro ? [200, 200, 205] : C.ink, 4);
      const Mb = M4.mul(M0, M4.tr(0, yc, 0)); g.box(Mb, .52, 1.4, .3, [31, 31, 36, 70]); l.box(Mb, .52, 1.4, .3, scuro ? [150, 150, 165] : C.ink, 1.2);
      for (let d = 0; d < 3; d++) for (const s of [1, -1]) a.lampade.push({ k: d, M: M4.cat(M0, M4.tr(0, yc + .42 - d * .42, s * .154), M4.sc(.3, .3, 1)) });
      ogg({ tipo: 'semaforo', x, z, y: 3.2, hw: .4, r: .35, rt: 3.2, titolo: 'SEMAFORO', sotto: 'la luce segue il suono che attraversa lo spazio', vivo: true, righe: [['m', ''], ['p', 'verde sotto 0,33 · giallo fino a 0,66 · rosso oltre']] });
    }
  }
  {                                              // la bilancia: pesa la luce di due tavole
    const p = posto(); if (p && loops.length > 1) {
      const x = p.x + rr(-1, 1), z = p.z + rr(-1.5, 1.5), yaw = Math.PI + rr(-.5, .5), M0 = M4.mul(M4.tr(x, 0, z), M4.ry(yaw));
      const ia = loops[0], ib = loops[loops.length - 1], LA = DATI.loops[ia], LB = DATI.loops[ib], delta = LA.misq[0] - LB.misq[0], th = clamp(delta / 90, -.28, .28), yb = 3.1, br = 1.5;
      const P = v => M4.pt(M0, v), eA = [-br * Math.cos(th), yb - br * Math.sin(th), 0], eB = [br * Math.cos(th), yb + br * Math.sin(th), 0];   // più luce = piatto più giù
      l.seg(P([0, Y0, 0]), P([0, yb, 0]), ink, 3); l.seg(P(eA), P(eB), ink, 3);
      g.prisma(M4.mul(M0, M4.tr(0, .2, 0)), [[-.34, -.2], [.34, -.2], [0, .2]], .08, con(scuro ? [220, 220, 215] : C.ink, 0));
      g.disc(M4.mul(M0, M4.tr(0, yb, .01)), .07, con(ink, 0), 14);
      [[eA, ia, LA], [eB, ib, LB]].forEach(([e2, li, Lx]) => {
        const yp = e2[1] - 1.25; l.seg(P(e2), P([e2[0] - .46, yp, 0]), ink, 1.2); l.seg(P(e2), P([e2[0] + .46, yp, 0]), ink, 1.2);
        g.disc(M4.cat(M0, M4.tr(e2[0], yp, 0), M4.rx(-Math.PI / 2)), .5, con(C.salmone, 30), 28); l.circ(M4.cat(M0, M4.tr(e2[0], yp + .004, 0), M4.rx(-Math.PI / 2)), .5, bordo, 1.2, 36);
        const Mc = M4.mul(M0, M4.tr(e2[0], yp + .4, 0)); g.anello(Mc, .36, .4, con(C.ink, 0), 36);
        for (const s of [1, -1]) a.mostre.push({ tex: `assets/loop/${Lx.n}.jpg`, video: -1, forma: 'disco', M: M4.cat(Mc, M4.tr(0, 0, s * .01), M4.ry(s > 0 ? 0 : Math.PI), M4.sc(.72, .72, 1)), uv: [0, 1 - Lx.q[1], 1, 1 - Lx.q[0]], fondo: Lx.fondo });
      });
      ombra(x, z, 1.5, .7);
      ogg({ tipo: 'bilancia', x, z, y: 2.6, hw: 2.0, r: .3, rt: 3.4, titolo: `BILANCIA · Δ luce ${delta > 0 ? '+' : ''}${delta}`.replace('-', '−'), sotto: 'pesa la luce di due loop: il piatto più chiaro scende',
        righe: [['m', `${LA.n}: luce ${LA.misq[0]}   ${LB.n}: luce ${LB.misq[0]}`], ['p', `braccio ${it(br * 2, 1)} m · inclinazione ${it(Math.abs(th) * 180 / Math.PI)}°`]] });
    }
  }
  {                                              // il grafico: luce e bordi delle tavole di questo ambiente, in ordine
    const p = posto(); if (p && loops.length > 2) {
      const x = p.x + rr(-1, 1), z = p.z + rr(-1.5, 1.5), yaw = Math.PI + rr(-.5, .5), yc = 2.25, lw = 3.1, lh = 1.94, M = M4.cat(M4.tr(x, yc, z), M4.ry(yaw));
      const vl = loops.map(k => DATI.loops[k].mis[0]), vb = loops.map(k => DATI.loops[k].mis[1]), st = v => ({ min: Math.min(...v), max: Math.max(...v), med: Math.round(v.reduce((s, q) => s + q, 0) / v.length) }), sl = st(vl), sb = st(vb);
      const inkCss = `rgb(${ink.join(',')})`;
      const uv = atlante(640, 400, (c, cw, ch) => {
        c.lineJoin = 'round'; c.lineCap = 'round';
        const curva = (v, mn, mx, col) => { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); v.forEach((q, n) => { const px = 40 + n / (v.length - 1) * (cw - 80), py = ch - 44 - (q - mn) / Math.max(1, mx - mn) * (ch - 150); n ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); c.fillStyle = col; v.forEach((q, n) => { const px = 40 + n / (v.length - 1) * (cw - 80), py = ch - 44 - (q - mn) / Math.max(1, mx - mn) * (ch - 150); c.beginPath(); c.arc(px, py, 4.5, 0, 7); c.fill(); }); };
        curva(vb, sb.min, sb.max, hex(C.lime)); curva(vl, sl.min, sl.max, hex(C.mattone));
        c.font = `400 30px ${MONO}`; c.textBaseline = 'top'; c.fillStyle = hex(C.mattone); c.fillText(`luce ${sl.min}–${sl.max}`, 30, 22); c.fillStyle = scuro ? hex(C.lime) : '#5d9a10'; c.textAlign = 'right'; c.fillText(`bordi ${sb.min}–${sb.max}%`, cw - 30, 22);
        c.strokeStyle = inkCss; c.lineWidth = 3; c.beginPath(); c.moveTo(118, 78); c.lineTo(118, ch - 26); c.stroke();
      });
      const Pm = v => M4.pt(M, v); a.ga.quad(Pm([-lw / 2, -lh / 2, 0]), Pm([lw / 2, -lh / 2, 0]), Pm([lw / 2, lh / 2, 0]), Pm([-lw / 2, lh / 2, 0]), [255, 255, 255, 255], norm(M4.dir(M, [0, 0, 1])), uv);
      l.rett(M, lw, lh, ink, 1.8); stelo(x, z, yc - lh / 2); ombra(x, z, 1.3, .5);
      ogg({ tipo: 'grafico', x, z, y: 2.3, hw: 1.6, r: .3, rt: 3.6, titolo: 'GRAFICO', sotto: `luce e bordi delle ${loops.length} tavole di questo ambiente, in ordine`,
        righe: [['m', `luce   min ${sl.min}  media ${sl.med}  max ${sl.max}`], ['m', `bordi  min ${sb.min}%  media ${sb.med}%  max ${sb.max}%`]] });
    }
  }
  const tinteSfere = scuro ? [[236, 236, 232], [150, 150, 158], [98, 214, 210]] : [[66, 66, 70], [238, 238, 236], [176, 178, 184], [70, 190, 186]];
  for (let k = 0; k < 3; k++) {                  // sfere libere
    const p = posto(); if (!p) break; const x = p.x + rr(-2, 2), z = p.z + rr(-2.5, 2.5), r = rr(.28, .56), y = rr(1.1, 2.9), col = scegli(tinteSfere);
    g.sfera(M4.tr(x, y, z), r, con(col, 255), 26, 16); ombra(x, z, r * 1.9, .9); stelo(x, z, y - r);
    ogg({ tipo: 'sfera libera', x, z, y, hw: r, r: r * .8, rt: 2.4 + r, titolo: 'SFERA', sotto: 'corpo libero, senza immagine', righe: [['m', `raggio ${it(r, 2)} m  quota ${it(y, 2)} m`], ['p', `x ${it(x, 1)}  z ${it(z, 1)}  ${hex(col)}`]] });
  }
  {                                              // l'anello rosso
    const p = posto(); if (p) {
      const x = p.x + rr(-2, 2), z = p.z + rr(-2, 2), y = rr(2.0, 3.2), M = M4.cat(M4.tr(x, y, z), M4.ry(rr(0, 3)));
      g.anello(M, .36, .66, con(C.rosso, 0), 48); l.circ(M, .66, C.ink, 1.4, 48); l.circ(M, .36, C.ink, 1.4, 40); ombra(x, z, .9, .7); stelo(x, z, y - .66);
      ogg({ tipo: 'anello', x, z, y, hw: .7, r: 0, rt: 2.6, titolo: 'ANELLO · rosso', sotto: 'corona circolare sospesa', righe: [['m', `ø ${it(1.32, 2)} m  foro ø ${it(.72, 2)} m`], ['p', `quota ${it(y, 2)} m  ${hex(C.rosso)}`]] });
    }
  }

  /* --- i quadri grandi ai muri --- */
  QUADRI.filter(q => q.amb === i).forEach(q => {
    const x = q.lato * (W / 2 - .09), M = M4.cat(M4.tr(x, q.y, q.z), M4.ry(q.lato > 0 ? -Math.PI / 2 : Math.PI / 2));
    g.box(M4.mul(M, M4.tr(0, 0, -.03)), q.w + .36, q.h + .36, .1, [255, 255, 255, 60]); l.rett(M4.mul(M, M4.tr(0, 0, .058)), q.w + .36, q.h + .36, bordo, 1.5); l.rett(M4.mul(M, M4.tr(0, 0, .058)), q.w, q.h, bordo, 1);
    a.mostre.push({ tex: q.img, vq: q.vq, video: -1, forma: 'quad', M: M4.cat(M, M4.tr(0, 0, .05), M4.sc(q.w, q.h, 1)), uv: [0, 0, 1, 1], fondo: [240, 240, 238], subito: true });
    ogg({ tipo: 'quadro', x: q.lato * (W / 2 - .2), z: q.z, y: Math.min(q.y, 3.2), hw: q.w / 2, r: 0, rt: 6.4, titolo: q.titolo, sotto: q.sotto, righe: [['m', `${it(q.w, 1)} × ${it(q.h, 1)} m al muro`], ['p', q.p]] });
  });

  /* --- segni sul pavimento: croci, mirini, bersagli, frecce, spirali, ruotine --- */
  const libero = () => [rr(-LIMX, LIMX), rr(4, L - 4)];
  for (let k = 0; k < 12; k++) { const [x, z] = libero(); croce(a, x, z, .26, ink, 1.2); }
  for (let k = 0; k < 4; k++) { const [x, z] = libero(), M = M4.mul(M4.tr(x, Y0, z), M4.rx(-Math.PI / 2)); l.circ(M, .34, ink, 1.4, 30); croce(a, x, z, .34, ink, 1.4); }
  for (let k = 0; k < 4; k++) { const [x, z] = libero(), M = M4.mul(M4.tr(x, Y0, z), M4.rx(-Math.PI / 2)); l.circ(M, .3, ink, 1.6, 30); g.disc(M, .13, con(ink, 0), 16); }
  for (let k = 0; k < 4; k++) { const [x, z] = libero(), an = rr(0, 6.28), dx = Math.cos(an), dz = Math.sin(an), t = [x + dx * .9, Y0, z + dz * .9]; l.seg([x, Y0, z], t, ink, 1.5); for (const s of [-1, 1]) l.seg(t, [t[0] - dx * .26 + s * dz * .16, Y0, t[2] - dz * .26 - s * dx * .16], ink, 1.5); }
  for (let k = 0; k < 2; k++) { const [x, z] = libero(), pts = []; for (let n = 0; n <= 60; n++) { const t = n / 60 * Math.PI * 5, r = .06 + n / 60 * .34; pts.push([x + Math.cos(t) * r, Y0, z + Math.sin(t) * r]); } l.poly(pts, ink, 1.6); }
  for (let k = 0; k < 3; k++) { const [x, z] = libero(), pts = [], nd = 9, R0 = .3; for (let n = 0; n < nd; n++) { const da = Math.PI * 2 / nd, t = n * da; for (const [r, f] of [[R0 * .8, 0], [R0 * .8, .25], [R0, .35], [R0, .7], [R0 * .8, .8]]) pts.push([x + Math.cos(t + f * da) * r, Y0, z + Math.sin(t + f * da) * r]); } l.poly(pts, ink, 1.3, true); l.circ(M4.mul(M4.tr(x, Y0, z), M4.rx(-Math.PI / 2)), .1, ink, 1.3, 16); }
  for (const sx of [-1, 1]) for (const z of [3, L - 3]) croce(a, sx * (W / 2 - 1.2), z, .42, ink, 1.4);

  /* --- ciò che ogni ambiente ha di suo --- */
  if (i === 0) {                                 // bianco: un pannello a viti e una carta a quadretti rosa sul pavimento; costellazione in alto
    const rosaG = [226, 178, 198, 255];
    for (let x = -15; x <= 15.01; x += 3) l.seg([x, Y0 - .004, 32], [x, Y0 - .004, 56], rosaG, 1); for (let z = 32; z <= 56.01; z += 3) l.seg([-15, Y0 - .004, z], [15, Y0 - .004, z], rosaG, 1);
    l.poly([[-15, Y0, 32], [15, Y0, 32], [15, Y0, 56], [-15, Y0, 56]], ink, 1.6, true); l.poly([[-15, Y0, 4], [15, Y0, 4], [15, Y0, 28], [-15, Y0, 28]], ink, 1.6, true);
    for (const [x, z] of [[-14, 5], [14, 5], [-14, 27], [14, 27]]) { const M = M4.mul(M4.tr(x, Y0, z), M4.rx(-Math.PI / 2)); g.disc(M, .3, [60, 60, 66, 0], 20); l.circ(M, .3, ink, 1.3, 24); l.seg([x - .18, Y0 + .004, z], [x + .18, Y0 + .004, z], [246, 246, 243], 1.6); }
    costellazione(a, R, 46, [-16, 16], [5.5, H - 1], [4, L - 4], con(ink, 120), [27, 27, 32, 0]);
  }
  if (i === 1) {                                 // carta: scarabocchi fitti sui muri e a terra
    for (let k = 0; k < 9; k++) { const lato = R() < .5 ? -1 : 1, zc = rr(6, L - 6), yc = rr(1.5, H - 2), sp = rr(2, 5); for (let n = 0; n < 34; n++) { const v = R() < .5; const z0 = zc + rr(-sp, sp), y0 = yc + rr(-sp * .6, sp * .6), ln = rr(1.5, sp * 1.6); l.seg([lato * (W / 2 - .04), clamp(y0, .1, H - .1), z0], [lato * (W / 2 - .04), clamp(y0 + (v ? ln : rr(-.3, .3)), .1, H - .1), z0 + (v ? rr(-.3, .3) : ln)], [110, 104, 94, 70], 1); } }
    for (let k = 0; k < 5; k++) { const [xc, zc] = libero(), sp = rr(1.5, 3.5); for (let n = 0; n < 26; n++) { const v = R() < .5, x0 = xc + rr(-sp, sp), z0 = zc + rr(-sp, sp), ln = rr(1, sp * 1.5); l.seg([x0, Y0 - .003, z0], [x0 + (v ? ln : rr(-.2, .2)), Y0 - .003, z0 + (v ? rr(-.2, .2) : ln)], [110, 104, 94, 75], 1); } }
  }
  if (i === 2) {                                 // acqua: fasce d'onda ai lati e bollicine
    for (const lato of [-1, 1]) onde(a, lato, [{ h: 2.3, a: .5, f: .21, p: lato * 1.1, c: [143, 228, 232] }, { h: 1.15, a: .32, f: .33, p: 2 + lato, c: [120, 222, 216] }]);
    for (let k = 0; k < 70; k++) { const [x, z] = libero(); l.circ(M4.mul(M4.tr(x, Y0 - .004, z), M4.rx(-Math.PI / 2)), rr(.05, .2), [40, 150, 150, 150], 1, 14); }
  }
  if (i === 4) costellazione(a, R, 60, [-16, 16], [3.6, H - .6], [4, L - 4], con(ink, 110), [236, 236, 230, 0]);
  if (i === 6) {                                 // sposa: prato verde, colline rosa, cielo salvia; a terra i buchi neri
    for (const lato of [-1, 1]) onde(a, lato, [{ h: 2.2, a: .5, f: .19, p: lato * .9, c: [214, 230, 206] }, { h: 1.0, a: .36, f: .3, p: 2 + lato, c: [190, 224, 140] }]);
    for (const [x, z, r] of [[-6, 20, 1.6], [8, 42, 1.15]]) { const M = M4.cat(M4.tr(x, Y0 - .003, z), M4.rx(-Math.PI / 2), M4.sc(1, .42, 1)); g.disc(M, r, [12, 12, 14, 0], 44); l.circ(M4.cat(M4.tr(x, Y0 + .002, z), M4.rx(-Math.PI / 2), M4.sc(1, .42, 1)), r, [150, 215, 60], 2.2, 56); }
  }
  if (i === 5) for (const lato of [-1, 1]) onde(a, lato, [{ h: 5.2, a: .7, f: .16, p: lato * .7, c: [143, 228, 232] }, { h: 3.7, a: .55, f: .2, p: 1.9 * lato, c: [224, 147, 135] }, { h: 2.3, a: .45, f: .27, p: 3.1, c: [181, 137, 146] }, { h: 1.05, a: .4, f: .22, p: lato * 2.4, c: [224, 147, 135] }]);

  a.mesh = mkMesh(a.g); a.lin = mkLin(a.l); a.meshO = mkMesh(a.go); if (a.gp) a.meshP = mkMesh(a.gp);
  a.texAtl = texDa(ATL, true, TOCCO ? .5 : 1);
  return a;
}
function spostata(pl, d) { return pl.map((p, i) => { const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * d, p[1] + dx / l * d]; }); }
function croce(a, x, z, s, col, w) { a.l.seg([x - s, Y0, z], [x + s, Y0, z], col, w); a.l.seg([x, Y0, z - s], [x, Y0, z + s], col, w); }
function matassa(a, c, r, n, R, col) { let p = null; for (let k = 0; k < n; k++) { const t = R() * Math.PI * 2, f = Math.acos(2 * R() - 1), rr = r * (.55 + R() * .6); const q = [c[0] + Math.sin(f) * Math.cos(t) * rr, Math.max(.05, c[1] + Math.cos(f) * rr * .8), c[2] + Math.sin(f) * Math.sin(t) * rr]; if (p) a.l.seg(p, q, col, 1); p = q; } }
function costellazione(a, R, n, rx, ry, rz, colL, colT) {
  const P = []; for (let k = 0; k < n; k++) P.push([lerp(rx[0], rx[1], R()), lerp(ry[0], ry[1], R()), lerp(rz[0], rz[1], R())]);
  P.forEach((p, k) => { let best = -1, bd = 1e9; P.forEach((q, j) => { if (j === k) return; const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < bd) { bd = d; best = j; } }); if (best >= 0 && bd < 14) a.l.seg(p, P[best], colL, 1); });
  P.forEach((p, k) => { if (k % 3) { a.l.seg([p[0] - .05, p[1], p[2]], [p[0] + .05, p[1], p[2]], con(colL, 255), 3); return; } const s = .12 + R() * .3, v = () => [p[0] + (R() - .5) * s * 2, p[1] + (R() - .5) * s * 2, p[2] + (R() - .5) * s * 2]; a.g.tri(v(), v(), v(), [0, 1, 0], colT); });
}
function onde(a, lato, strati) {
  strati.forEach((s, j) => {
    const x = lato * (W / 2 - .28 * (j + 1)), top = z => s.h + s.a * Math.sin(z * s.f + s.p) + s.a * .35 * Math.sin(z * s.f * 2.3 + 1.7 * s.p), pts = [];
    for (let z = T / 2; z < L - T / 2 - .01; z += .75) { const z1 = Math.min(z + .75, L - T / 2); a.g.quad([x, 0, z], [x, 0, z1], [x, top(z1), z1], [x, top(z), z], [s.c[0], s.c[1], s.c[2], 0], [-lato, 0, 0]); pts.push([x - lato * .012, top(z), z]); }
    pts.push([x - lato * .012, top(L - T / 2), L - T / 2]); a.l.poly(pts, C.ink, 1.5);
  });
}

/* ------------------------------------------------------------ immagini e video dei loop */
const TEX = new Map();
const TEXR = new Map();                          // texture che si ripetono (pavimenti)
function texRipetuta(url) {
  let e = TEXR.get(url);
  if (!e) { e = { t: null }; TEXR.set(url, e); const im = new Image(); im.onload = () => { e.t = texDa(im, true, 1); gl.bindTexture(gl.TEXTURE_2D, e.t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); }; im.src = url; }
  return e.t;
}
function tex(url, chiedi) {
  let e = TEX.get(url);
  if (!e) { if (!chiedi) return null; e = { t: null, s: 1 }; TEX.set(url, e); const im = new Image(); im.onload = () => { e.t = texDa(im, true, TOCCO ? .5 : 1); e.s = 2; }; im.onerror = () => { e.s = 3; }; im.src = url; }
  return e.s === 2 ? e.t : null;
}
const vid = document.createElement('video'); vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'auto'; vid.setAttribute('playsinline', ''); vid.setAttribute('muted', '');
let vidLoop = -1, vidPronto = false, vidGettone = 0, vid4k = false, lento4k = false, lentoAcc = 0;
const HDMAP = new Map(), HDLI = new Map(), hdV = new Set(); DATI.loops.forEach((Lp, li) => { if (Lp.hd) { HDMAP.set(`assets/loop/${Lp.n}.jpg`, { url: Lp.hd, li }); HDLI.set(Lp.hd, li); } }); const vidTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, vidTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
function videoPer(i, vicinissimo) {
  const pieno = !!(i >= 0 && vicinissimo && !lento4k && !TOCCO && DATI.loops[i].orig);
  if (i === vidLoop && pieno === vid4k) return; vidLoop = i; vid4k = pieno; vidPronto = false; const g = ++vidGettone;
  if (i < 0) { try { vid.pause(); } catch (e) { } return; }
  vid.src = pieno ? encodeURI(DATI.loops[i].orig) : (DATI.loops[i].video || `assets/loop/${DATI.loops[i].n}.mp4`);
  const ok = () => { if (g === vidGettone) vid._ok = true; }; vid._ok = false; vid.onplaying = ok; vid.onerror = () => { if (g === vidGettone) vid._ok = false; };
  const p = vid.play(); if (p && p.catch) p.catch(() => { });
}
function aggiornaVideo() {
  if (vidLoop < 0 || !vid._ok || vid.readyState < 2 || vid.seeking) return;
  try { gl.bindTexture(gl.TEXTURE_2D, vidTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid); vidPronto = true; } catch (e) { vid._ok = false; vidPronto = false; }
}

/* ------------------------------------------------------------ suono */
const SUONI = (DATI.suoni && DATI.suoni.length ? DATI.suoni : [{ f: 'assets/audio/sottofondo.wav', nome: 'sottofondo' }]).map(s => Object.assign({ buf: null, st: 0, g: null, src: null }, s));
const audioEl = null;
let actx = null, guad = null, anal = null, bufA = null, livello = 0, picco = 0, muto = false, suonoOra = -1, loopSuono = -1, live = false, busLive = null, midiNome = '';
const volume = () => muto ? 0 : (live ? .28 : .9);
const BASE = Math.max(0, SUONI.findIndex(s => s.n === '1468'));     // il suono di tutto l'ambiente
function suonoACaso() { if (SUONI.length < 2) return BASE; let k; do { k = Math.floor(Math.random() * SUONI.length); } while (k === BASE || (SUONI.length > 2 && k === suonoOra)); return k; }
function avviaAudio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)(); guad = actx.createGain(); guad.gain.value = 0; anal = actx.createAnalyser(); anal.fftSize = 1024; bufA = new Uint8Array(anal.fftSize);
    busLive = actx.createGain(); busLive.gain.value = .5; const comp = actx.createDynamicsCompressor(); uscita = comp;
    guad.connect(comp); busLive.connect(comp); comp.connect(anal); anal.connect(actx.destination); if (actx.state === 'suspended') actx.resume();
    guad.gain.linearRampToValueAtTime(volume(), actx.currentTime + 2.5);
    suona(suonoOra >= 0 ? suonoOra : BASE, true);
  } catch (e) { actx = null; }
}
function caricaSuono(k) { const s = SUONI[k]; if (s.st) return; s.st = 1; fetch(s.f).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => actx.decodeAudioData(b)).then(buf => { if (suonoOra === k || k === BASE) { s.buf = buf; s.st = 2; if (suonoOra === k) parteSuono(k); } else s.st = 0; }).catch(() => { s.st = 3; if (suonoOra === k && k !== BASE) suona(BASE); }); }
function fermaSuono(j) {                         // esce sfumando; i suoni a caso non restano in memoria (i telefoni ne hanno poca)
  const p = SUONI[j]; if (!p.src) return; const src = p.src, g = p.g; g.gain.setTargetAtTime(0, actx.currentTime, .3); setTimeout(() => { try { src.stop(); } catch (e) { } try { g.disconnect(); } catch (e) { } }, 1900); p.src = null; p.g = null;
  if (j !== BASE) { p.buf = null; p.st = 0; }
}
function parteSuono(k) {                        // tutti i suoni durano uguale: entrano a tempo, nello stesso punto del giro; chi suonava prima si interrompe
  const s = SUONI[k]; if (!s.buf || k !== suonoOra) return;
  if (!s.src) { const fine = s.dur ? Math.min(s.buf.duration, s.dur) : s.buf.duration;
    s.g = actx.createGain(); s.g.gain.value = 0; s.g.connect(guad); s.src = actx.createBufferSource(); s.src.buffer = s.buf; s.src.loop = true; s.src.loopEnd = fine; s.src.connect(s.g); s.src.start(0, actx.currentTime % fine); s.g.gain.setTargetAtTime(1, actx.currentTime, .3); }
  for (let j = 0; j < SUONI.length; j++) if (j !== k) fermaSuono(j);
}
function suona(k, forza) {
  if (k === suonoOra && !forza) return; suonoOra = k; $('#suono').textContent = 'suono · ' + SUONI[k].nome; if (!actx) return;
  if (SUONI[k].st === 2) parteSuono(k); else { if (SUONI[k].st === 3) SUONI[k].st = 0; caricaSuono(k); }
}
function setMuto(m) { muto = m; if (guad && actx) guad.gain.setTargetAtTime(volume(), actx.currentTime, .12); }
function ascolta(dt) {
  let v = 0;
  if (anal) { anal.getByteTimeDomainData(bufA); let q = 0; for (let i = 0; i < bufA.length; i++) { const x = (bufA[i] - 128) / 128; q += x * x; } v = clamp(Math.sqrt(q / bufA.length) * 3.2, 0, 1); }
  livello = lerp(livello, v, 1 - Math.exp(-dt * 14)); picco = Math.max(picco * Math.exp(-dt * .5), livello);
}
// live: la tastiera MIDI suona dentro il gioco; il timbro lo decide il loop che hai davanti (luce → apertura, tinta → onda, bordi → attacco, vuoto → coda)
const voci = new Map(), tenute = new Set(); let sustain = false, timbro = { onda: 'sawtooth', taglio: 1800, att: .01, ril: .5, det: 6 };
function timbroDa(Lp) { const t = Lp.mis[2], onde = ['sine', 'triangle', 'sawtooth', 'square']; timbro = { onda: t == null ? 'triangle' : onde[Math.floor(t / 90) % 4], taglio: 300 + Math.pow(Lp.mis[0] / 255, 2) * 5200, att: .004 + (1 - Math.min(Lp.mis[1], 30) / 30) * .09, ril: .25 + (Lp.vuoto != null ? Lp.vuoto : 50) / 100 * 1.1, det: 3 + (Lp.sat || 10) * .25 }; }
function notaSu(n, vel) {
  if (!actx || !live) return; notaGiu(n, true);
  const t = actx.currentTime, f = 440 * Math.pow(2, (n - 69) / 12), basso = n < 48, g = actx.createGain(), fl = actx.createBiquadFilter(), v = vel / 127, osc = [];
  fl.type = 'lowpass'; fl.frequency.value = basso ? 420 : timbro.taglio * (.5 + v); fl.Q.value = basso ? .7 : 4;
  const mk = (tipo, fr, det) => { const o = actx.createOscillator(); o.type = tipo; o.frequency.value = fr; o.detune.value = det; o.connect(fl); o.start(t); osc.push(o); };
  if (basso) { mk('sine', f, 0); mk('triangle', f, 0); } else { mk(timbro.onda, f, -timbro.det); mk(timbro.onda, f, timbro.det); mk('sine', f / 2, 0); }
  fl.connect(g); g.connect(busLive); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((basso ? .9 : .3) * (.35 + v * .65), t + (basso ? .006 : timbro.att));
  voci.set(n, { g, osc, basso });
}
function notaGiu(n, subito) {
  const vc = voci.get(n); if (!vc) return; if (sustain && !vc.basso && !subito) { tenute.add(n); return; }   // il basso non tiene, il resto sì
  voci.delete(n); tenute.delete(n); const t = actx.currentTime, r = subito ? .03 : (vc.basso ? .14 : timbro.ril);
  vc.g.gain.cancelScheduledValues(t); vc.g.gain.setTargetAtTime(0, t, r / 3); vc.osc.forEach(o => { try { o.stop(t + r * 2 + .1); } catch (e) { } });
}
function midi(e) {
  const st = e.data[0] & 0xf0, a = e.data[1], b = e.data[2];
  if (st === 0x90 && b > 0) notaSu(a, b); else if (st === 0x80 || (st === 0x90 && b === 0)) notaGiu(a);
  else if (st === 0xb0 && a === 64) { sustain = b >= 64; if (!sustain) [...tenute].forEach(n => notaGiu(n)); }
}
function aggLive() { $('#live').textContent = live ? ('live · ' + (midiNome || 'nessuna tastiera collegata')) : ''; }
function setLive(on) {
  if (!on) { live = false; [...voci.keys()].forEach(n => notaGiu(n, true)); setMuto(muto); aggLive(); avviso('live spento', 1600); return; }
  if (!navigator.requestMIDIAccess) { avviso('il live con la tastiera MIDI funziona in Brave o Chrome, non in questo browser', 6500); return; }
  navigator.requestMIDIAccess().then(acc => {
    const lega = () => { const nomi = []; acc.inputs.forEach(inp => { inp.onmidimessage = midi; nomi.push(inp.name); }); midiNome = nomi.join(', '); aggLive(); };
    lega(); acc.onstatechange = lega; live = true; setMuto(muto); aggLive();
    avviso(midiNome ? `live acceso · ${midiNome} · il timbro cambia a ogni loop` : 'live acceso · collega la tastiera MIDI', 6500);
  }).catch(() => avviso('il browser non ha dato accesso al MIDI', 5000));
}

// registrare il live: ciò che si vede (il mondo, senza le scritte) e ciò che si sente, in un file video
let rec = null, recPezzi = [], recT0 = 0, recDest = null, uscita = null;
function registra(on) {
  if (!on) { if (rec) { try { rec.stop(); } catch (e) { } } return; }
  if (!window.MediaRecorder || !cv.captureStream) { avviso('questo browser non sa registrare: usa Brave o Chrome', 5000); return; }
  try {
    const flusso = cv.captureStream(30);
    if (actx && uscita) { if (!recDest) { recDest = actx.createMediaStreamDestination(); uscita.connect(recDest); } recDest.stream.getAudioTracks().forEach(t => flusso.addTrack(t)); }
    const tipo = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const r = new MediaRecorder(flusso, tipo ? { mimeType: tipo, videoBitsPerSecond: 14e6, audioBitsPerSecond: 256e3 } : undefined); recPezzi = [];
    r.ondataavailable = e => { if (e.data && e.data.size) recPezzi.push(e.data); };
    r.onstop = () => {
      const est = (r.mimeType || tipo).includes('mp4') ? 'mp4' : 'webm', d = new Date(), p2 = n => String(n).padStart(2, '0');
      const nome = `MAP_ME_OUT_live_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.${est}`;
      const url = URL.createObjectURL(new Blob(recPezzi, { type: r.mimeType || tipo })), a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      rec = null; $('#rec').textContent = ''; avviso('registrazione salvata in Download · ' + nome, 7000);
    };
    r.start(1000); rec = r; recT0 = performance.now(); avviso('registro · R per fermare e salvare', 3500);
  } catch (e) { rec = null; avviso('non riesco ad avviare la registrazione', 4000); }
}
// i live ai muri: video in movimento quando sei nel loro ambiente
const VQ = new Map();
function texVideoQuadro(url, attivo) {
  let e = VQ.get(url);
  if (!e) {
    if (!attivo) return null; const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    e = { v, t, ok: false, pronto: false, morto: false }; v.onplaying = () => { e.ok = true; }; v.onerror = () => { e.morto = true; }; v.src = url; VQ.set(url, e);
  }
  if (e.morto) return null;
  if (attivo) {
    if (e.v.paused) { const p = e.v.play(); if (p && p.catch) p.catch(() => { }); }
    if (e.ok && e.v.readyState >= 2 && !e.v.seeking) { try { gl.bindTexture(gl.TEXTURE_2D, e.t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, e.v); e.pronto = true; } catch (err) { e.morto = true; return null; } }
  } else if (!e.v.paused) e.v.pause();
  return e.pronto ? e.t : null;
}

/* ------------------------------------------------------------ costruzione */
const AMBI = []; let texAtl = null;
function costruisciTutto() {
  TOT_DATI = 0; for (let i = 0; i < N; i++) AMBI.push(costruisci(i));
  AMBI.forEach(a => { a.meshA = mkMesh(a.ga); });
  $('#nt').textContent = TOT_DATI;
  QUADRI.forEach(q => tex(q.img, true));
}

/* ------------------------------------------------------------ stato del gioco */
const P = { x: 0, z: -0.5, yaw: 0, pitch: 0, vx: 0, vz: 0, passo: 0, vel: 0 };
let stato = 'intro', tGioco = 0, tp = 1, terza = false, ingresso = 0, nBuchi = 0, kPrec = null, ultimoSalva = 0;
const visti = new Set(); let traguardo = false, kFine = null, latoFine = 1;
const scoperti = new Set(); const tracce = Array.from({ length: N }, () => []);
const CHIAVE = 'mmo-into-the-hole-2';
try { const s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); if (s && Array.isArray(s.d)) s.d.forEach(id => scoperti.add(id)); } catch (e) { }
function salva() { try { localStorage.setItem(CHIAVE, JSON.stringify({ d: [...scoperti] })); } catch (e) { } }

const tasti = {}; let bloccato = false, eraBloccato = false, trascina = null;
const stick = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 }, guarda = { id: null, x: 0, y: 0 };
const MAPPA_T = { KeyW: 'su', ArrowUp: 'su', KeyS: 'giu', ArrowDown: 'giu', KeyA: 'sx', KeyD: 'dx', ArrowLeft: 'gsx', ArrowRight: 'gdx', KeyQ: 'gsx', KeyE: 'gdx', ShiftLeft: 'corri', ShiftRight: 'corri' };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (stato === 'intro') { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); avanti(); } return; }
  if (MAPPA_T[e.code]) { tasti[MAPPA_T[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyV') terza = !terza;
  if (e.code === 'KeyL') setLive(!live);
  if (e.code === 'KeyC') condividi();
  if (e.code === 'KeyR') registra(!rec);
  if (e.code === 'KeyX') setCampo(campo + 6);
  if (e.code === 'KeyZ') setCampo(campo - 6);
  if (e.code === 'Tab') { e.preventDefault(); mappaGrande(); }
  if (e.code === 'KeyF') { try { const d = document; if (d.fullscreenElement) d.exitFullscreen(); else { const p = d.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => { }); } } catch (err) { } }
  if (e.code === 'KeyM') { setMuto(!muto); avviso(muto ? 'audio spento' : 'audio acceso', 1600); }
  if (e.code === 'KeyP' || (e.code === 'Escape' && !bloccato)) pausa(stato !== 'pausa');
  if ((e.code === 'Enter' || e.code === 'Space') && stato === 'pausa') pausa(false);
});
addEventListener('keyup', e => { if (e.target && e.target.tagName === 'INPUT') return; if (MAPPA_T[e.code]) tasti[MAPPA_T[e.code]] = false; });
addEventListener('blur', () => { for (const k in tasti) tasti[k] = false; });
function chiediBlocco() { if (TOCCO) return; try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
document.addEventListener('pointerlockchange', () => { bloccato = document.pointerLockElement === cv; if (bloccato) eraBloccato = true; else if (eraBloccato && stato === 'gioco') pausa(true); });
cv.addEventListener('mousedown', e => { if (stato !== 'gioco') return; if (!bloccato) { chiediBlocco(); trascina = [e.clientX, e.clientY]; } });
addEventListener('mouseup', () => { trascina = null; });
addEventListener('mousemove', e => {
  if (stato !== 'gioco') return;
  if (bloccato) { P.yaw -= e.movementX * .0022; P.pitch = clamp(P.pitch - e.movementY * .0022, -1.35, 1.35); }
  else if (trascina) { P.yaw -= (e.clientX - trascina[0]) * .005; P.pitch = clamp(P.pitch - (e.clientY - trascina[1]) * .005, -1.35, 1.35); trascina = [e.clientX, e.clientY]; }
});
const elStick = $('#stick');
let meta = null; const cam = { f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], tan: .67, asp: 1 };
function vaiVerso(cx, cy) {                     // dal punto toccato sullo schermo al punto sul pavimento
  const nx = cx / innerWidth * 2 - 1, ny = 1 - cy / innerHeight * 2, d = [0, 1, 2].map(k => cam.f[k] + cam.r[k] * nx * cam.tan * cam.asp + cam.u[k] * ny * cam.tan);
  if (d[1] > -.02) { avviso('tocca il pavimento, più in basso', 1800); return; }
  let t = -occhio[1] / d[1]; const o = Math.hypot(d[0], d[2]) * t; if (o > 34) t *= 34 / o;
  meta = { x: clamp(occhio[0] + d[0] * t, -LIMX, LIMX), z: occhio[2] + d[2] * t, t0: tGioco, tb: tGioco, best: 1e9 };
}
cv.addEventListener('touchstart', e => {
  e.preventDefault(); if (stato !== 'gioco') return;
  const r = elStick.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top + r.height / 2;
  for (const t of e.changedTouches) {
    if (stick.id === null && Math.hypot(t.clientX - sx, t.clientY - sy) < r.width * .95) { stick.id = t.identifier; stick.x0 = sx; stick.y0 = sy; stick.dx = stick.dy = 0; meta = null; }
    else if (guarda.id === null) { guarda.id = t.identifier; guarda.x = guarda.x0 = t.clientX; guarda.y = guarda.y0 = t.clientY; guarda.t0 = performance.now(); guarda.mosso = false; }
  }
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { let dx = t.clientX - stick.x0, dy = t.clientY - stick.y0; const l = Math.hypot(dx, dy), m = 44; if (l > m) { dx *= m / l; dy *= m / l; } stick.dx = dx / m; stick.dy = dy / m; elStick.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
    else if (t.identifier === guarda.id) {
      if (Math.hypot(t.clientX - guarda.x0, t.clientY - guarda.y0) > 12) guarda.mosso = true;
      if (guarda.mosso) { P.yaw -= (t.clientX - guarda.x) * .0062; P.pitch = clamp(P.pitch - (t.clientY - guarda.y) * .0045, -1.1, 1.1); }
      guarda.x = t.clientX; guarda.y = t.clientY;
    }
  }
}, { passive: false });
const fineTocco = e => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dy = 0; elStick.firstElementChild.style.transform = ''; }
    if (t.identifier === guarda.id) { guarda.id = null; if (!guarda.mosso && performance.now() - guarda.t0 < 450 && stato === 'gioco' && e.type === 'touchend') vaiVerso(t.clientX, t.clientY); }
  }
};
cv.addEventListener('touchend', fineTocco); cv.addEventListener('touchcancel', fineTocco);

/* ------------------------------------------------------------ movimento e incontri */
function fuoriDaBox(p, x0, x1, z0, z1, r) {
  const cx = clamp(p.x, x0, x1), cz = clamp(p.z, z0, z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
  if (d2 > r * r) return;
  if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
  else { const px = Math.min(p.x - x0, x1 - p.x), pz = Math.min(p.z - z0, z1 - p.z); if (pz < px) p.z = (p.z - z0 < z1 - p.z) ? z0 - r : z1 + r; else p.x = (p.x - x0 < x1 - p.x) ? x0 - r : x1 + r; }
}
let vicino = null, ancoraDato = [0, 0, 0];
const TRACCIA3D = [];
function scriviTraccia(ai) {
  const tr = tracce[ai], l = new Lin(); for (let i = 1; i < tr.length; i++) { if (Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]) < 4) l.seg([tr[i - 1][0], Y0 + .006, tr[i - 1][1]], [tr[i][0], Y0 + .006, tr[i][1]], [230, 107, 143, 170], 2.4); }
  if (TRACCIA3D[ai]) gl.deleteVertexArray(TRACCIA3D[ai].vao); TRACCIA3D[ai] = l.a.length ? mkLin(l) : null;
}
function aggiorna(dt) {
  tGioco += dt; ascolta(dt);
  if (rec) { const sec = Math.floor((performance.now() - recT0) / 1000), tx = `● rec ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, el = $('#rec'); if (el.textContent !== tx) el.textContent = tx; }
  let mF = (tasti.su ? 1 : 0) - (tasti.giu ? 1 : 0) - stick.dy, mR = (tasti.dx ? 1 : 0) - (tasti.sx ? 1 : 0) + stick.dx; const gira = (tasti.gsx ? 1 : 0) - (tasti.gdx ? 1 : 0);
  if (meta) {                                    // la pedina va da sola al punto toccato
    if (Math.abs(mF) + Math.abs(mR) > .05) meta = null;
    else {
      const dx = meta.x - P.x, dz = meta.z - P.z, d = Math.hypot(dx, dz);
      if (d < .55 || tGioco - meta.t0 > 16) meta = null;
      else {
        let da = Math.atan2(dx, dz) - P.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); P.yaw += clamp(da, -3.4 * dt, 3.4 * dt); P.pitch = lerp(P.pitch, -.04, 1 - Math.exp(-dt * 2));
        if (Math.abs(da) < .9) mF = clamp(d / 1.2, .4, 1);
        if (d < meta.best - .04) { meta.best = d; meta.tb = tGioco; } else if (tGioco - meta.tb > 1.4) meta = null;   // un ostacolo: si ferma lì
      }
    }
  }
  if (ingresso > 0) { ingresso -= dt; if (Math.abs(mF) + Math.abs(mR) < .01) mF = .62; else ingresso = Math.min(ingresso, .25); }
  P.yaw += gira * 1.9 * dt;
  const lm = Math.hypot(mF, mR); if (lm > 1) { mF /= lm; mR /= lm; }
  const vmax = tasti.corri ? 7.6 : 3.9, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), dxr = -Math.cos(P.yaw), dzr = Math.sin(P.yaw);
  const k = 1 - Math.exp(-dt * 10); P.vx = lerp(P.vx, (fx * mF + dxr * mR) * vmax, k); P.vz = lerp(P.vz, (fz * mF + dzr * mR) * vmax, k);
  P.x += P.vx * dt; P.z += P.vz * dt; P.x = clamp(P.x, -LIMX, LIMX);
  const kw = Math.round(P.z / L), zc = kw * L, b = BUCHI[mod(kw, N)], rg = .36;
  fuoriDaBox(P, -W / 2 - 2, b.cx - b.hw, zc - T / 2, zc + T / 2, rg); fuoriDaBox(P, b.cx + b.hw, W / 2 + 2, zc - T / 2, zc + T / 2, rg);
  const kk = Math.floor(P.z / L), ai = mod(kk, N), amb = AMBI[ai], z0 = kk * L;
  for (const o of amb.oggetti) { if (!(o.r > 0)) continue; const dx = P.x - o.x, dz = P.z - (o.z + z0), d = Math.hypot(dx, dz), m = o.r + rg; if (d < m && d > 1e-5) { P.x += dx / d * (m - d); P.z += dz / d * (m - d); } }
  P.vel = Math.hypot(P.vx, P.vz); P.passo += P.vel * dt * 1.9;
  if (kPrec !== null && kk !== kPrec) { nBuchi++; $('#buchi').textContent = `buchi ${nBuchi}`; }
  { const zl = mod(P.z, L);                     // tutti gli ambienti attraversati; l'invito a condividere arriva in fondo all'ultimo, alla porta del ricominciare (o appena la si varca)
    if (zl > 5 && zl < L - 5 && !visti.has(mod(kk, N))) { visti.add(mod(kk, N)); if (visti.size === N) { kFine = kk; latoFine = zl < L / 2 ? 1 : -1; } }
    if (kFine !== null && !traguardo && (kk !== kFine || (latoFine > 0 ? zl > L - 8 : zl < 8))) { traguardo = true; const t = $('#traguardo'); t.hidden = false; requestAnimationFrame(() => t.classList.add('su')); setTimeout(() => { t.classList.remove('su'); setTimeout(() => { t.hidden = true; }, 900); }, 10000); } }
  if (kk !== kPrec) { kPrec = kk; cambiaAmbiente(ai); }
  const tr = tracce[ai], lz = P.z - z0, ul = tr[tr.length - 1]; if (!ul || Math.hypot(ul[0] - P.x, ul[1] - lz) > 1.1) { tr.push([P.x, lz]); if (tr.length > 600) tr.shift(); if (tr.length % 3 === 0) scriviTraccia(ai); }

  // l'incontro: l'elemento più vicino entro la sua distanza mostra il dato
  let best = null, bd = 1e9; const cand = amb.oggetti.map(o => [o, z0]); cand.push([AMBI[mod(ai + 1, N)].oggetti[0], z0 + L]);
  for (const [o, oz] of cand) { const d = Math.hypot(P.x - o.x, P.z - (o.z + oz)); if (d < o.rt && d - o.rt * .35 < bd) { bd = d - o.rt * .35; best = [o, oz]; } }
  if (best) {
    const [o, oz] = best; ancoraDato = [o.x, o.y, o.z + oz];
    if (vicino !== o) { vicino = o; mostraDato(o); if (!scoperti.has(o.id)) { scoperti.add(o.id); $('#nd').textContent = scoperti.size; if (tGioco - ultimoSalva > 2) { ultimoSalva = tGioco; salva(); } } }
    if (o.vivo) rigaViva(`livello ${it(livello, 2)}  picco ${it(picco, 2)}  ${livello < .33 ? 'verde' : livello < .66 ? 'giallo' : 'rosso'}`);
  } else if (vicino) { vicino = null; $('#dato').classList.remove('su'); }

  // il loop più vicino si mette in moto (il video prende il posto del fermo immagine)
  let vb = -1, vd = 11, sb = -1, sd = 6.5; hdV.clear();
  for (const o of amb.oggetti) { if (o.loop == null) continue; const d = Math.hypot(P.x - o.x, P.z - (o.z + z0)); if (d < 9.5) hdV.add(o.loop); if (d < sd) { sd = d; sb = o.loop; } if ((o.tipo === 'tavola' || o.tipo === 'schermo' || o.tipo === 'lente') && d < vd) { vd = d; vb = o.loop; } }
  videoPer(vb, vd < (vid4k ? 6.5 : 5));
  if (vid4k && vidPronto) { lentoAcc = dtVero > .034 ? lentoAcc + dtVero : Math.max(0, lentoAcc - dtVero * .5); if (lentoAcc > 2.5) lento4k = true; }   // se il 4K pesa troppo, si torna alla copia leggera
  if (sb !== loopSuono) { loopSuono = sb; if (sb >= 0) { suona(suonoACaso()); timbroDa(DATI.loops[sb]); } else suona(BASE); }   // vicino a un loop: un suono a caso; lontano da tutti: il suono dell'ambiente
  tp = lerp(tp, (terza || ingresso > .2) ? 1 : 0, 1 - Math.exp(-dt * 3.2));
}

/* ------------------------------------------------------------ HUD */
const elDato = $('#dato'), elFilo = $('#filo'), hud = $('#hud'), elAiuto = $('#aiuto');
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function mostraDato(o) {
  elDato.innerHTML = `<b>${esc(o.titolo)}</b><span>${esc(o.sotto || '')}</span>` + o.righe.map(r => r[0] === 'c'
    ? (r[1].length ? `<div class="c">${r[1].map(c => `<i style="background:${esc(c[0])};flex:${Math.max(4, c[1])}"></i>`).join('')}</div><code class="p">colori · ${r[1].map(c => `${esc(c[0])} ${c[1]}%`).join('  ')}</code>` : '')
    : `<code class="${r[0]}">${esc(r[1])}</code>`).join('');
  elDato.classList.add('su');
}
let tViva = 0; function rigaViva(t) { if (tGioco - tViva < .1) return; tViva = tGioco; const c = elDato.querySelector('code.m'); if (c) c.textContent = t; }
let tAvviso = 0; function avviso(t, ms = 6000) { elAiuto.firstElementChild.textContent = t; elAiuto.classList.add('su'); clearTimeout(tAvviso); tAvviso = setTimeout(() => elAiuto.classList.remove('su'), ms); }
function cambiaAmbiente(ai) {
  const A = AMB[ai]; $('#amb').textContent = `ambiente ${ai + 1}/${N} · ${A.nome}`;
  hud.style.setProperty('--ink', `rgb(${A.ink.join(',')})`); hud.style.setProperty('--velo', `rgba(${A.bg.join(',')},.84)`);
}
const mp = $('#mappa'), mx = mp.getContext('2d');
function disegnaMappa(ai, lz) {
  const dpr = Math.min(devicePixelRatio || 1, 2), cw = mp.clientWidth, ch = mp.clientHeight; if (mp.width !== Math.round(cw * dpr) || mp.height !== Math.round(ch * dpr)) { mp.width = Math.round(cw * dpr); mp.height = Math.round(ch * dpr); }
  const s = cw / W, hm = L * s, k = cw / 132, A = AMB[ai], ink = `rgb(${A.ink.join(',')})`, X = x => (W / 2 - x) * s, Z = z => (L - z) * s, ogg = AMBI[ai].oggetti;
  mx.setTransform(dpr, 0, 0, dpr, 0, 0); mx.clearRect(0, 0, cw, ch); mx.fillStyle = `rgba(${A.bg.join(',')},.8)`; mx.fillRect(0, 0, cw, hm);
  mx.strokeStyle = ink; mx.fillStyle = ink; mx.lineWidth = 1.2; mx.lineJoin = mx.lineCap = 'round';
  const muro = (z, b) => { mx.beginPath(); mx.moveTo(X(-W / 2), Z(z)); mx.lineTo(X(b.cx - b.hw), Z(z)); mx.moveTo(X(b.cx + b.hw), Z(z)); mx.lineTo(X(W / 2), Z(z)); mx.stroke(); };
  muro(.4, BUCHI[ai]); muro(L - .4, BUCHI[mod(ai + 1, N)]); mx.beginPath(); mx.moveTo(.6, 0); mx.lineTo(.6, hm); mx.moveTo(cw - .6, 0); mx.lineTo(cw - .6, hm); mx.stroke();
  // da dove vieni, dove vai
  mx.font = `${Math.round(8.5 * k)}px ${MONO}`; mx.textAlign = 'center'; mx.globalAlpha = .75;
  mx.fillText('↑ ' + AMB[mod(ai + 1, N)].nome, clamp(X(BUCHI[mod(ai + 1, N)].cx), 26 * k, cw - 26 * k), 11 * k); mx.fillText('↓ ' + AMB[mod(ai - 1, N)].nome, clamp(X(BUCHI[ai].cx), 26 * k, cw - 26 * k), hm - 5 * k); mx.globalAlpha = 1;
  // gli elementi: un puntino vuoto finché non li incontri, poi il loro segno
  let qui = 0;
  for (const o of ogg) {
    if (o.tipo === 'buco') { if (scoperti.has(o.id)) qui++; continue; } const x = X(o.x), z = Z(o.z);
    if (!scoperti.has(o.id)) { mx.globalAlpha = .28; mx.beginPath(); mx.arc(x, z, 1.5 * k, 0, 7); mx.stroke(); mx.globalAlpha = 1; continue; }
    qui++; const u = k;
    if (o.tipo === 'tavola') mx.fillRect(x - 1.6 * u, z - 3.4 * u, 3.2 * u, 6.8 * u); else if (o.tipo === 'schermo') { mx.fillStyle = '#fff'; mx.fillRect(x - 3.4 * u, z - 2.4 * u, 6.8 * u, 4.8 * u); mx.fillStyle = ink; mx.strokeRect(x - 3.4 * u, z - 2.4 * u, 6.8 * u, 4.8 * u); }
    else if (o.tipo === 'lente') { mx.strokeStyle = '#2a3fd8'; mx.lineWidth = 2; mx.beginPath(); mx.arc(x, z, 3.2 * u, 0, 7); mx.stroke(); mx.strokeStyle = ink; mx.lineWidth = 1.2; }
    else if (o.tipo === 'cubo') mx.strokeRect(x - 2.8 * u, z - 2.8 * u, 5.6 * u, 5.6 * u); else if (o.tipo === 'chip') mx.fillRect(x - 3.4 * u, z - 1.2 * u, 6.8 * u, 2.4 * u);
    else if (o.tipo === 'semaforo') { mx.fillStyle = '#d8262e'; mx.beginPath(); mx.ellipse(x, z, 3.6 * u, 1.8 * u, 0, 0, 7); mx.fill(); mx.fillStyle = ink; }
    else if (o.tipo === 'lastra') { mx.fillStyle = '#e0349c'; mx.beginPath(); mx.moveTo(x - 4 * u, z + 1.6 * u); mx.lineTo(x + 2 * u, z + 1.6 * u); mx.lineTo(x + 4 * u, z - 1.6 * u); mx.lineTo(x - 2 * u, z - 1.6 * u); mx.fill(); mx.fillStyle = ink; }
    else if (o.tipo === 'quadro') mx.fillRect(x - 1 * u, z - 4.5 * u, 2 * u, 9 * u); else if (o.tipo === 'anello') { mx.strokeStyle = '#d8262e'; mx.lineWidth = 2; mx.beginPath(); mx.arc(x, z, 2.2 * u, 0, 7); mx.stroke(); mx.strokeStyle = ink; mx.lineWidth = 1.2; }
    else if (o.tipo === 'bilancia') { mx.beginPath(); mx.moveTo(x - 3.5 * u, z + 2.5 * u); mx.lineTo(x + 3.5 * u, z + 2.5 * u); mx.lineTo(x, z - 3 * u); mx.closePath(); mx.fill(); }
    else if (o.tipo === 'grafico') { mx.beginPath(); mx.moveTo(x - 4 * u, z + 2 * u); mx.lineTo(x - 1.5 * u, z - 2 * u); mx.lineTo(x + 1 * u, z + 1 * u); mx.lineTo(x + 4 * u, z - 2.5 * u); mx.stroke(); }
    else { mx.beginPath(); mx.arc(x, z, 2 * u, 0, 7); mx.fill(); }
  }
  // il percorso: rosa come la pedina, più tenue dove sei passato da più tempo
  const tr = tracce[ai];
  if (tr.length > 1) { mx.strokeStyle = '#e66b8f'; mx.lineWidth = 2.2 * k; for (let i = 1; i < tr.length; i++) { if (Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]) > 4) continue; mx.globalAlpha = .25 + .75 * Math.pow(i / tr.length, 1.6); mx.beginPath(); mx.moveTo(X(tr[i - 1][0]), Z(tr[i - 1][1])); mx.lineTo(X(tr[i][0]), Z(tr[i][1])); mx.stroke(); } mx.globalAlpha = 1; }
  // la pedina: cono di vista e freccia
  const px = X(P.x), pz = Z(lz), ang = Math.atan2(-Math.cos(P.yaw), -Math.sin(P.yaw));
  mx.fillStyle = '#e66b8f'; mx.globalAlpha = .22; mx.beginPath(); mx.moveTo(px, pz); mx.arc(px, pz, 30 * k, ang - .62, ang + .62); mx.closePath(); mx.fill(); mx.globalAlpha = 1;
  mx.save(); mx.translate(px, pz); mx.rotate(ang); mx.strokeStyle = ink; mx.lineWidth = 1.2; mx.beginPath(); mx.moveTo(7 * k, 0); mx.lineTo(-4.5 * k, 4.2 * k); mx.lineTo(-2.2 * k, 0); mx.lineTo(-4.5 * k, -4.2 * k); mx.closePath(); mx.fill(); mx.stroke(); mx.restore();
  // il giro degli ambienti: quanto hai scoperto in ognuno
  const y0 = hm + 7 * k, q = (cw - (N - 1) * 3 * k) / N, hq = ch - y0 - 1;
  for (let j = 0; j < N; j++) {
    const o2 = AMBI[j].oggetti, f = o2.filter(o => scoperti.has(o.id)).length / o2.length, x = j * (q + 3 * k);
    mx.fillStyle = `rgb(${TESS(j).join(',')})`; mx.fillRect(x, y0, q, hq); mx.fillStyle = '#e66b8f'; mx.fillRect(x, y0 + hq * (1 - f), q, hq * f);
    mx.strokeStyle = ink; mx.lineWidth = j === ai ? 2.4 : 1; mx.strokeRect(x + .5, y0 + .5, q - 1, hq - 1);
  }
  const et = `mappa · ${qui}/${ogg.length} qui`; if (mappat.textContent !== et) mappat.textContent = et;
}
const mappat = $('#mappat');

/* ------------------------------------------------------------ disegno */
let VP = M4.id(), occhio = [0, 0, 0], campo = 118, nFot = 0;
try { const c = parseFloat(localStorage.getItem('mmo-campo-2')); if (c >= 45 && c <= 118) campo = c; } catch (e) { }
function setCampo(v) { campo = clamp(Math.round(v), 45, 118); try { localStorage.setItem('mmo-campo-2', campo); } catch (e) { } avviso(`vista ${campo}°` + (campo === 118 ? ' (grandangolo)' : campo === 68 ? ' (normale)' : ''), 1400); }
addEventListener('wheel', e => { if (stato !== 'gioco') return; e.preventDefault(); setCampo(campo + Math.sign(e.deltaY) * 3); }, { passive: false });
function usaMesh() { gl.useProgram(PM.p); gl.uniformMatrix4fv(PM.u.uVP, false, VP); gl.uniform3fv(PM.u.uL, LUCE); gl.uniform1i(PM.u.uT, 0); gl.activeTexture(gl.TEXTURE0); }
const LUCE = norm([-.4, .82, -.42]), UNO = [1, 1, 1, 1], UVI = [0, 0, 1, 1], TINTA_ERBA = [1.3, 1.3, 1.12, 1];
function dis(mesh, M, modo, tinta, t, uv, NM) {
  gl.uniformMatrix4fv(PM.u.uM, false, M); gl.uniformMatrix4fv(PM.u.uNM, false, NM || M); gl.uniform1i(PM.u.uModo, modo); gl.uniform4fv(PM.u.uTinta, tinta || UNO); gl.uniform4fv(PM.u.uUV, uv || UVI);
  if (t) gl.bindTexture(gl.TEXTURE_2D, t); gl.bindVertexArray(mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
}
function usaLin(alfa = 1) { gl.useProgram(PL.p); gl.uniformMatrix4fv(PL.u.uVP, false, VP); gl.uniform2f(PL.u.uRis, cv.width, cv.height); gl.uniform2f(PL.u.uAB, 300.1 / 299.9, -60 / 299.9); gl.uniform1f(PL.u.uDpr, cv.width / Math.max(1, cv.clientWidth)); gl.uniform1f(PL.u.uAlfa, alfa); }
function disL(lin, M) { gl.uniformMatrix4fv(PL.u.uM, false, M); gl.bindVertexArray(lin.vao); gl.drawArrays(gl.TRIANGLES, 0, lin.n); }
const mDin = (d, t) => M4.cat(M4.tr(d.t[0], d.t[1], d.t[2]), M4.ry(d.yaw + d.vel * t), M4.sc(d.s, d.s, d.s));
const rDin = (d, t) => M4.ry(d.yaw + d.vel * t);

const ROSA = [.905, .43, .575, 1];
/* la pedina: un corpo solo. Lo scheletro genera un campo continuo (le parti si fondono l'una nell'altra),
   la superficie viene estratta una volta, poi ogni punto segue le sue due ossa più vicine. */
const CORPO = (() => {
  const ossa = [], O = (n, a, b, ra, rb, kx, p) => { ossa.push({ n, a, b, ra, rb, kx, p, d: sub(b, a) }); return ossa.length - 1; };
  const bac = O('bacino', [0, .95, 0], [0, 1.12, 0], .1, .09, 1.5, -1), pet = O('petto', [0, 1.12, 0], [0, 1.36, 0], .09, .108, 1.55, bac);
  const spa = O('spalle', [-.15, 1.435, 0], [.15, 1.435, 0], .06, .06, 1, pet), col = O('collo', [0, 1.45, 0], [0, 1.57, .006], .05, .042, 1, pet), tes = O('testa', [0, 1.632, .014], [0, 1.705, .014], .09, .084, .92, col);
  const lato = {};
  for (const sx of [1, -1]) {
    const cos = O('coscia', [sx * .09, .94, 0], [sx * .085, .5, 0], .083, .055, 1, bac), sti = O('stinco', [sx * .085, .5, 0], [sx * .078, .08, -.004], .054, .035, 1, cos), pie = O('piede', [sx * .078, .042, -.012], [sx * .08, .03, .135], .04, .028, 1, sti);
    const bra = O('braccio', [sx * .212, 1.415, 0], [sx * .25, 1.13, -.004], .053, .04, 1, spa), ava = O('avambraccio', [sx * .25, 1.13, -.004], [sx * .272, .885, .02], .039, .029, 1, bra), man = O('mano', [sx * .272, .885, .02], [sx * .28, .795, .032], .036, .03, .68, ava);
    lato[sx] = { cos, sti, pie, bra, ava, man };
  }
  ossa.forEach(b => { b.l2 = b.d[0] * b.d[0] + b.d[1] * b.d[1] + b.d[2] * b.d[2]; b.cx = (b.a[0] + b.b[0]) / 2; b.figli = []; }); ossa.forEach((b, i) => { if (b.p >= 0) ossa[b.p].figli.push(i); });
  const dO = (b, x, y, z) => { const px = b.kx !== 1 ? b.cx + (x - b.cx) / b.kx : x; let t = ((px - b.a[0]) * b.d[0] + (y - b.a[1]) * b.d[1] + (z - b.a[2]) * b.d[2]) / b.l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = px - b.a[0] - b.d[0] * t, dy = y - b.a[1] - b.d[1] * t, dz = z - b.a[2] - b.d[2] * t; return Math.sqrt(dx * dx + dy * dy + dz * dz) - (b.ra + (b.rb - b.ra) * t); };
  const K = .04, F = (x, y, z) => { let m = 1e9; for (let i = 0; i < ossa.length; i++) { const d = dO(ossa[i], x, y, z), h = Math.max(K - Math.abs(m - d), 0) / K; m = Math.min(m, d) - h * h * K * .25; } return m; };
  // estrazione della superficie (tetraedri in marcia su una griglia fine)
  const h = .0175, x0 = -.37, y0 = -.02, z0 = -.17, nx = 43, ny = 106, nz = 21, V = new Float32Array((nx + 1) * (ny + 1) * (nz + 1)), id = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) V[id(i, j, k)] = F(x0 + i * h, y0 + j * h, z0 + k * h);
  const ang = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tet = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  const corpo = [], testa = [], val = new Float32Array(8), pos = [];
  const grad = p => { const e = .005; return norm([F(p[0] + e, p[1], p[2]) - F(p[0] - e, p[1], p[2]), F(p[0], p[1] + e, p[2]) - F(p[0], p[1] - e, p[2]), F(p[0], p[1], p[2] + e) - F(p[0], p[1], p[2] - e)]); };
  const tri = (a, b, c) => {
    const n = cross(sub(b, a), sub(c, a)); if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-14) return;
    const ce = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], g = grad(ce), T3 = (n[0] * g[0] + n[1] * g[1] + n[2] * g[2]) < 0 ? [a, c, b] : [a, b, c];
    (ce[1] > 1.475 && Math.abs(ce[0]) < .13 ? testa : corpo).push(T3[0], T3[1], T3[2]);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let dentro = 0; for (let c = 0; c < 8; c++) { val[c] = V[id(i + ang[c][0], j + ang[c][1], k + ang[c][2])]; if (val[c] < 0) dentro++; pos[c] = [x0 + (i + ang[c][0]) * h, y0 + (j + ang[c][1]) * h, z0 + (k + ang[c][2]) * h]; }
    if (dentro === 0 || dentro === 8) continue;
    const mez = (p, q) => { const t = val[p] / (val[p] - val[q]); return [pos[p][0] + (pos[q][0] - pos[p][0]) * t, pos[p][1] + (pos[q][1] - pos[p][1]) * t, pos[p][2] + (pos[q][2] - pos[p][2]) * t]; };
    for (const T4 of tet) {
      const I = T4.filter(c => val[c] < 0), E = T4.filter(c => val[c] >= 0);
      if (I.length === 1) tri(mez(I[0], E[0]), mez(I[0], E[1]), mez(I[0], E[2]));
      else if (I.length === 3) tri(mez(E[0], I[0]), mez(E[0], I[1]), mez(E[0], I[2]));
      else if (I.length === 2) { const a = mez(I[0], E[0]), b = mez(I[0], E[1]), c = mez(I[1], E[1]), d = mez(I[1], E[0]); tri(a, b, c); tri(a, c, d); }
    }
  }
  const tutti = corpo.concat(testa), n = tutti.length, P0 = new Float32Array(n * 3), N0 = new Float32Array(n * 3), I0 = new Uint8Array(n * 2), W0 = new Float32Array(n), cache = new Map();
  for (let v = 0; v < n; v++) {
    const p = tutti[v], ch = Math.round(p[0] * 4000) + ',' + Math.round(p[1] * 4000) + ',' + Math.round(p[2] * 4000); let r = cache.get(ch);
    if (!r) {
      const g = grad(p); let b0 = 0, d0 = 1e9; for (let i = 0; i < ossa.length; i++) { const d = dO(ossa[i], p[0], p[1], p[2]); if (d < d0) { d0 = d; b0 = i; } }
      let b1 = b0, w1 = 0; for (const c of [ossa[b0].p].concat(ossa[b0].figli)) { if (c < 0) continue; const w = Math.exp(-(dO(ossa[c], p[0], p[1], p[2]) - d0) / .03); if (w > w1) { w1 = w; b1 = c; } }
      r = [g, b0, b1, 1 / (1 + w1)]; cache.set(ch, r);
    }
    P0.set(p, v * 3); N0.set(r[0], v * 3); I0[v * 2] = r[1]; I0[v * 2 + 1] = r[2]; W0[v] = r[3];
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, P0, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, N0, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.disableVertexAttribArray(2); gl.vertexAttrib2f(2, 0, 0); gl.disableVertexAttribArray(3); gl.vertexAttrib4f(3, 1, 1, 1, 1); gl.bindVertexArray(null);
  return { ossa, lato, n, nCorpo: corpo.length, P0, N0, I0, W0, P: new Float32Array(n * 3), Nn: new Float32Array(n * 3), M: ossa.map(() => M4.id()), vao, bp, bn };
})();
function omino(conTesta) {
  const C = CORPO, an = clamp(P.vel / 3.9, 0, 1.3), fa = P.passo, su = Math.abs(Math.cos(fa)) * .028 * Math.min(an, 1);
  const perno = (p, a) => M4.cat(M4.tr(p[0], p[1], p[2]), M4.rx(a), M4.tr(-p[0], -p[1], -p[2]));
  for (const sx of [1, -1]) {
    const L_ = C.lato[sx], f = fa + (sx > 0 ? 0 : Math.PI), a1 = Math.sin(f) * .52 * an, flet = (.06 + Math.max(0, -Math.cos(f)) * .85) * Math.min(an, 1) + .03, b1 = -Math.sin(f) * .42 * an, pieg = .14 + .3 * Math.min(an, 1);
    const Mc = perno(C.ossa[L_.cos].a, -a1), Ms = M4.mul(Mc, perno(C.ossa[L_.sti].a, flet)), Mb = perno(C.ossa[L_.bra].a, -b1), Ma = M4.mul(Mb, perno(C.ossa[L_.ava].a, -pieg));
    C.M[L_.cos] = Mc; C.M[L_.sti] = Ms; C.M[L_.pie] = Ms; C.M[L_.bra] = Mb; C.M[L_.ava] = Ma; C.M[L_.man] = Ma;
  }
  const n = conTesta ? C.n : C.nCorpo, P0 = C.P0, N0 = C.N0, Po = C.P, No = C.Nn, I0 = C.I0, W0 = C.W0, MM = C.M;
  for (let v = 0, q = 0; v < n; v++, q += 3) {
    const A = MM[I0[v * 2]], B = MM[I0[v * 2 + 1]], w = W0[v], u = 1 - w, x = P0[q], y = P0[q + 1], z = P0[q + 2], nx = N0[q], ny = N0[q + 1], nz = N0[q + 2];
    Po[q] = w * (A[0] * x + A[4] * y + A[8] * z + A[12]) + u * (B[0] * x + B[4] * y + B[8] * z + B[12]);
    Po[q + 1] = w * (A[1] * x + A[5] * y + A[9] * z + A[13]) + u * (B[1] * x + B[5] * y + B[9] * z + B[13]);
    Po[q + 2] = w * (A[2] * x + A[6] * y + A[10] * z + A[14]) + u * (B[2] * x + B[6] * y + B[10] * z + B[14]);
    No[q] = w * (A[0] * nx + A[4] * ny + A[8] * nz) + u * (B[0] * nx + B[4] * ny + B[8] * nz);
    No[q + 1] = w * (A[1] * nx + A[5] * ny + A[9] * nz) + u * (B[1] * nx + B[5] * ny + B[9] * nz);
    No[q + 2] = w * (A[2] * nx + A[6] * ny + A[10] * nz) + u * (B[2] * nx + B[6] * ny + B[10] * nz);
  }
  gl.bindVertexArray(C.vao); gl.bindBuffer(gl.ARRAY_BUFFER, C.bp); gl.bufferSubData(gl.ARRAY_BUFFER, 0, Po, 0, n * 3); gl.bindBuffer(gl.ARRAY_BUFFER, C.bn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, No, 0, n * 3);
  gl.uniformMatrix4fv(PM.u.uM, false, M4.cat(M4.tr(P.x, su, P.z), M4.ry(P.yaw))); gl.uniformMatrix4fv(PM.u.uNM, false, M4.ry(P.yaw)); gl.uniform1i(PM.u.uModo, 0); gl.uniform4fv(PM.u.uTinta, ROSA);
  gl.drawArrays(gl.TRIANGLES, 0, n);
}

function disegna() {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h);
  const kk = Math.floor(P.z / L), ai = mod(kk, N), A = AMB[ai], asp = w / h;
  // camera: prima persona (occhi dell'omino) ↔ fuori, dietro di lui
  const cp = Math.cos(P.pitch), f = [Math.sin(P.yaw) * cp, Math.sin(P.pitch), Math.cos(P.yaw) * cp], fh = [Math.sin(P.yaw), Math.cos(P.yaw)];
  const dond = Math.sin(P.passo * 2) * .028 * clamp(P.vel / 3.9, 0, 1);
  const e1 = [P.x + fh[0] * .13, 1.63 + dond, P.z + fh[1] * .13], c1 = [e1[0] + f[0], e1[1] + f[1], e1[2] + f[2]];
  const dist = 4.7, e2 = [clamp(P.x - fh[0] * dist, -W / 2 + .5, W / 2 - .5), clamp(2.35 - P.pitch * 2.2, .5, A.alto - .4), P.z - fh[1] * dist], c2 = [P.x + fh[0] * 1.5, 1.45 + P.pitch * 1.2, P.z + fh[1] * 1.5];
  const q = tp * tp * (3 - 2 * tp); occhio = [lerp(e1[0], e2[0], q), lerp(e1[1], e2[1], q), lerp(e1[2], e2[2], q)];
  const centro = [lerp(c1[0], c2[0], q), lerp(c1[1], c2[1], q), lerp(c1[2], c2[2], q)];
  { const ff = norm(sub(centro, occhio)), rr2 = norm(cross(ff, [0, 1, 0])); cam.f = ff; cam.r = rr2; cam.u = cross(rr2, ff); cam.asp = asp; }
  const fovy = Math.max(campo * Math.PI / 180, 2 * Math.atan(Math.tan(31 * Math.PI / 180) / asp));
  cam.tan = Math.tan(fovy / 2);
  VP = M4.mul(M4.persp(fovy, asp, .1, 300), M4.look(occhio, centro, [0, 1, 0]));

  gl.clearColor(A.bg[0] / 255, A.bg[1] / 255, A.bg[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
  aggiornaVideo();
  const stanze = []; for (let k = kk - 2; k <= kk + 2; k++) stanze.push([k, AMBI[mod(k, N)], M4.tr(0, 0, k * L)]);

  usaMesh();
  for (const [k, a, Mk] of stanze) {
    dis(a.mesh, Mk, 0);
    if (a.meshP) { const tp2 = texRipetuta(a.tpav); if (tp2) dis(a.meshP, Mk, 1, TINTA_ERBA, tp2); else dis(a.meshP, Mk, 0, [.54, .69, .24, 1]); }
    const pressoQui = Math.abs(k - kk) <= 1;
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -6);
    for (const m of a.mostre) {
      let M = m.M ? M4.mul(Mk, m.M) : M4.mul(Mk, mDin(m.dinM, tGioco)), NM = m.M ? null : rDin(m.dinM, tGioco);
      const mesh = m.forma === 'quad' ? U.quad : m.forma === 'disco' ? U.disco : m.forma === 'cubo' ? U.cubo : U.sfera;
      let t = m.vq ? texVideoQuadro(m.vq, k === kk && stato === 'gioco') : null;
      if (!t) t = (m.video >= 0 && m.video === vidLoop && vidPronto && k === kk) ? vidTex : tex(m.tex, pressoQui || m.subito);
      if (k === kk && t !== vidTex && !m.vq && hdV.size) { const hh = HDMAP.get(m.tex); if (hh && hdV.has(hh.li)) { const th = tex(hh.url, true); if (th) t = th; } }
      if (t) dis(mesh, M, 1, UNO, t, m.uv, NM); else dis(mesh, M, 0, [m.fondo[0] / 255, m.fondo[1] / 255, m.fondo[2] / 255, 1], null, null, NM);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    for (const d of a.din) dis(U.ingr, M4.cat(Mk, d.M, M4.rz(d.vel * tGioco)), 0);
    const acc = livello < .33 ? 2 : livello < .66 ? 1 : 0, vivi = [[1, .16, .14], [1, .74, .1], [.28, .92, .3]], spenti = [[.3, .09, .1], [.3, .24, .1], [.1, .28, .13]];
    for (const lm of a.lampade) { const c = lm.k === acc ? vivi[lm.k].map(v => v * (.8 + livello * .3)) : spenti[lm.k]; dis(U.disco, M4.mul(Mk, lm.M), 0, [c[0], c[1], c[2], 1]); }
  }
  if (tp > .02 || P.pitch < -.25) omino(tp > .3);

  // trasparenze: ombre, aloni, scritte
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const [k, a, Mk] of stanze) { if (a.meshO.n) dis(a.meshO, Mk, 3); }
  if (A.ombra > 0) dis(U.quadOmbra, M4.cat(M4.tr(P.x, .009, P.z), M4.rx(-Math.PI / 2), M4.sc(1.3, 1.3, 1)), 3);
  for (const [k, a, Mk] of stanze) { if (a.meshA.n) dis(a.meshA, Mk, 2, UNO, a.texAtl); }

  // il tratto
  usaLin(1);
  for (const [k, a, Mk] of stanze) {
    disL(a.lin, Mk); if (TRACCIA3D[a.i]) disL(TRACCIA3D[a.i], Mk);
    for (const m of a.mostre) if (m.forma === 'cubo') disL(U.cuboL, M4.mul(Mk, mDin(m.dinM, tGioco)));
    for (const d of a.din) disL(U.ingrL, M4.cat(Mk, d.M, M4.rz(d.vel * tGioco)));
  }
  if (meta) disL(U.metaL, M4.cat(M4.tr(meta.x, Y0 + .01, meta.z), M4.rx(-Math.PI / 2), M4.sc(.5 + .08 * Math.sin(tGioco * 6), .5 + .08 * Math.sin(tGioco * 6), 1)));
  gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);

  // HUD: il dato di fianco all'elemento (mai sopra), col suo filo
  if (vicino) {
    const p = ancoraDato, W_ = innerWidth, H_ = innerHeight, bw = elDato.offsetWidth, bh = elDato.offsetHeight, hw = vicino.hw || .6, dx = -Math.cos(P.yaw) * hw, dz = Math.sin(P.yaw) * hw;
    const pr = v => { const x = VP[0] * v[0] + VP[4] * v[1] + VP[8] * v[2] + VP[12], y = VP[1] * v[0] + VP[5] * v[1] + VP[9] * v[2] + VP[13], ww = VP[3] * v[0] + VP[7] * v[1] + VP[11] * v[2] + VP[15]; return ww > .25 ? [(x / ww * .5 + .5) * W_, (1 - (y / ww * .5 + .5)) * H_] : null; };
    const c = pr(p), dst = pr([p[0] + dx, p[1], p[2] + dz]), sin = pr([p[0] - dx, p[1], p[2] - dz]);
    let bx, by, da = null;
    if (c && dst && sin && c[0] > -60 && c[0] < W_ + 60 && c[1] > 40 && c[1] < H_ - 20) {
      const xd = Math.max(dst[0], sin[0]), xs = Math.min(dst[0], sin[0]);
      if (xd + 40 + bw < W_ - 16) { bx = xd + 40; da = [xd + 3, c[1]]; } else if (xs - 40 - bw > 16) { bx = xs - 40 - bw; da = [xs - 3, c[1]]; }
      if (da) by = c[1] - bh * .5;
    }
    if (!da) { bx = (W_ - bw) / 2; by = H_ - bh - 74; }
    bx = clamp(bx, 16, W_ - bw - 16); by = clamp(by, 66, H_ - bh - 60);
    if (TOCCO) { bx = W_ - bw - 8; by = 92; da = null; }
    elDato.style.transform = `translate(${Math.round(bx)}px,${Math.round(by)}px)`;
    const ln = elFilo.firstElementChild, ci = elFilo.lastElementChild;
    if (da) { const ex = bx > da[0] ? bx : bx + bw, ey = clamp(da[1], by + 14, by + bh - 10); ln.setAttribute('x1', da[0]); ln.setAttribute('y1', da[1]); ln.setAttribute('x2', ex); ln.setAttribute('y2', ey); ci.setAttribute('cx', da[0]); ci.setAttribute('cy', da[1]); elFilo.style.opacity = 1; }
    else elFilo.style.opacity = 0;
  } else elFilo.style.opacity = 0;
  disegnaMappa(ai, P.z - kk * L);
  if ((++nFot % 180) === 0) for (const [url, e] of TEX) { if (e.s === 2 && HDLI.has(url) && !hdV.has(HDLI.get(url))) { gl.deleteTexture(e.t); TEX.delete(url); } }
}
{ const q = new Geo(); q.quad([-.5, -.5, 0], [.5, -.5, 0], [.5, .5, 0], [-.5, .5, 0], [0, 0, 0, 62], [0, 0, 1]); U.quadOmbra = mkMesh(q); const ml = new Lin(); ml.circ(M4.id(), 1, [230, 107, 143], 3, 40); ml.circ(M4.id(), .25, [230, 107, 143], 3, 20); U.metaL = mkLin(ml); }

/* ------------------------------------------------------------ flusso: intro → PLAY → gioco */
const intro = $('#intro'), vintro = $('#vintro'), elPausa = $('#pausa');
$('#suonointro').addEventListener('click', e => { e.stopPropagation(); vintro.muted = !vintro.muted; vintro.volume = 1; if (!vintro.muted) { const p = vintro.play(); if (p && p.catch) p.catch(() => { }); } e.currentTarget.textContent = vintro.muted ? 'audio · off' : 'audio · on'; });
$('#play').addEventListener('click', play);
let fase = 'benvenuto';
const preAudio = new Audio(); preAudio.loop = true; preAudio.preload = 'auto'; preAudio.volume = .85; preAudio.src = (SUONI.find(q => q.n === '1485') || SUONI[0]).f;
const provaPre = () => { if (stato === 'intro' && (fase === 'benvenuto' || fase === 'istruzioni') && preAudio.paused) { const p = preAudio.play(); if (p && p.catch) p.catch(() => { }); } };
addEventListener('pointerdown', provaPre); addEventListener('keydown', provaPre); provaPre();
function sfumaPre() { const v0 = preAudio.volume, t0 = performance.now(), giu = () => { const t = (performance.now() - t0) / 1200; if (t < 1) { preAudio.volume = v0 * (1 - t); requestAnimationFrame(giu); } else { preAudio.pause(); } }; giu(); }
function avanti() {
  if (fase === 'benvenuto') { fase = 'istruzioni'; $('#benvenuto').hidden = true; $('#istruzioni').hidden = false; provaPre(); }
  else if (fase === 'istruzioni') { fase = 'intro'; $('#istruzioni').hidden = true; sfumaPre(); vintro.muted = false; vintro.volume = 1; $('#suonointro').textContent = 'audio · on';
    const p = vintro.play(); if (p && p.catch) p.catch(() => { vintro.muted = true; $('#suonointro').textContent = 'audio · off'; const q = vintro.play(); if (q && q.catch) q.catch(() => { }); }); }
  else if (fase === 'intro') play();
}
document.querySelectorAll('.avanti').forEach(b => b.addEventListener('click', avanti));
if (WEB && !linkValido()) { fase = 'scaduto'; $('#benvenuto').hidden = true; $('#scaduto').hidden = false; }
function play() {
  if (stato !== 'intro' || fase !== 'intro') return; stato = 'gioco'; if (TOCCO) elStick.hidden = false;
  avviaAudio(); chiediBlocco();
  intro.classList.add('via'); hud.hidden = false; ingresso = 2.5; tp = 1; cv.focus();
  const v0 = vintro.muted ? 0 : vintro.volume, t0 = performance.now(); const sfuma = () => { const t = (performance.now() - t0) / 1100; if (t < 1) { vintro.volume = v0 * (1 - t); requestAnimationFrame(sfuma); } };
  if (v0 > 0) sfuma();
  setTimeout(() => { intro.hidden = true; try { vintro.pause(); } catch (e) { } }, 1500);
  $('#nd').textContent = scoperti.size;
  setTimeout(() => { const s = $('#saluto'); s.classList.add('su'); setTimeout(() => s.classList.remove('su'), 5200); }, 1700);
  setTimeout(() => avviso(TOCCO ? 'tocca il pavimento: la pedina ci va · trascina il dito: ti guardi intorno' : 'W A S D o frecce: cammina · mouse: guarda · V: vedi la pedina · rotella: allarga la vista · L: live MIDI · R: registra', 11000), 7600);
}
function pausa(si) {
  if (stato === 'intro') return;
  if (si) { stato = 'pausa'; elPausa.hidden = false; if (document.pointerLockElement) document.exitPointerLock(); if (actx && actx.state === 'running') actx.suspend(); if (audioEl) audioEl.pause(); try { vid.pause(); } catch (e) { } salva(); }
  else { stato = 'gioco'; elPausa.hidden = true; if (actx) actx.resume(); if (audioEl) { const p = audioEl.play(); if (p && p.catch) p.catch(() => { }); } if (vidLoop >= 0) { const p = vid.play(); if (p && p.catch) p.catch(() => { }); } chiediBlocco(); cv.focus(); }
}
elPausa.addEventListener('click', () => pausa(false));
$('#traguardo').addEventListener('click', e => { e.stopPropagation(); condividi(); });
function mappaGrande() { $('#mappabox').classList.toggle('grande'); }
$('#bpausa').addEventListener('click', e => { e.stopPropagation(); if (stato === 'gioco') pausa(true); });
if (TOCCO) $('#mappa').addEventListener('click', e => { e.stopPropagation(); mappaGrande(); });
const DIDA_MAPPA = 'La mia mappa di MAP ME OUT — into the hole. #mapmeout';
function immagineMappa() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'), ink = '#1b1b20';
  x.fillStyle = '#f6f6f3'; x.fillRect(0, 0, 1080, 1350); x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = 2;
  for (const [px, py] of [[50, 50], [1030, 50], [50, 1300], [1030, 1300]]) { x.beginPath(); x.moveTo(px - 16, py); x.lineTo(px + 16, py); x.moveTo(px, py - 16); x.lineTo(px, py + 16); x.stroke(); }
  x.font = `700 62px ${SANS}`; x.textBaseline = 'alphabetic'; x.fillText('Map Me Out', 96, 132);
  x.fillStyle = '#1f1f24'; x.fillRect(98, 152, 232, 44); x.fillStyle = '#fff'; x.font = `400 24px ${MONO}`; x.fillText('into the hole', 114, 182); x.fillStyle = ink;
  const d = new Date(); x.font = `400 24px ${MONO}`; x.textAlign = 'right'; x.fillText(`${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`, 984, 126); x.fillText('la mia mappa', 984, 160); x.textAlign = 'left';
  const cols = 4, lw = 196, lh = lw * L / W, gx = 30, gy = 64, x0 = (1080 - (cols * lw + (cols - 1) * gx)) / 2, y0 = 268; let tot = 0, sc = 0;
  for (let j = 0; j < N; j++) {
    const riga = Math.floor(j / cols), nr = Math.min(cols, N - riga * cols), ox = (riga === 0 ? x0 : (1080 - (nr * lw + (nr - 1) * gx)) / 2) + (j % cols) * (lw + gx), oy = y0 + riga * (lh + gy), s = lw / W, X = v => ox + (W / 2 - v) * s, Z = v => oy + (L - v) * s, A = AMB[j];
    x.fillStyle = `rgb(${TESS(j).join(',')})`; x.fillRect(ox, oy, lw, lh); x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(ox, oy, lw, lh);
    const scuro = j === 4, ci = scuro ? '#ecece6' : ink; x.fillStyle = ci; x.strokeStyle = ci; x.lineWidth = 1.5;
    for (const o of AMBI[j].oggetti) { tot++; const si = scoperti.has(o.id); if (si) sc++; if (o.tipo === 'buco') continue; const px = X(o.x), pz = Z(o.z); if (si) { x.beginPath(); x.arc(px, pz, 4.2, 0, 7); x.fill(); } else { x.globalAlpha = .3; x.beginPath(); x.arc(px, pz, 2.6, 0, 7); x.stroke(); x.globalAlpha = 1; } }
    const tr = tracce[j]; x.strokeStyle = '#e66b8f'; x.lineWidth = 4; x.lineJoin = x.lineCap = 'round'; x.beginPath(); tr.forEach((p, k) => { if (k && Math.hypot(p[0] - tr[k - 1][0], p[1] - tr[k - 1][1]) < 4) x.lineTo(X(p[0]), Z(p[1])); else x.moveTo(X(p[0]), Z(p[1])); }); x.stroke();
    x.fillStyle = ink; x.font = `400 20px ${MONO}`; x.fillText(`${j + 1} · ${A.nome}`, ox, oy + lh + 26);
  }
  x.fillStyle = ink; x.font = `400 26px ${MONO}`; x.fillText(`dati scoperti ${sc} / ${tot}   buchi attraversati ${nBuchi}`, 96, 1164);
  x.font = `700 58px ${SANS}`; x.fillText('#mapmeout', 96, 1244); x.font = `italic 400 28px ${SANS}`; x.textAlign = 'right'; x.fillText('notimenospaceart', 984, 1244);
  return c;
}
function condividi() {                           // un tocco: l'immagine della mappa col testo già pronto
  immagineMappa().toBlob(async blob => {
    if (!blob) return; const file = new File([blob], 'mapmeout.png', { type: 'image/png' });
    try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(DIDA_MAPPA); } catch (e) { }
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: DIDA_MAPPA, title: 'MAP ME OUT' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob);
    if (!TOCCO && SUL_MAC) { try { const a = document.createElement('a'); a.href = url; a.download = 'mapmeout.png'; document.body.appendChild(a); a.click(); a.remove(); avviso('mappa salvata in Download come mapmeout.png · il testo con #mapmeout è copiato', 8000); return; } catch (e) { } }
    if (stato === 'gioco' && document.pointerLockElement) document.exitPointerLock();
    $('#mappaimg').src = url; $('#mappafoglio').hidden = false;
  }, 'image/png');
}
$('#mappafoglio').addEventListener('click', e => { e.stopPropagation(); if (e.target.tagName !== 'IMG') $('#mappafoglio').hidden = true; });
document.querySelectorAll('.condividi').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); condividi(); }); b.addEventListener('touchend', e => e.stopPropagation()); });
// i link da dare agli altri (solo dalla copia sul Mac)
const SUL_MAC = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
if (SUL_MAC && $('#linkbox')) { $('#linkbox').hidden = false;
  const sito = $('#sito'), out = $('#linkout'); try { sito.value = localStorage.getItem('mmo-sito') || 'https://notimenospaceart.github.io/mapmeout/'; } catch (e) { sito.value = 'https://notimenospaceart.github.io/mapmeout/'; }
  $('#linkbox').addEventListener('click', e => e.stopPropagation());
  const fai = cod => { const base = sito.value.trim().replace(/#.*$/, ''); if (!/^https?:\/\//.test(base)) { out.textContent = 'scrivi prima l\'indirizzo del sito (comincia con https://)'; return; } try { localStorage.setItem('mmo-sito', base); } catch (e) { } const l = base + '#' + cod; out.textContent = l; try { navigator.clipboard.writeText(l); out.textContent = l + '  — copiato'; } catch (e) { } };
  $('#fa24').addEventListener('click', () => fai(codice24())); $('#faper').addEventListener('click', () => fai(CODICE_PERENNE));
}
$('#azzera').addEventListener('click', e => { e.stopPropagation(); scoperti.clear(); tracce.forEach(t => t.length = 0); salva(); $('#nd').textContent = 0; e.currentTarget.textContent = 'mappa azzerata'; setTimeout(() => { e.currentTarget.textContent = 'azzera la mappa dei dati scoperti'; }, 1800); });
addEventListener('pagehide', salva);
document.addEventListener('visibilitychange', () => { if (document.hidden && stato === 'gioco') pausa(true); });

let tPrec = 0, dtVero = 0;
function giro(t) {
  dtVero = (t - tPrec) / 1000 || 0; const dt = Math.min(.05, dtVero); tPrec = t;
  if (stato === 'gioco') aggiorna(dt);
  if (stato !== 'intro' || intro.classList.contains('via')) disegna();
  requestAnimationFrame(giro);
}
function parti() {
  try { costruisciTutto(); } catch (err) { const e = document.createElement('div'); e.id = 'errore'; e.textContent = 'Il gioco non è riuscito a costruire gli ambienti: ' + err.message; document.body.appendChild(e); console.error(err); return; }
  cambiaAmbiente(0); kPrec = Math.floor(P.z / L); cambiaAmbiente(mod(kPrec, N));
  LOOP_AMB[0].concat(LOOP_AMB[N - 1]).forEach(k => tex(`assets/loop/${DATI.loops[k].n}.jpg`, true));
  requestAnimationFrame(giro);
}
const fontPronti = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load(`700 40px "MMO Sans"`), document.fonts.load(`400 40px "MMO Mono"`)]).catch(() => { }) : Promise.resolve();
Promise.race([fontPronti, new Promise(r => setTimeout(r, 2500))]).then(parti);
if (TOCCO) $('#sottoplay').textContent = 'tocca il tasto per entrare';

window.MMO = { P, AMBI, AMB, play, stato: () => stato, set terza(v) { terza = v; }, salta(z, x = 0, yaw = 0, pitch = 0) { P.z = z; P.x = x; P.yaw = yaw; P.pitch = pitch; P.vx = P.vz = 0; ingresso = 0; }, scoperti, info: () => ({ tp, vid4k, lento4k, tot: TOT_DATI, tex: TEX.size, vidLoop, vidPronto, livello }) };
})();
