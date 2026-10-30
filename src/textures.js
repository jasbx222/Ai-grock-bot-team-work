import * as THREE from 'three';

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.userData.canvas = c; t.userData.ctx = g;
  return t;
}

// Simple seeded random so the office looks the same on every load
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function woodFloor() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const plankH = 64;
    for (let y = 0; y < h; y += plankH) {
      let x = -Math.floor(rnd() * 300);
      while (x < w) {
        const len = 260 + rnd() * 260;
        const base = 150 + rnd() * 30;
        g.fillStyle = `rgb(${base + 20},${base - 25},${base - 75})`;
        g.fillRect(x, y, len, plankH);
        for (let i = 0; i < 14; i++) { // grain
          g.strokeStyle = `rgba(90,55,25,${0.05 + rnd() * 0.08})`;
          g.lineWidth = 1 + rnd() * 2;
          const gy = y + rnd() * plankH;
          g.beginPath(); g.moveTo(x, gy);
          g.bezierCurveTo(x + len * 0.3, gy + rnd() * 6 - 3, x + len * 0.6, gy + rnd() * 6 - 3, x + len, gy);
          g.stroke();
        }
        g.fillStyle = 'rgba(60,35,15,0.55)';
        g.fillRect(x, y, 2, plankH);
        x += len;
      }
      g.fillStyle = 'rgba(60,35,15,0.5)';
      g.fillRect(0, y, w, 2);
    }
  }, { repeat: [4, 3] });
}

export function carpet(color = '#5b6474') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},255,0.04)`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
  }, { repeat: [6, 3] });
}

// Animated screen contents: returns {texture, update(t)}
export function screenTexture(kind) {
  const W = 512, H = 320;
  const tex = canvasTex(W, H, () => {});
  const g = tex.userData.ctx;
  const lines = [];
  for (let i = 0; i < 60; i++) lines.push({ indent: Math.floor(rnd() * 4), len: 60 + rnd() * 260, col: ['#7dd3fc', '#f9a8d4', '#a7f3d0', '#fde68a', '#c4b5fd'][Math.floor(rnd() * 5)] });
  let last = -1;
  function update(t, active) {
    const step = Math.floor(t * (active ? 4 : 0.5));
    if (step === last) return; last = step;
    if (kind === 'code') {
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1e293b'; g.fillRect(0, 0, W, 22);
      ['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(14 + i * 16, 11, 5, 0, 7); g.fill(); });
      for (let i = 0; i < 16; i++) {
        const L = lines[(i + step) % lines.length];
        g.fillStyle = '#475569'; g.fillRect(8, 34 + i * 17, 14, 8);
        g.fillStyle = L.col; g.fillRect(30 + L.indent * 18, 34 + i * 17, L.len, 8);
      }
      if (active && step % 2) { g.fillStyle = '#fff'; g.fillRect(40, 34 + 15 * 17, 3, 10); }
    } else if (kind === 'design') {
      g.fillStyle = '#f8fafc'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, 70, H); g.fillRect(W - 90, 0, 90, H);
      const hue = (step * 7) % 360;
      g.fillStyle = `hsl(${hue},70%,55%)`; g.fillRect(120, 40, 230, 240);
      g.fillStyle = '#fff'; g.fillRect(140, 200, 190, 24); g.fillRect(140, 232, 120, 16);
      g.fillStyle = `hsl(${(hue + 120) % 360},70%,60%)`; g.beginPath(); g.arc(235, 120, 50, 0, 7); g.fill();
      for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${i * 45},60%,60%)`; g.fillRect(W - 76, 20 + i * 34, 60, 22); }
    } else if (kind === 'chat') {
      g.fillStyle = '#ece5dd'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#075e54'; g.fillRect(0, 0, W, 34);
      for (let i = 0; i < 7; i++) {
        const me = (i + step) % 2 === 0;
        g.fillStyle = me ? '#dcf8c6' : '#ffffff';
        const w = 140 + ((i * 53 + step * 17) % 160);
        g.fillRect(me ? W - w - 14 : 14, 46 + i * 38, w, 28);
      }
    } else { // board / planning
      g.fillStyle = '#f1f5f9'; g.fillRect(0, 0, W, H);
      ['#fde68a', '#bfdbfe', '#bbf7d0'].forEach((c, col) => {
        g.fillStyle = '#e2e8f0'; g.fillRect(12 + col * 166, 12, 156, H - 24);
        for (let i = 0; i < 4; i++) {
          if ((i + col + step) % 5 === 4) continue;
          g.fillStyle = c; g.fillRect(20 + col * 166, 24 + i * 68, 140, 56);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(28 + col * 166, 36 + i * 68, 100, 6); g.fillRect(28 + col * 166, 50 + i * 68, 70, 6);
        }
      });
    }
    tex.needsUpdate = true;
  }
  update(0, true);
  return { texture: tex, update };
}

export function whiteboardTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, h);
    g.font = 'bold 44px "Office Arabic", sans-serif'; g.direction = 'rtl'; g.textAlign = 'right';
    g.fillStyle = '#b5653f'; g.fillText('خطة الأسبوع', w - 40, 70);
    g.font = '30px "Office Arabic", sans-serif';
    const items = [['#16a34a', '✓ المنشور التلقائي'], ['#ea580c', '• دمج feat/auto-post'], ['#dc2626', '• تجربة على جهاز حقيقي'], ['#1d4ed8', '• المكتب الافتراضي 3D']];
    items.forEach(([c, s], i) => { g.fillStyle = c; g.fillText(s, w - 60, 140 + i * 60); });
    g.strokeStyle = '#334155'; g.lineWidth = 4;
    [[80, 120], [250, 120], [165, 260]].forEach(([x, y]) => g.strokeRect(x, y, 130, 70));
    g.beginPath(); g.moveTo(210, 155); g.lineTo(250, 155); g.moveTo(145, 190); g.lineTo(200, 260); g.moveTo(315, 190); g.lineTo(260, 260); g.stroke();
  });
}

export function signTexture(text, bg = '#0f172a', fg = '#fff') {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = 'bold 110px "Office Arabic", sans-serif'; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.direction = 'rtl'; g.fillText(text, w / 2, h / 2 + 8);
  });
}

// ---------------- cozy winter textures ----------------
export function knitTexture(hexColor) {
  const col = '#' + hexColor.toString(16).padStart(6, '0');
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 14); g.lineTo(x + 16, y); g.lineTo(x + 8, y + 6); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 7, y + 2, 2, 10);
    }
    g.fillStyle = 'rgba(255,255,255,0.55)'; for (const yy of [40, 48, 200, 208]) g.fillRect(0, yy, w, 4);
  }, { repeat: [1, 1] });
}

export function rugTexture(round = false) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b5653f'; g.fillRect(0, 0, w, h);
    const ring = (inset, c) => { g.strokeStyle = c; g.lineWidth = 14; round ? (g.beginPath(), g.arc(w / 2, h / 2, w / 2 - inset, 0, 7), g.stroke()) : g.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
    ring(24, '#efe1c6'); ring(52, '#7a3f26'); ring(80, '#d9a441');
    g.fillStyle = '#efe1c6';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const x = 130 + i * 50, y = 130 + j * 50; if (round && Math.hypot(x - 256, y - 256) > 150) continue;
      g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 14, y); g.lineTo(x, y + 14); g.lineTo(x - 14, y); g.closePath(); g.fill();
    }
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
  });
}

export function snowyWindowTexture() {
  // winter night outside: deep blue sky, stars, moon, snowy hills and pines
  return canvasTex(512, 320, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#081129'); sky.addColorStop(0.7, '#1d3460'); sky.addColorStop(1, '#2e4a78');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; g.fillRect(rnd() * w, rnd() * 170, rnd() > 0.85 ? 2 : 1, rnd() > 0.85 ? 2 : 1); }
    const mg = g.createRadialGradient(400, 60, 6, 400, 60, 60); mg.addColorStop(0, 'rgba(255,248,225,0.95)'); mg.addColorStop(0.3, 'rgba(255,248,225,0.25)'); mg.addColorStop(1, 'rgba(255,248,225,0)');
    g.fillStyle = mg; g.fillRect(330, 0, 140, 130); g.fillStyle = '#fff8e1'; g.beginPath(); g.arc(400, 60, 16, 0, 7); g.fill();
    g.fillStyle = '#b9c8e0'; g.beginPath(); g.moveTo(0, 230); g.quadraticCurveTo(160, 190, 300, 235); g.quadraticCurveTo(420, 210, w, 225); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 58 + rnd() * 20, b = 240 + rnd() * 20, s = 50 + rnd() * 40;
      g.fillStyle = '#132219'; g.beginPath(); g.moveTo(x, b - s * 1.6); g.lineTo(x - s * 0.45, b); g.lineTo(x + s * 0.45, b); g.fill();
      g.fillStyle = '#d6e2f2'; g.beginPath(); g.moveTo(x, b - s * 1.6); g.lineTo(x - s * 0.15, b - s * 1.1); g.lineTo(x + s * 0.15, b - s * 1.1); g.fill();
    }
    g.fillStyle = '#3a2a20'; g.fillRect(360, 196, 56, 34); g.beginPath(); g.moveTo(354, 198); g.lineTo(388, 176); g.lineTo(422, 198); g.fill();
    g.fillStyle = '#ffc46b'; g.fillRect(368, 206, 12, 12); g.fillRect(396, 206, 12, 12); // a far cabin with warm windows
  });
}

export function snowfallTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const r = 1 + rnd() * 2.5; g.fillStyle = `rgba(255,255,255,${0.6 + rnd() * 0.4})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill(); }
  }, { repeat: [3, 2] });
}

export function softDotTexture(inner = 'rgba(255,255,255,1)') {
  return canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
