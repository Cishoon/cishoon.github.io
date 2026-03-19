import { useState, useEffect, useRef, useCallback } from 'react';
import LinearSpaceMap from './LinearSpaceMap';

// ── 数据 ──
const D_MODEL = 5;
const D_K = 3;

function seed(i, j) {
  return parseFloat((Math.sin((i + 1) * (j + 1) * 1.618) * 0.55).toFixed(2));
}

const xi = Array.from({ length: D_MODEL }, (_, j) => seed(2, j));
const WQ = Array.from({ length: D_K }, (_, i) =>
  Array.from({ length: D_MODEL }, (__, j) => seed(i * 7 + 3, j))
);
const qi = WQ.map(row =>
  parseFloat(row.reduce((s, w, j) => s + w * xi[j], 0).toFixed(2))
);

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

// W^Q 的前两行前两列作为 2×2 变换矩阵用于可视化
// matrix = [a, b, c, d] → î→(a,b), ĵ→(c,d)
const VIS_MATRIX = [1.5, 0.5, -0.5, 1.2];

const TOTAL_STEPS = 2;

export default function LinearProjection() {
  const [step, setStep] = useState(0);
  const [calcRow, setCalcRow] = useState(-1);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  // 矩阵逐行计算动画
  useEffect(() => {
    if (step !== 1) return;
    clearTimers();
    setCalcRow(-1);
    const delay = 600;
    for (let r = 0; r <= D_K; r++) {
      const t = setTimeout(() => setCalcRow(r), 400 + r * delay);
      timersRef.current.push(t);
    }
    return clearTimers;
  }, [step, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);
  const next = useCallback(() => setStep(s => Math.min(TOTAL_STEPS - 1, s + 1)), []);

  return (
    <div
      role="figure"
      aria-label="线性映射 W^Q · x_i 动画演示"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: 740,
        margin: '2rem auto',
        padding: '1.5rem',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        outline: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          {step === 0
            ? '① 几何直觉：W^Q 对空间的线性变换'
            : '② 逐行计算：q_i = W^Q · x_i'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={prev} disabled={step === 0}>←</NavBtn>
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'center' }}>
            {step + 1}/{TOTAL_STEPS}
          </span>
          <NavBtn onClick={next} disabled={step === TOTAL_STEPS - 1}>→</NavBtn>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? '#0891b2' : '#e2e8f0',
            transition: 'background 250ms',
          }} />
        ))}
      </div>

      {step === 0 && (
        <LinearSpaceMap
          matrix={VIS_MATRIX}
          width={680}
          height={320}
          unit={50}
          autoPlay
          duration={2500}
          label={(p) => {
            if (p < 0.05) return '单位矩阵 I — 原始空间，网格正交均匀';
            if (p < 0.95) return 'W^Q 正在扭曲空间 — 网格随矩阵变形，基向量旋转拉伸';
            return '变换完成 — 这就是 W^Q 对整个空间的作用';
          }}
        />
      )}
      {step === 1 && <MatrixView calcRow={calcRow} />}
    </div>
  );
}

// ════════════════════════════════════════
// Part 2: 矩阵逐行计算动画
// ════════════════════════════════════════
function MatrixView({ calcRow }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10, flexWrap: 'wrap', minHeight: 160,
    }}>
      {/* W^Q */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>
          W<sup>Q</sup>
        </span>
        <Bracket rows={D_K}>
          {WQ.map((row, i) => (
            <div key={i} style={{
              display: 'flex', gap: 2,
              background: i === calcRow ? 'rgba(8,145,178,0.12)' : 'transparent',
              borderRadius: 3, padding: '1px 2px',
              transition: 'background 200ms',
            }}>
              {row.map((v, j) => (
                <Cell key={j} value={v} highlight={i === calcRow} />
              ))}
            </div>
          ))}
        </Bracket>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>{D_K}×{D_MODEL}</span>
      </div>

      {/* · */}
      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

      {/* x_i */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>
          x<sub>i</sub>
        </span>
        <Bracket rows={D_MODEL}>
          {xi.map((v, j) => (
            <div key={j} style={{ display: 'flex' }}>
              <Cell value={v} highlight={calcRow >= 0 && calcRow < D_K} />
            </div>
          ))}
        </Bracket>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>ℝ<sup>{D_MODEL}</sup></span>
      </div>

      {/* = */}
      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

      {/* q_i 结果 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>
          q<sub>i</sub>
        </span>
        <Bracket rows={D_K} accent>
          {qi.map((v, i) => {
            const computed = calcRow > i;
            const computing = calcRow === i;
            return (
              <div key={i} style={{
                display: 'flex',
                background: computing ? 'rgba(8,145,178,0.15)' : 'transparent',
                borderRadius: 3, padding: '1px 2px',
                transition: 'background 250ms',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 48, height: 26, borderRadius: 3,
                  fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                  background: computed ? vecColor(v) : computing ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
                  color: computed ? '#0f172a' : computing ? '#0891b2' : '#cbd5e1',
                  border: computing ? '1.5px solid #0891b2' : '1px solid transparent',
                  transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
                  transform: computed ? 'scale(1)' : computing ? 'scale(1.08)' : 'scale(0.95)',
                }}>
                  {computed ? (v > 0 ? '+' : '') + v.toFixed(2) : computing ? '···' : '?'}
                </span>
              </div>
            );
          })}
        </Bracket>
        <span style={{ fontSize: 10, color: '#0891b2' }}>ℝ<sup>{D_K}</sup></span>
      </div>
    </div>
  );
}

// ── 共用组件 ──
function Cell({ value, highlight }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 42, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
      background: highlight ? 'rgba(8,145,178,0.15)' : vecColor(value) + '59',
      color: '#0f172a',
      border: highlight ? '1.5px solid #0891b2' : '1px solid transparent',
      transition: 'all 200ms',
    }}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

function Bracket({ children, rows, accent }) {
  const color = accent ? '#0891b2' : '#cbd5e1';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}>
        <path d="M5,2 Q2,2 2,6 L2,94 Q2,98 5,98" fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 3px' }}>
        {children}
      </div>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}>
        <path d="M1,2 Q4,2 4,6 L4,94 Q4,98 1,98" fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function NavBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={children === '←' ? '上一步' : '下一步'}
      style={{
        width: 28, height: 28, borderRadius: 6,
        border: '1px solid #e2e8f0',
        background: disabled ? '#f1f5f9' : '#fff',
        color: disabled ? '#cbd5e1' : '#164e63',
        fontSize: 14, cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms',
      }}
    >
      {children}
    </button>
  );
}
