/**
 * LinearSpaceMap — 可复用 2D 线性变换动画
 *
 * 核心特性：
 *  - 原始网格始终保留（灰色虚线），变换后网格叠加显示
 *  - 基向量 î ĵ 动画
 *  - 自定义向量跟随变换，原始位置保留为 ghost
 *
 * Props:
 *   matrix    [a,b,c,d] — î→(a,b), ĵ→(c,d)
 *   vectors   [{ x, y, label, color, labelAfter }]
 *   width, height, unit, gridLimit
 *   autoPlay, duration
 *   iHatColor, jHatColor, bgColor
 *   label     (progress) => string
 */
import { useState, useEffect, useRef, useCallback } from 'react';

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export default function LinearSpaceMap({
  matrix = [0, -1.8, 1.5, 0.4],
  vectors = [],
  width = 400,
  height = 280,
  unit = 40,
  gridLimit = 8,
  autoPlay = false,
  duration = 2500,
  iHatColor = '#2dd4bf',
  jHatColor = '#f43f5e',
  bgColor = '#0f172a',
  label,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const pRef = useRef(0);
  useEffect(() => { pRef.current = progress; }, [progress]);
  const [ta, tb, tc, td] = matrix;

  const draw = useCallback((p) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cvs.width = width * dpr;
    cvs.height = height * dpr;
    ctx.scale(dpr, dpr);
    const cx = width / 2, cy = height / 2;
    const ep = easeInOut(p);
    const ma = 1 + (ta - 1) * ep;
    const mb = tb * ep;
    const mc = tc * ep;
    const md = 1 + (td - 1) * ep;
    const toC = (x, y) => ({ x: cx + x * unit, y: cy - y * unit });
    const tf = (x, y) => ({ x: ma * x + mc * y, y: mb * x + md * y });

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // ── Layer 1: 原始网格（始终保留，虚线） ──
    const ghostAlpha = p < 0.01 ? 0.35 : 0.15;
    for (let i = -gridLimit; i <= gridLimit; i++) {
      // vertical (x = i)
      const vc1 = toC(i, -gridLimit), vc2 = toC(i, gridLimit);
      ctx.beginPath(); ctx.moveTo(vc1.x, vc1.y); ctx.lineTo(vc2.x, vc2.y);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = i === 0
        ? `rgba(148,163,184,${ghostAlpha + 0.15})`
        : `rgba(148,163,184,${ghostAlpha})`;
      ctx.lineWidth = i === 0 ? 1 : 0.5;
      ctx.stroke();
      // horizontal (y = i)
      const hc1 = toC(-gridLimit, i), hc2 = toC(gridLimit, i);
      ctx.beginPath(); ctx.moveTo(hc1.x, hc1.y); ctx.lineTo(hc2.x, hc2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Layer 2: 变换后网格（实线） ──
    const gc = 'rgba(100,116,139,0.22)';
    for (let i = -gridLimit; i <= gridLimit; i++) {
      let v1 = tf(i, -gridLimit), v2 = tf(i, gridLimit);
      let c1 = toC(v1.x, v1.y), c2 = toC(v2.x, v2.y);
      ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
      ctx.strokeStyle = i === 0 ? iHatColor + '55' : gc;
      ctx.lineWidth = i === 0 ? 1.8 : 0.8; ctx.stroke();

      let h1 = tf(-gridLimit, i), h2 = tf(gridLimit, i);
      let d1 = toC(h1.x, h1.y), d2 = toC(h2.x, h2.y);
      ctx.beginPath(); ctx.moveTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y);
      ctx.strokeStyle = i === 0 ? jHatColor + '55' : gc;
      ctx.lineWidth = i === 0 ? 1.8 : 0.8; ctx.stroke();
    }

    const o = toC(0, 0);

    // ── Layer 3: 原始基向量 ghost（变换开始后保留） ──
    if (p > 0.02) {
      ctx.globalAlpha = 0.25;
      const iO = toC(1, 0), jO = toC(0, 1);
      arrow(ctx, o.x, o.y, iO.x, iO.y, iHatColor, 1.5);
      arrow(ctx, o.x, o.y, jO.x, jO.y, jHatColor, 1.5);
      ctx.font = '500 10px monospace';
      ctx.fillStyle = iHatColor; ctx.fillText('î₀', iO.x + 4, iO.y - 4);
      ctx.fillStyle = jHatColor; ctx.fillText('ĵ₀', jO.x + 4, jO.y - 4);
      ctx.globalAlpha = 1;
    }

    // ── Layer 4: 变换后基向量 ──
    const iE = toC(ma, mb), jE = toC(mc, md);
    arrow(ctx, o.x, o.y, iE.x, iE.y, iHatColor, 2.8);
    arrow(ctx, o.x, o.y, jE.x, jE.y, jHatColor, 2.8);
    ctx.font = '600 11px monospace';
    ctx.fillStyle = iHatColor; ctx.fillText('î', iE.x + 6, iE.y - 6);
    ctx.fillStyle = jHatColor; ctx.fillText('ĵ', jE.x + 6, jE.y - 6);

    // ── Layer 5: 跟踪向量 ──
    vectors.forEach((v) => {
      const t0 = toC(v.x, v.y);
      const tv = tf(v.x, v.y);
      const t1 = toC(tv.x, tv.y);
      const col = v.color || '#facc15';

      // ghost: 原始位置始终保留
      if (p > 0.02) {
        ctx.globalAlpha = 0.35;
        arrow(ctx, o.x, o.y, t0.x, t0.y, col, 1.8);
        ctx.beginPath(); ctx.arc(t0.x, t0.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.font = '600 11px monospace';
        ctx.fillStyle = col;
        ctx.fillText(v.label || '', t0.x + 6, t0.y - 6);
        // original coords
        ctx.font = '500 9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(`(${v.x.toFixed(1)}, ${v.y.toFixed(1)})`, t0.x + 6, t0.y + 9);
        ctx.globalAlpha = 1;
      }

      // dashed trail connecting ghost → current
      if (p > 0.05 && p < 0.98) {
        ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = col + '55'; ctx.lineWidth = 1; ctx.stroke();
        ctx.setLineDash([]);
      }

      // current transformed position
      arrow(ctx, o.x, o.y, t1.x, t1.y, col, 2.8);
      ctx.beginPath(); ctx.arc(t1.x, t1.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();

      // label
      ctx.font = '700 12px monospace';
      ctx.fillStyle = col;
      const lbl = p > 0.95 && v.labelAfter ? v.labelAfter : (v.label || '');
      ctx.fillText(lbl, t1.x + 8, t1.y - 8);

      // transformed coords
      ctx.font = '500 9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`(${tv.x.toFixed(1)}, ${tv.y.toFixed(1)})`, t1.x + 8, t1.y + 9);
    });

    // origin
    ctx.beginPath(); ctx.arc(o.x, o.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }, [ta, tb, tc, td, width, height, unit, gridLimit, iHatColor, jHatColor, bgColor, vectors]);

  useEffect(() => { draw(progress); }, [draw, progress]);

  const animate = useCallback(() => {
    if (!startTimeRef.current) startTimeRef.current = performance.now();
    const elapsed = performance.now() - startTimeRef.current;
    const p = Math.min(elapsed / duration, 1);
    setProgress(p);
    draw(p);
    if (p < 1) { rafRef.current = requestAnimationFrame(animate); }
    else { setIsPlaying(false); }
  }, [draw, duration]);

  const play = useCallback(() => {
    setProgress(0); draw(0);
    startTimeRef.current = null;
    setIsPlaying(true);
  }, [draw]);

  useEffect(() => {
    if (isPlaying) { rafRef.current = requestAnimationFrame(animate); }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, animate]);

  useEffect(() => {
    if (autoPlay) { const t = setTimeout(play, 400); return () => clearTimeout(t); }
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const labelText = typeof label === 'function' ? label(progress) : label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <canvas ref={canvasRef} style={{ width, height, borderRadius: 8 }} />
      <button
        onClick={play}
        aria-label="播放动画"
        style={{
          padding: '6px 20px', borderRadius: 6,
          border: '1px solid #334155',
          background: isPlaying ? '#334155' : '#0891b2',
          color: '#fff', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', transition: 'all 150ms',
        }}
      >
        {isPlaying ? '播放中…' : progress >= 1 ? '↻ 重播' : '▶ 播放'}
      </button>
      {labelText && (
        <div style={{
          fontSize: 12, color: '#475569', fontFamily: 'monospace',
          textAlign: 'center', padding: '4px 8px', borderRadius: 6,
          background: progress >= 1 ? 'rgba(8,145,178,0.06)' : 'transparent',
          transition: 'background 300ms',
        }}>
          {labelText}
        </div>
      )}
    </div>
  );
}

function arrow(ctx, fx, fy, tx, ty, color, lw) {
  const hl = 9, dx = tx - fx, dy = ty - fy, a = Math.atan2(dy, dx);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx, ty);
  ctx.lineTo(tx - hl * Math.cos(a - Math.PI / 6), ty - hl * Math.sin(a - Math.PI / 6));
  ctx.lineTo(tx - hl * Math.cos(a + Math.PI / 6), ty - hl * Math.sin(a + Math.PI / 6));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
