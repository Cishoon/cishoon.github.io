/**
 * LinearSpaceMap — 可复用的 2D 线性空间变换动画组件
 *
 * 参考 3Blue1Brown 风格：网格随矩阵变形 + 基向量动画
 * 用 Canvas 绘制，支持自动播放、手动拖拽进度条、自定义矩阵。
 *
 * Props:
 *   matrix       — 目标变换矩阵 [a, b, c, d]，含义: î→(a,b), ĵ→(c,d)
 *   width        — canvas 宽度 (default 400)
 *   height       — canvas 高度 (default 280)
 *   unit         — 1个数学单位对应的像素 (default 40)
 *   gridLimit    — 网格范围 ±n (default 8)
 *   autoPlay     — 是否自动播放 (default false)
 *   duration     — 动画时长 ms (default 2000)
 *   iHatColor    — î 颜色 (default '#2dd4bf')
 *   jHatColor    — ĵ 颜色 (default '#f43f5e')
 *   gridColor    — 网格线颜色 (default 'rgba(100,116,139,0.25)')
 *   bgColor      — 背景色 (default '#0f172a')
 *   label        — 底部说明文字 (string | (progress) => string)
 *   showSlider   — 是否显示进度条 (default true)
 *   showPlayBtn  — 是否显示播放按钮 (default true)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export default function LinearSpaceMap({
  matrix = [1.5, 0.5, -0.5, 1.2],
  width = 400,
  height = 280,
  unit = 40,
  gridLimit = 8,
  autoPlay = false,
  duration = 2000,
  iHatColor = '#2dd4bf',
  jHatColor = '#f43f5e',
  gridColor = 'rgba(100,116,139,0.25)',
  bgColor = '#0f172a',
  label,
  showSlider = true,
  showPlayBtn = true,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startTimeRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const progressRef = useRef(0);

  // 同步 ref
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const [ta, tb, tc, td] = matrix;

  // ── 绘制 ──
  const draw = useCallback((p) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const cx = width / 2;
    const cy = height / 2;
    const ep = easeInOut(p);

    // 当前插值矩阵: identity → target
    const ma = 1 + (ta - 1) * ep;
    const mb = 0 + tb * ep;
    const mc = 0 + tc * ep;
    const md = 1 + (td - 1) * ep;

    // 数学坐标 → canvas 坐标
    const toCanvas = (x, y) => ({
      x: cx + x * unit,
      y: cy - y * unit,
    });

    // 变换后的数学坐标
    const transform = (x, y) => ({
      x: ma * x + mc * y,
      y: mb * x + md * y,
    });

    // 清屏
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // ── 网格线 ──
    for (let i = -gridLimit; i <= gridLimit; i++) {
      // 垂直线 (x = i)
      const v1 = transform(i, -gridLimit);
      const v2 = transform(i, gridLimit);
      const cv1 = toCanvas(v1.x, v1.y);
      const cv2 = toCanvas(v2.x, v2.y);
      ctx.beginPath();
      ctx.moveTo(cv1.x, cv1.y);
      ctx.lineTo(cv2.x, cv2.y);
      if (i === 0) {
        ctx.strokeStyle = iHatColor + '55';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();

      // 水平线 (y = i)
      const h1 = transform(-gridLimit, i);
      const h2 = transform(gridLimit, i);
      const ch1 = toCanvas(h1.x, h1.y);
      const ch2 = toCanvas(h2.x, h2.y);
      ctx.beginPath();
      ctx.moveTo(ch1.x, ch1.y);
      ctx.lineTo(ch2.x, ch2.y);
      if (i === 0) {
        ctx.strokeStyle = jHatColor + '55';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    }

    // ── 基向量箭头 ──
    const origin = toCanvas(0, 0);

    // î = (ma, mb)
    const iEnd = toCanvas(ma, mb);
    drawArrow(ctx, origin.x, origin.y, iEnd.x, iEnd.y, iHatColor, 2.5);

    // ĵ = (mc, md)
    const jEnd = toCanvas(mc, md);
    drawArrow(ctx, origin.x, origin.y, jEnd.x, jEnd.y, jHatColor, 2.5);

    // 标签
    ctx.font = '600 11px monospace';
    ctx.fillStyle = iHatColor;
    ctx.fillText('î', iEnd.x + 6, iEnd.y - 4);
    ctx.fillStyle = jHatColor;
    ctx.fillText('ĵ', jEnd.x + 6, jEnd.y - 4);

    // 原点
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }, [ta, tb, tc, td, width, height, unit, gridLimit, iHatColor, jHatColor, gridColor, bgColor]);

  // 初始绘制
  useEffect(() => { draw(progress); }, [draw, progress]);

  // ── 动画循环 ──
  const animate = useCallback(() => {
    if (!startTimeRef.current) startTimeRef.current = performance.now();
    const elapsed = performance.now() - startTimeRef.current;
    const p = Math.min(elapsed / duration, 1);
    setProgress(p);
    draw(p);
    if (p < 1) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      setIsPlaying(false);
    }
  }, [draw, duration]);

  const play = useCallback(() => {
    if (progressRef.current >= 1) {
      setProgress(0);
      draw(0);
    }
    startTimeRef.current = performance.now() - progressRef.current * duration;
    setIsPlaying(true);
  }, [draw, duration]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const reset = useCallback(() => {
    pause();
    setProgress(0);
    draw(0);
  }, [pause, draw]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, animate]);

  // autoPlay
  useEffect(() => {
    if (autoPlay) {
      const t = setTimeout(() => play(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPlay, play]);

  // cleanup
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── 滑块拖拽 ──
  const onSlider = (e) => {
    pause();
    const v = parseFloat(e.target.value);
    setProgress(v);
    draw(v);
  };

  // ── label 文字 ──
  const labelText = typeof label === 'function' ? label(progress) : label;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <canvas
        ref={canvasRef}
        style={{ width, height, borderRadius: 8 }}
      />

      {/* 控制栏 */}
      {(showSlider || showPlayBtn) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          maxWidth: width, padding: '0 4px',
        }}>
          {showPlayBtn && (
            <button
              onClick={isPlaying ? pause : play}
              aria-label={isPlaying ? '暂停' : '播放'}
              style={{
                width: 32, height: 28, borderRadius: 6, flexShrink: 0,
                border: '1px solid #334155',
                background: isPlaying ? '#334155' : '#0891b2',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 150ms',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          )}
          {showSlider && (
            <input
              type="range" min="0" max="1" step="0.002"
              value={progress}
              onChange={onSlider}
              aria-label="变换进度"
              style={{
                flex: 1, height: 4, accentColor: '#0891b2',
                cursor: 'pointer',
              }}
            />
          )}
          <span style={{
            fontSize: 11, color: '#64748b', fontFamily: 'monospace',
            minWidth: 32, textAlign: 'right', flexShrink: 0,
          }}>
            {Math.round(progress * 100)}%
          </span>
        </div>
      )}

      {/* 说明文字 */}
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

// ── 箭头绘制 ──
function drawArrow(ctx, fx, fy, tx, ty, color, lineWidth = 2) {
  const headLen = 10;
  const dx = tx - fx;
  const dy = ty - fy;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
