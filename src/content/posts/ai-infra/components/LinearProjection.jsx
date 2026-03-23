import { useState, useEffect, useRef, useCallback } from 'react';
import LinearSpaceMap from './LinearSpaceMap';

// ── 数据 ──
// 公式: qᵢ = xᵢ · W^Q
// xᵢ: 行向量 (1 × d_model), W^Q: (d_model × d), qᵢ: 行向量 (1 × d)
const SHOW_HEAD = 2;
const SHOW_TAIL = 1;
const FULL_D_MODEL = 8;
const FULL_D = 5;

function seed(i, j) {
  return parseFloat((Math.sin((i + 1) * (j + 1) * 1.618) * 0.55).toFixed(2));
}

// xᵢ: 1 × d_model
const xi_full = Array.from({ length: FULL_D_MODEL }, (_, j) => seed(2, j));

// W^Q: d_model × d (每列对应输出的一个维度)
const WQ_full = Array.from({ length: FULL_D_MODEL }, (_, r) =>
  Array.from({ length: FULL_D }, (__, c) => seed(r * 7 + 3, c))
);

// qᵢ = xᵢ · W^Q → 1 × d
const qi_full = Array.from({ length: FULL_D }, (_, c) =>
  parseFloat(xi_full.reduce((s, x, r) => s + x * WQ_full[r][c], 0).toFixed(2))
);

// 可见切片
function sliceVec(arr) {
  return { head: arr.slice(0, SHOW_HEAD), tail: arr.slice(-SHOW_TAIL) };
}

const xi_vis = sliceVec(xi_full);
const qi_vis = sliceVec(qi_full);

// W^Q 可见: 行取 head+tail of d_model, 列取 head+tail of d
const WQ_vis = {
  headRows: WQ_full.slice(0, SHOW_HEAD).map(row => sliceVec(row)),
  tailRows: WQ_full.slice(-SHOW_TAIL).map(row => sliceVec(row)),
};

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

const VIS_MATRIX = [-1.3, -1.8, 1.35, 0.47];
const TOTAL_STEPS = 3;
const VISIBLE_COLS = SHOW_HEAD + SHOW_TAIL;
const VISIBLE_ROWS = SHOW_HEAD + SHOW_TAIL;

// ── Step 3 数据: X (N × d_model) · W^Q = Q (N × d) ──
const FULL_N = 5; // 序列长度
const X_full = Array.from({ length: FULL_N }, (_, i) =>
  Array.from({ length: FULL_D_MODEL }, (__, j) => seed(i * 3 + 1, j))
);
const Q_full = X_full.map(row =>
  Array.from({ length: FULL_D }, (_, c) =>
    parseFloat(row.reduce((s, x, r) => s + x * WQ_full[r][c], 0).toFixed(2))
  )
);
const X_vis = {
  headRows: X_full.slice(0, SHOW_HEAD).map(r => sliceVec(r)),
  tailRows: X_full.slice(-SHOW_TAIL).map(r => sliceVec(r)),
};
const Q_vis = {
  headRows: Q_full.slice(0, SHOW_HEAD).map(r => sliceVec(r)),
  tailRows: Q_full.slice(-SHOW_TAIL).map(r => sliceVec(r)),
};

export default function LinearProjection() {
  const [step, setStep] = useState(0);
  // calcCol: 逐列高亮 W^Q 的列，对应 qᵢ 的每个元素
  const [calcCol, setCalcCol] = useState(-1);
  // calcBatchRow: step 3 逐行高亮 X 的行
  const [calcBatchRow, setCalcBatchRow] = useState(-1);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    clearTimers();
    setCalcCol(-1);
    const delay = 700;
    for (let c = 0; c <= VISIBLE_COLS; c++) {
      const t = setTimeout(() => setCalcCol(c), 400 + c * delay);
      timersRef.current.push(t);
    }
    return clearTimers;
  }, [step, clearTimers]);

  // Step 3: 逐行动画
  useEffect(() => {
    if (step !== 2) return;
    clearTimers();
    setCalcBatchRow(-1);
    const delay = 600;
    for (let r = 0; r <= VISIBLE_ROWS; r++) {
      const t = setTimeout(() => setCalcBatchRow(r), 400 + r * delay);
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
      aria-label="线性映射 qᵢ = xᵢ W^Q 动画演示"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: 740,
        margin: '2rem auto',
        padding: '1.5rem',
        borderRadius: 12,
        border: '1px solid transparent',
        background: 'transparent',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          {step === 0 && '① 几何直觉：W^Q 对空间的线性变换'}
          {step === 1 && '② 逐列计算：qᵢ = xᵢ · W^Q'}
          {step === 2 && '③ 批量计算：Q = X · W^Q'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={prev} disabled={step === 0}>←</NavBtn>
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'center' }}>
            {step + 1}/{TOTAL_STEPS}
          </span>
          <NavBtn onClick={next} disabled={step === TOTAL_STEPS - 1}>→</NavBtn>
        </div>
      </div>

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
          vectors={[{ x: 2, y: 1.5, label: 'xᵢ', labelAfter: 'qᵢ', color: '#facc15' }]}
          width={680} height={340} unit={50}
          autoPlay duration={2500}
          label={(p) => {
            if (p < 0.05) return 'xᵢ 在原始空间 ℝᵈ 中的位置';
            if (p < 0.95) return 'W^Q 作用于整个空间 — xᵢ 随网格一起被映射';
            return 'xᵢ 变成了 qᵢ — 这就是线性映射 qᵢ = xᵢ W^Q 的几何含义';
          }}
        />
      )}
      {step === 1 && <MatrixView calcCol={calcCol} />}
      {step === 2 && <BatchView calcBatchRow={calcBatchRow} />}
    </div>
  );
}

// ════════════════════════════════════════
// Part 2: qᵢ = xᵢ · W^Q  (行向量 × 矩阵 = 行向量)
// 逐列高亮 W^Q 的列，xᵢ 整行与该列做内积 → qᵢ 对应位置填值
// ════════════════════════════════════════

function visColIndex(isHead, idx) {
  return isHead ? idx : SHOW_HEAD + idx;
}

function MatrixView({ calcCol }) {
  const anyActive = calcCol >= 0 && calcCol < VISIBLE_COLS;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 14, minHeight: 180,
    }}>
      {/* 主公式行: xᵢ · W^Q = qᵢ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, flexWrap: 'wrap',
      }}>
        {/* xᵢ 行向量 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, alignSelf: 'center' }}>
          <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>
            x<sub>i</sub>
          </span>
          <Bracket inline>
            <div style={{ display: 'flex', gap: 2 }}>
              {xi_vis.head.map((v, j) => (
                <Cell key={j} value={v} highlight={anyActive} />
              ))}
              <Dots horizontal />
              {xi_vis.tail.map((v, j) => (
                <Cell key={`t${j}`} value={v} highlight={anyActive} />
              ))}
            </div>
          </Bracket>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
            1 × d<sub>model</sub>
          </span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

        {/* W^Q 矩阵 (d_model × d) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>
            W<sup>Q</sup>
          </span>
          <Bracket>
            {WQ_vis.headRows.map((row, r) => (
              <WQRow key={`h${r}`} row={row} calcCol={calcCol} />
            ))}
            <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Dots vertical /><Dots vertical /><Dots horizontal /><Dots vertical />
            </div>
            {WQ_vis.tailRows.map((row, r) => (
              <WQRow key={`t${r}`} row={row} calcCol={calcCol} />
            ))}
          </Bracket>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
            d<sub>model</sub> × d
          </span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

        {/* qᵢ 行向量 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, alignSelf: 'center' }}>
          <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>
            q<sub>i</sub>
          </span>
          <Bracket accent inline>
            <div style={{ display: 'flex', gap: 2 }}>
              {qi_vis.head.map((v, i) => (
                <QiCell key={`h${i}`} value={v} idx={visColIndex(true, i)} calcCol={calcCol} />
              ))}
              <Dots horizontal />
              {qi_vis.tail.map((v, i) => (
                <QiCell key={`t${i}`} value={v} idx={visColIndex(false, i)} calcCol={calcCol} />
              ))}
            </div>
          </Bracket>
          <span style={{ fontSize: 10, color: '#0891b2', fontFamily: 'monospace' }}>
            1 × d
          </span>
        </div>
      </div>
    </div>
  );
}

function WQRow({ row, calcCol }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {row.head.map((v, c) => {
        const active = calcCol === visColIndex(true, c);
        return <Cell key={c} value={v} highlight={active} />;
      })}
      <Dots horizontal />
      {row.tail.map((v, c) => {
        const active = calcCol === visColIndex(false, c);
        return <Cell key={`t${c}`} value={v} highlight={active} />;
      })}
    </div>
  );
}

function QiCell({ value, idx, calcCol }) {
  const computed = calcCol > idx;
  const computing = calcCol === idx;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 48, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
      background: computed ? vecColor(value) : computing ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
      color: computed ? '#0f172a' : computing ? '#0891b2' : '#cbd5e1',
      border: computing ? '1.5px solid #0891b2' : '1px solid transparent',
      transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
      transform: computed ? 'scale(1)' : computing ? 'scale(1.08)' : 'scale(0.95)',
    }}>
      {computed ? (value > 0 ? '+' : '') + value.toFixed(2) : computing ? '···' : '?'}
    </span>
  );
}

// ════════════════════════════════════════
// Part 3: Q = X · W^Q  (N×d_model · d_model×d = N×d)
// 逐行高亮 X 的行 → Q 对应行填值
// ════════════════════════════════════════

function visRowIndex(isHead, idx) {
  return isHead ? idx : SHOW_HEAD + idx;
}

function BatchView({ calcBatchRow }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10, flexWrap: 'wrap', minHeight: 180,
    }}>
      {/* X (N × d_model) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>X</span>
        <Bracket>
          {X_vis.headRows.map((row, i) => (
            <BatchRow key={`h${i}`} row={row} highlight={calcBatchRow === visRowIndex(true, i)} />
          ))}
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Dots vertical /><Dots vertical /><Dots horizontal /><Dots vertical />
          </div>
          {X_vis.tailRows.map((row, i) => (
            <BatchRow key={`t${i}`} row={row} highlight={calcBatchRow === visRowIndex(false, i)} />
          ))}
        </Bracket>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × d<sub>model</sub></span>
      </div>

      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

      {/* W^Q (d_model × d) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#164e63', fontWeight: 600, fontFamily: 'monospace' }}>
          W<sup>Q</sup>
        </span>
        <Bracket>
          {WQ_vis.headRows.map((row, r) => (
            <BatchRow key={`h${r}`} row={row} highlight={false} />
          ))}
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Dots vertical /><Dots vertical /><Dots horizontal /><Dots vertical />
          </div>
          {WQ_vis.tailRows.map((row, r) => (
            <BatchRow key={`t${r}`} row={row} highlight={false} />
          ))}
        </Bracket>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>d<sub>model</sub> × d</span>
      </div>

      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

      {/* Q (N × d) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>Q</span>
        <Bracket accent>
          {Q_vis.headRows.map((row, i) => (
            <QBatchRow key={`h${i}`} row={row} idx={visRowIndex(true, i)} calcBatchRow={calcBatchRow} />
          ))}
          <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Dots vertical /><Dots vertical /><Dots horizontal /><Dots vertical />
          </div>
          {Q_vis.tailRows.map((row, i) => (
            <QBatchRow key={`t${i}`} row={row} idx={visRowIndex(false, i)} calcBatchRow={calcBatchRow} />
          ))}
        </Bracket>
        <span style={{ fontSize: 10, color: '#0891b2', fontFamily: 'monospace' }}>N × d</span>
      </div>
    </div>
  );
}

function BatchRow({ row, highlight }) {
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: highlight ? 'rgba(8,145,178,0.12)' : 'transparent',
      borderRadius: 3, padding: '1px 2px',
      transition: 'background 200ms',
    }}>
      {row.head.map((v, j) => <Cell key={j} value={v} highlight={highlight} />)}
      <Dots horizontal />
      {row.tail.map((v, j) => <Cell key={`t${j}`} value={v} highlight={highlight} />)}
    </div>
  );
}

function QBatchRow({ row, idx, calcBatchRow }) {
  const computed = calcBatchRow > idx;
  const computing = calcBatchRow === idx;
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: computing ? 'rgba(8,145,178,0.15)' : 'transparent',
      borderRadius: 3, padding: '1px 2px',
      transition: 'background 250ms',
    }}>
      {row.head.map((v, j) => (
        <span key={j} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
          background: computed ? vecColor(v) : computing ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
          color: computed ? '#0f172a' : computing ? '#0891b2' : '#cbd5e1',
          border: computing ? '1.5px solid #0891b2' : '1px solid transparent',
          transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
        }}>
          {computed ? (v > 0 ? '+' : '') + v.toFixed(2) : computing ? '···' : '?'}
        </span>
      ))}
      <Dots horizontal />
      {row.tail.map((v, j) => (
        <span key={`t${j}`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
          background: computed ? vecColor(v) : computing ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
          color: computed ? '#0f172a' : computing ? '#0891b2' : '#cbd5e1',
          border: computing ? '1.5px solid #0891b2' : '1px solid transparent',
          transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
        }}>
          {computed ? (v > 0 ? '+' : '') + v.toFixed(2) : computing ? '···' : '?'}
        </span>
      ))}
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

function Dots({ horizontal, vertical }) {
  if (horizontal) {
    return (
      <span style={{
        width: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none',
      }}>⋯</span>
    );
  }
  return (
    <span style={{
      width: 42, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none',
    }}>⋮</span>
  );
}

function Bracket({ children, accent, inline }) {
  const color = accent ? '#0891b2' : '#cbd5e1';
  // inline mode: fixed-height brackets for single-row vectors
  if (inline) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <span style={{
          fontSize: 22, fontWeight: 200, color, lineHeight: 1,
          userSelect: 'none', fontFamily: 'monospace',
        }}>[</span>
        <div style={{ display: 'flex', gap: 2, padding: '2px 3px' }}>
          {children}
        </div>
        <span style={{
          fontSize: 22, fontWeight: 200, color, lineHeight: 1,
          userSelect: 'none', fontFamily: 'monospace',
        }}>]</span>
      </div>
    );
  }
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
