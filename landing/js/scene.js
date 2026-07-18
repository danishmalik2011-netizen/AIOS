// AIOS background — 3D green "coding matrix" rain (Three.js).
// Perspective depth + billboarded code glyphs falling in columns.
import * as THREE from "three";

const canvas = document.getElementById("bg-canvas");
if (!canvas) throw new Error("no bg-canvas");

const prefersReduced = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

// ---- Theme-aware palette -------------------------------------------------
// Dark: classic green matrix on near-black. Light: teal matrix on light bg.
function themePalette() {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  return light
    ? {
        fog: 0xe9efed,
        head: [0.04, 0.42, 0.3],
        green: [0.04, 0.66, 0.47],
      }
    : {
        fog: 0x05060a,
        head: [0.75, 1.0, 0.82],
        green: [0.1, 1.0, 0.35],
      };
}
let palette = themePalette();

// ---- Glyph atlas (white code glyphs on transparent) ----------------------
function buildAtlas() {
  const GRID = 8; // 8x8 = 64 glyphs
  const CELL = 64;
  const size = GRID * CELL;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${CELL - 14}px "Space Grotesk", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyphs =
    "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF{}[]()<>=+-*/;:.$#&|!?<>/\\|".split(
      ""
    );
  for (let i = 0; i < GRID * GRID; i++) {
    const col = i % GRID;
    const row = (i / GRID) | 0;
    ctx.fillText(
      glyphs[i % glyphs.length],
      col * CELL + CELL / 2,
      row * CELL + CELL / 2
    );
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, GRID };
}

// ---- Renderer / scene ----------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0); // page background shows through

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(palette.fog, 0.012);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.1,
  400
);
camera.position.set(0, 0, 72);

// ---- Matrix rain geometry ------------------------------------------------
const COLS = 90;
const ROWS = 46;
const W = 95; // world width spread
const H = 62; // world height spread
const D = 46; // world depth spread (3D parallax)
const TAIL = 18; // trail length in rows
const N = COLS * ROWS;

const { tex, GRID } = buildAtlas();

const positions = new Float32Array(N * 3);
const aGlyph = new Float32Array(N);
const aBright = new Float32Array(N);

const head = new Float32Array(COLS); // current head row (float)
const speed = new Float32Array(COLS); // rows / second
const colX = new Float32Array(COLS);
const colZ = new Float32Array(COLS);

const rowSpacing = H / ROWS;
const topY = H / 2;

for (let c = 0; c < COLS; c++) {
  colX[c] = (Math.random() - 0.5) * W;
  colZ[c] = (Math.random() - 0.5) * D;
  head[c] = -Math.random() * (ROWS + TAIL);
  speed[c] = 7 + Math.random() * 12;
  for (let r = 0; r < ROWS; r++) {
    const i = c * ROWS + r;
    positions[i * 3 + 0] = colX[c];
    positions[i * 3 + 1] = topY - r * rowSpacing;
    positions[i * 3 + 2] = colZ[c];
    aGlyph[i] = (Math.random() * GRID * GRID) | 0;
    aBright[i] = 0;
  }
}

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
geo.setAttribute("aGlyph", new THREE.BufferAttribute(aGlyph, 1));
geo.setAttribute("aBright", new THREE.BufferAttribute(aBright, 1));

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTex: { value: tex },
    uGrid: { value: GRID },
    uSize: { value: rowSpacing * 2.4 },
    uScale: { value: 320.0 },
    uHead: { value: new THREE.Vector3(...palette.head) },
    uGreen: { value: new THREE.Vector3(...palette.green) },
  },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    attribute float aGlyph;
    attribute float aBright;
    uniform float uSize;
    uniform float uScale;
    varying float vGlyph;
    varying float vBright;
    void main() {
      vGlyph = aGlyph;
      vBright = aBright;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * (uScale / -mv.z);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uTex;
    uniform float uGrid;
    uniform vec3 uHead;
    uniform vec3 uGreen;
    varying float vGlyph;
    varying float vBright;
    void main() {
      if (vBright <= 0.001) discard;
      // map point coord -> atlas cell
      vec2 cell = vec2(mod(vGlyph, uGrid), floor(vGlyph / uGrid));
      vec2 uv = (gl_PointCoord) / uGrid + cell / uGrid;
      // flip Y so glyphs are upright
      uv.y = (cell.y + 1.0 - gl_PointCoord.y) / uGrid;
      float a = texture2D(uTex, uv).a;
      if (a < 0.05) discard;
      // matrix palette: bright head -> head color, trail -> green
      vec3 col = mix(uGreen, uHead, smoothstep(0.82, 1.0, vBright));
      gl_FragColor = vec4(col, a * clamp(vBright, 0.0, 1.0));
    }
  `,
});

const points = new THREE.Points(geo, material);
points.frustumCulled = false;
scene.add(points);

// React to theme changes from the toggle (and initial state).
function applyThemeToScene(theme) {
  palette = theme === "light"
    ? { fog: 0xe9efed, head: [0.04, 0.42, 0.3], green: [0.04, 0.66, 0.47] }
    : { fog: 0x05060a, head: [0.75, 1.0, 0.82], green: [0.1, 1.0, 0.35] };
  scene.fog.color.setHex(palette.fog);
  material.uniforms.uHead.value.set(...palette.head);
  material.uniforms.uGreen.value.set(...palette.green);
}
window.addEventListener("themechange", (e) => applyThemeToScene(e.detail.theme));
// Sync immediately in case the page loaded already in light mode.
applyThemeToScene(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

// ---- Brightness update ---------------------------------------------------
function updateBrightness() {
  const b = geo.attributes.aBright.array;
  for (let c = 0; c < COLS; c++) {
    const h = head[c];
    for (let r = 0; r < ROWS; r++) {
      const i = c * ROWS + r;
      const dist = h - r; // >=0 means above the falling head
      let v = 0;
      if (dist >= 0 && dist < TAIL) {
        v = 1.0 - dist / TAIL; // 1 at head -> 0 at tail end
        v = v * v; // ease for nicer falloff
      }
      b[i] = v;
    }
  }
  geo.attributes.aBright.needsUpdate = true;
}

// occasional glyph flicker for the "alive" code feel
function flicker() {
  const g = geo.attributes.aGlyph.array;
  for (let c = 0; c < COLS; c++) {
    const r = ((head[c] | 0) - ((Math.random() * 3) | 0));
    if (r >= 0 && r < ROWS) {
      g[c * ROWS + r] = (Math.random() * GRID * GRID) | 0;
    }
  }
  geo.attributes.aGlyph.needsUpdate = true;
}

// ---- Resize --------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// ---- Animation loop ------------------------------------------------------
let last = performance.now();
let rafId = null;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (let c = 0; c < COLS; c++) {
    head[c] += speed[c] * dt;
    if (head[c] - TAIL > ROWS) {
      head[c] = -Math.random() * TAIL;
      speed[c] = 7 + Math.random() * 12;
    }
  }
  updateBrightness();
  if (Math.random() < 0.5) flicker();

  // gentle camera drift for parallax depth
  const t = now * 0.0001;
  camera.position.x = Math.sin(t) * 6;
  camera.position.y = Math.cos(t * 0.8) * 3;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  rafId = requestAnimationFrame(frame);
}

if (prefersReduced) {
  updateBrightness();
  renderer.render(scene, camera);
} else {
  rafId = requestAnimationFrame(frame);
}

// pause when tab hidden
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  } else if (!prefersReduced && !rafId) {
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
});
