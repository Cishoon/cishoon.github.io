/**
 * SoftmaxDemo — Softmax 动画演示
 * 将 S 矩阵逐行做 softmax，变成注意力权重矩阵 P
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// ── 复用 DotProductDemo 的矩阵数据 ──
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

// softmax per row
function softmaxRow(row) {
  const max = Math.max(...row);
  const exps = row.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => parseFloat((e / sum).toFixed(4)));
}

const P_full = S_full.map(r => softmaxRow(r));

function slc(arr) { return { head: arr.slice(0, SH), tail: arr.slice(-ST) }; }

const S_vis = {
  headRows: S_full.slice(0, SH).map(r => slc(r)),
  tailRows: S_full.slice(-ST).map(r => slc(r)),
};
const P_vis = {
  headRows: P_full.slice(0, SH).map(r => slc(r)),
  tailRows: P_full.slice(-ST).map(r => slc(r)),
};

const VIS_ROWS = SH + ST; // 3

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

// softmax 结果用绿色渐变 (概率 0~1)
function probColor(p) {
  // 从浅蓝到深青
  const t = Math.min(p * N_FULL, 1); // normalize: uniform = 1/N → t≈1
  return `rgb(${Math.round(224 - t * 190)},${Math.round(242 - t * 100)},${Math.round(254 - t * 60)})`;
}

function probBg(p) {
  const t = Math.min(p * N_FULL, 1);
  return `rgba(8,145,178,${(0.08 + t * 0.35).toFixed(2)})`;
}

export default function SoftmaxDemo() {
  // activeRow: -1=初始显示S, 0..VIS_ROWS-1=正在计算该行, VIS_ROWS=全部完成
  const [activeRow, setActiveRow] = useState(-1);
  // 每行内的动画阶段: 0=显示exp, 1=显示sum, 2=显示结果
  const [rowPhase, setRowPhase] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const timers = useRef([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current = [];
  }, []);

  const replay = useCallback(() => setPlayKey(k => k + 1), []);

  useEffect(() => {
    clearTimers();
    setActiveRow(-1);
    setRowPhase(0);

    let t = 800;
    // 逐行做 softmax
    for (let r = 0; r < VIS_ROWS; r++) {
      // 开始该行: 高亮
      timers.current.push(setTimeout(() => { setActiveRow(r); setRowPhase(0); }, t));
      t += 500;
      // exp 阶段
      timers.current.push(setTimeout(() => setRowPhase(1), t));
      t += 600;
      // 归一化完成
      timers.current.push(setTimeout(() => setRowPhase(2), t));
      t += 700;
    }
    // 全部完成
    timers.current.push(setTimeout(() => setActiveRow(VIS_ROWS), t));

    return clearTimers;
  }, [clearTimers, playKey]);

  const allDone = activeRow >= VIS_ROWS;

  return (
    <div role="figure" aria-label="Softmax 演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 740,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      border: '1px solid transparent', background: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          Softmax: S → P (逐行归一化)
        </span>
        <button onClick={replay} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0',
          background: activeRow >= VIS_ROWS ? '#fff' : '#f1f5f9',
          color: activeRow >= VIS_ROWS ? '#164e63' : '#94a3b8',
          fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
          transition: 'all 150ms',
        }}>
          <span style={{ fontSize: 14 }}>▶</span> 重播
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, flexWrap: 'wrap', minHeight: 180,
      }}>
        {/* S 矩阵 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>S</span>
          <Bk>
            {S_vis.headRows.map((row, i) => (
              <SMatrixRow key={`h${i}`} row={row} visIdx={i} activeRow={activeRow} done={allDone || activeRow > i} />
            ))}
            <EllipsisRow />
            {S_vis.tailRows.map((row, i) => (
              <SMatrixRow key={`t${i}`} row={row} visIdx={SH + i} activeRow={activeRow} done={allDone || activeRow > SH + i} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × N</span>
        </div>

        {/* 箭头 + softmax 标签 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 18, color: '#94a3b8' }}>→</span>
          <span style={{
            fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
            color: '#7c3aed', padding: '2px 8px', borderRadius: 4,
            background: 'rgba(124,58,237,0.08)',
          }}>softmax</span>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>per row</span>
        </div>

        {/* P 矩阵 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, fontFamily: 'monospace' }}>P</span>
          <Bk accent>
            {P_vis.headRows.map((row, i) => (
              <PMatrixRow key={`h${i}`} row={row} visIdx={i} activeRow={activeRow} rowPhase={rowPhase} />
            ))}
            <EllipsisRow />
            {P_vis.tailRows.map((row, i) => (
              <PMatrixRow key={`t${i}`} row={row} visIdx={SH + i} activeRow={activeRow} rowPhase={rowPhase} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#7c3aed', fontFamily: 'monospace' }}>N × N</span>
        </div>
      </div>

      {/* 注释区域 */}
      <div style={{ marginTop: 14, textAlign: 'center', minHeight: 52 }}>
        {activeRow >= 0 && activeRow < VIS_ROWS && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
            transition: 'opacity 200ms',
          }}>
            {rowPhase === 0 && (
              <span>第 {activeRow < SH ? activeRow : 'N-1'} 行: 计算 exp(s<sub>ij</sub>) ...</span>
            )}
            {rowPhase === 1 && (
              <span>第 {activeRow < SH ? activeRow : 'N-1'} 行: 除以 Σexp → 归一化</span>
            )}
            {rowPhase === 2 && (
              <span>第 {activeRow < SH ? activeRow : 'N-1'} 行: Σp<sub>ij</sub> = 1.0 ✓</span>
            )}
          </div>
        )}
        {allDone && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
          }}>
            P = softmax(S) — 每行之和 = 1，表示注意力权重分布
          </div>
        )}
      </div>
    </div>
  );
}

// ── S 矩阵行: 正在处理时高亮，完成后变暗 ──
function SMatrixRow({ row, visIdx, activeRow, done }) {
  const isActive = activeRow === visIdx;
  const isDone = done;
  return (
    <div style={{
      display: 'flex', gap: 2, borderRadius: 3, padding: '1px 2px',
      background: isActive ? 'rgba(8,145,178,0.15)' : 'transparent',
      opacity: isDone ? 0.4 : 1,
      transition: 'all 300ms',
    }}>
      {row.head.map((v, j) => (
        <span key={j} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 42, height: 26, borderRadius: 3,
          fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
          background: vecColor(v) + '59', color: '#0f172a',
          border: isActive ? '1.5px solid #0891b2' : '1px solid transparent',
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
          background: vecColor(v) + '59', color: '#0f172a',
          border: isActive ? '1.5px solid #0891b2' : '1px solid transparent',
          transition: 'all 200ms',
        }}>
          {v > 0 ? '+' : ''}{v.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

// ── P 矩阵行: 逐行显示 softmax 结果 ──
function PMatrixRow({ row, visIdx, activeRow, rowPhase }) {
  const allDone = activeRow >= VIS_ROWS;
  const rowDone = allDone || activeRow > visIdx || (activeRow === visIdx && rowPhase >= 2);
  const isActive = activeRow === visIdx;
  const showExp = isActive && rowPhase >= 1;

  return (
    <div style={{
      display: 'flex', gap: 2, borderRadius: 3, padding: '1px 2px',
      background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
      transition: 'all 300ms',
    }}>
      {row.head.map((p, j) => (
        <PCell key={j} p={p} rowDone={rowDone} isActive={isActive} showExp={showExp} />
      ))}
      <Dots h />
      {row.tail.map((p, j) => (
        <PCell key={`t${j}`} p={p} rowDone={rowDone} isActive={isActive} showExp={showExp} />
      ))}
    </div>
  );
}

function PCell({ p, rowDone, isActive, showExp }) {
  const displayVal = rowDone ? p.toFixed(2) : isActive ? (showExp ? '···' : 'eˣ') : '?';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 42, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: rowDone ? 600 : 500,
      background: rowDone ? probBg(p) : isActive ? 'rgba(124,58,237,0.12)' : '#f1f5f9',
      color: rowDone ? '#0f172a' : isActive ? '#7c3aed' : '#cbd5e1',
      border: isActive && !rowDone ? '1.5px solid #7c3aed' : '1px solid transparent',
      transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
      transform: isActive && !rowDone ? 'scale(1.05)' : 'scale(1)',
    }}>
      {displayVal}
    </span>
  );
}

// ── 共用小组件 (与 DotProductDemo 保持一致) ──

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

function Bk({ children, accent }) {
  const c = accent ? '#7c3aed' : '#cbd5e1';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M5,2 Q2,2 2,6 L2,94 Q2,98 5,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 3px' }}>{children}</div>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M1,2 Q4,2 4,6 L4,94 Q4,98 1,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
    </div>
  );
}
