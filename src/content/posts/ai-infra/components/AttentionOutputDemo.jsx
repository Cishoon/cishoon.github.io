/**
 * AttentionOutputDemo — O = P · V 逐格动画
 * P (N×N) × V (N×d) = O (N×d)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// ── 复用同一组矩阵数据 ──
const SH = 2, ST = 1;
const N_FULL = 5, D_FULL = 4;

function sd(i, j) {
  return parseFloat((Math.sin((i + 1) * (j + 1) * 1.618) * 0.55).toFixed(2));
}

const K_full = Array.from({ length: N_FULL }, (_, i) =>
  Array.from({ length: D_FULL }, (__, j) => sd(i * 5 + 2, j))
);
const Q_full = Array.from({ length: N_FULL }, (_, i) =>
  Array.from({ length: D_FULL }, (__, j) => sd(i * 3 + 7, j))
);
const S_full = Q_full.map(qr =>
  K_full.map(kr =>
    parseFloat(qr.reduce((s, v, j) => s + v * kr[j], 0).toFixed(2))
  )
);

function softmaxRow(row) {
  const max = Math.max(...row);
  const exps = row.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => parseFloat((e / sum).toFixed(4)));
}

const P_full = S_full.map(r => softmaxRow(r));

// V: N × d
const V_full = Array.from({ length: N_FULL }, (_, i) =>
  Array.from({ length: D_FULL }, (__, j) => sd(i * 7 + 3, j + 11))
);

// O = P · V → N × d
const O_full = P_full.map(pr =>
  Array.from({ length: D_FULL }, (_, j) =>
    parseFloat(pr.reduce((s, p, k) => s + p * V_full[k][j], 0).toFixed(2))
  )
);

function slc(arr) { return { head: arr.slice(0, SH), tail: arr.slice(-ST) }; }

const P_vis = {
  headRows: P_full.slice(0, SH).map(r => slc(r)),
  tailRows: P_full.slice(-ST).map(r => slc(r)),
};
const V_vis = {
  headRows: V_full.slice(0, SH).map(r => slc(r)),
  tailRows: V_full.slice(-ST).map(r => slc(r)),
};
const O_vis = {
  headRows: O_full.slice(0, SH).map(r => slc(r)),
  tailRows: O_full.slice(-ST).map(r => slc(r)),
};

const VIS_ROWS = SH + ST; // 3
const VIS_COLS = SH + ST; // 3
const TOTAL_CELLS = VIS_ROWS * VIS_COLS; // 9

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

function probBg(p) {
  const t = Math.min(p * N_FULL, 1);
  return `rgba(124,58,237,${(0.08 + t * 0.35).toFixed(2)})`;
}

const SUB_LABEL = (vi) => vi < SH ? String(vi) : 'N-1';

export default function AttentionOutputDemo() {
  // calcStep: -1=initial, 0..TOTAL_CELLS-1=computing cell, TOTAL_CELLS=all done
  const [calcStep, setCalcStep] = useState(-1);
  const [playKey, setPlayKey] = useState(0);
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current = [];
  }, []);

  const replay = useCallback(() => setPlayKey(k => k + 1), []);

  useEffect(() => {
    clearTimers();
    setCalcStep(-1);

    for (let c = 0; c <= TOTAL_CELLS; c++) {
      timers.current.push(setTimeout(() => setCalcStep(c), 600 + c * 550));
    }

    return clearTimers;
  }, [clearTimers, playKey]);

  const curRow = calcStep >= 0 && calcStep < TOTAL_CELLS ? Math.floor(calcStep / VIS_COLS) : -1;
  const curCol = calcStep >= 0 && calcStep < TOTAL_CELLS ? calcStep % VIS_COLS : -1;
  const allDone = calcStep >= TOTAL_CELLS;

  return (
    <div role="figure" aria-label="O = P · V 演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 740,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      border: '1px solid transparent', background: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          O = P · V (加权求和)
        </span>
        <button onClick={replay} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
          background: allDone ? '#fff' : '#f1f5f9',
          color: allDone ? '#164e63' : '#94a3b8',
          fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
          transition: 'all 150ms',
        }}>
          <span style={{ fontSize: 14 }}>▶</span> 重播
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, flexWrap: 'wrap', minHeight: 180,
      }}>
        {/* P (N × N) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, fontFamily: 'monospace' }}>P</span>
          <Bk color="#7c3aed">
            {P_vis.headRows.map((row, i) => (
              <PRow key={`h${i}`} row={row} hl={curRow === i} />
            ))}
            <EllipsisRow />
            {P_vis.tailRows.map((row, i) => (
              <PRow key={`t${i}`} row={row} hl={curRow === SH + i} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × N</span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

        {/* V (N × d) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#e67e22', fontWeight: 600, fontFamily: 'monospace' }}>V</span>
          <Bk color="#e67e22">
            {V_vis.headRows.map((row, i) => (
              <VRow key={`h${i}`} row={row} hlCol={curCol} />
            ))}
            <EllipsisRow />
            {V_vis.tailRows.map((row, i) => (
              <VRow key={`t${i}`} row={row} hlCol={curCol} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × d</span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

        {/* O (N × d) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#059669', fontWeight: 600, fontFamily: 'monospace' }}>O</span>
          <Bk color="#059669" accent>
            {O_vis.headRows.map((row, i) => (
              <ORow key={`h${i}`} row={row} visRow={i} calcStep={calcStep} />
            ))}
            <EllipsisRow />
            {O_vis.tailRows.map((row, i) => (
              <ORow key={`t${i}`} row={row} visRow={SH + i} calcStep={calcStep} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#059669', fontFamily: 'monospace' }}>N × d</span>
        </div>
      </div>

      {/* 注释 */}
      <div style={{ marginTop: 14, textAlign: 'center', minHeight: 36 }}>
        {curRow >= 0 && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace', display: 'inline-block',
            padding: '6px 14px', borderRadius: 6,
            background: 'rgba(5,150,105,0.08)', color: '#059669',
          }}>
            <span style={{ color: '#7c3aed' }}>P</span>{' 第 '}{SUB_LABEL(curRow)}{' 行'}
            {' × '}
            <span style={{ color: '#e67e22' }}>V</span>{' 第 '}{SUB_LABEL(curCol)}{' 列'}
            {' → '}
            <span style={{ fontWeight: 700 }}>
              O<sub>{SUB_LABEL(curRow)},{SUB_LABEL(curCol)}</sub> = Σ α<sub>{SUB_LABEL(curRow)},k</sub> · v<sub>k,{SUB_LABEL(curCol)}</sub>
            </span>
          </div>
        )}
        {allDone && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace', display: 'inline-block',
            padding: '6px 14px', borderRadius: 6,
            background: 'rgba(5,150,105,0.08)', color: '#059669',
          }}>
            O = P · V — 每行 o<sub>i</sub> 是所有 v<sub>j</sub> 按注意力权重的加权求和
          </div>
        )}
      </div>
    </div>
  );
}

// ── P 矩阵行: 高亮当前计算行 ──
function PRow({ row, hl }) {
  return (
    <div style={{
      display: 'flex', gap: 2, borderRadius: 3, padding: '1px 2px',
      background: hl ? 'rgba(124,58,237,0.15)' : 'transparent',
      transition: 'background 200ms',
    }}>
      {row.head.map((v, j) => (
        <span key={j} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
          background: probBg(v), color: '#0f172a',
          border: hl ? '1.5px solid #7c3aed' : '1px solid transparent',
          transition: 'all 200ms',
        }}>
          {v.toFixed(2)}
        </span>
      ))}
      <Dots h />
      {row.tail.map((v, j) => (
        <span key={`t${j}`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
          background: probBg(v), color: '#0f172a',
          border: hl ? '1.5px solid #7c3aed' : '1px solid transparent',
          transition: 'all 200ms',
        }}>
          {v.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

// ── V 矩阵行: 高亮当前计算列 ──
function VRow({ row, hlCol }) {
  const hasHl = hlCol >= 0;
  return (
    <div style={{ display: 'flex', gap: 2, borderRadius: 3, padding: '1px 2px' }}>
      {row.head.map((v, j) => (
        <span key={j} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
          background: (hasHl && j === hlCol) ? 'rgba(230,126,34,0.2)' : vecColor(v) + '59',
          color: '#0f172a',
          border: (hasHl && j === hlCol) ? '1.5px solid #e67e22' : '1px solid transparent',
          transition: 'all 200ms',
        }}>
          {v > 0 ? '+' : ''}{v.toFixed(2)}
        </span>
      ))}
      <Dots h />
      {row.tail.map((v, j) => (
        <span key={`t${j}`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
          background: (hasHl && (SH + j) === hlCol) ? 'rgba(230,126,34,0.2)' : vecColor(v) + '59',
          color: '#0f172a',
          border: (hasHl && (SH + j) === hlCol) ? '1.5px solid #e67e22' : '1px solid transparent',
          transition: 'all 200ms',
        }}>
          {v > 0 ? '+' : ''}{v.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

// ── O 矩阵行: 逐格填充 ──
function ORow({ row, visRow, calcStep }) {
  const rowActive = calcStep >= 0 && calcStep < TOTAL_CELLS && Math.floor(calcStep / VIS_COLS) === visRow;
  return (
    <div style={{
      display: 'flex', gap: 2, borderRadius: 3, padding: '1px 2px',
      background: rowActive ? 'rgba(5,150,105,0.1)' : 'transparent',
      transition: 'background 250ms',
    }}>
      {row.head.map((v, j) => {
        const cellIdx = visRow * VIS_COLS + j;
        return <OCell key={j} v={v} done={calcStep > cellIdx} active={calcStep === cellIdx} />;
      })}
      <Dots h />
      {row.tail.map((v, j) => {
        const cellIdx = visRow * VIS_COLS + SH + j;
        return <OCell key={`t${j}`} v={v} done={calcStep > cellIdx} active={calcStep === cellIdx} />;
      })}
    </div>
  );
}

function OCell({ v, done, active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 42, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
      background: done ? vecColor(v) : active ? 'rgba(5,150,105,0.25)' : '#f1f5f9',
      color: done ? '#0f172a' : active ? '#059669' : '#cbd5e1',
      border: active ? '1.5px solid #059669' : '1px solid transparent',
      transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
    }}>
      {done ? (v > 0 ? '+' : '') + v.toFixed(2) : active ? '···' : '?'}
    </span>
  );
}

// ── 共用小组件 ──

function EllipsisRow() {
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
      <Dots /><Dots /><Dots h /><Dots />
    </div>
  );
}

function Dots({ h }) {
  if (h) return <span style={{ width: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none' }}>⋯</span>;
  return <span style={{ width: 42, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none' }}>⋮</span>;
}

function Bk({ children, color = '#cbd5e1', accent }) {
  const c = accent ? color : color + '99';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M5,2 Q2,2 2,6 L2,94 Q2,98 5,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 3px' }}>{children}</div>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M1,2 Q4,2 4,6 L4,94 Q4,98 1,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
    </div>
  );
}
