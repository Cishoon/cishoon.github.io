/**
 * DotProductDemo — 点积演示 (3步)
 * ① 交互式 qᵢ · kⱼ
 * ② qᵢ · K 的每一行 → N 个分数
 * ③ Q · Kᵀ = S (N×N)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Canvas 常量 ──
const CW = 600, CH = 340;
const CX = CW / 2, CY = CH / 2;
const UNIT = 50, GRID = 8;
const QI = { x: 2.5, y: 1.5 };

// ── 矩阵数据 ──
const SH = 2, ST = 1; // show head / tail
const N_FULL = 5, D_FULL = 4;

function sd(i, j) {
  return parseFloat((Math.sin((i + 1) * (j + 1) * 1.618) * 0.55).toFixed(2));
}

// K: N × d
const K_full = Array.from({ length: N_FULL }, (_, i) =>
  Array.from({ length: D_FULL }, (__, j) => sd(i * 5 + 2, j))
);
// Q: N × d (每行是一个 qᵢ)
const Q_full = Array.from({ length: N_FULL }, (_, i) =>
  Array.from({ length: D_FULL }, (__, j) => sd(i * 3 + 7, j))
);
// S = Q · Kᵀ  → N × N
const S_full = Q_full.map(qr =>
  K_full.map(kr =>
    parseFloat(qr.reduce((s, v, j) => s + v * kr[j], 0).toFixed(2))
  )
);
// qᵢ (第一行 of Q) · K 的每一行 → 1×N
const qi_row = Q_full[0];
const scores_full = K_full.map(kr =>
  parseFloat(qi_row.reduce((s, v, j) => s + v * kr[j], 0).toFixed(2))
);

function slc(arr) { return { head: arr.slice(0, SH), tail: arr.slice(-ST) }; }

const K_vis = {
  headRows: K_full.slice(0, SH).map(r => slc(r)),
  tailRows: K_full.slice(-ST).map(r => slc(r)),
};
const Q_vis = {
  headRows: Q_full.slice(0, SH).map(r => slc(r)),
  tailRows: Q_full.slice(-ST).map(r => slc(r)),
};
const KT_vis = {
  // Kᵀ: d × N → 行取 head+tail of d, 列取 head+tail of N
  headRows: Array.from({ length: SH }, (_, d) => ({
    head: K_full.slice(0, SH).map(kr => kr[d]),
    tail: K_full.slice(-ST).map(kr => kr[d]),
  })),
  tailRows: Array.from({ length: ST }, (_, di) => {
    const d = D_FULL - ST + di;
    return {
      head: K_full.slice(0, SH).map(kr => kr[d]),
      tail: K_full.slice(-ST).map(kr => kr[d]),
    };
  }),
};
const S_vis = {
  headRows: S_full.slice(0, SH).map(r => slc(r)),
  tailRows: S_full.slice(-ST).map(r => slc(r)),
};
const scores_vis = slc(scores_full);
const qi_vis = slc(qi_row);

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

const STEPS = 3;
const VIS_ROWS = SH + ST;

export default function DotProductDemo() {
  const [step, setStep] = useState(0);
  const canvasRef = useRef(null);
  const [kj, setKj] = useState({ x: 1.0, y: 2.5 });
  const dragging = useRef(false);
  // step 2: 逐行点积
  const [calcRow2, setCalcRow2] = useState(-1);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  }, []);

  // step 2 animation
  useEffect(() => {
    if (step !== 1) return;
    clearTimers();
    setCalcRow2(-1);
    for (let r = 0; r <= VIS_ROWS; r++) {
      timersRef.current.push(setTimeout(() => setCalcRow2(r), 400 + r * 600));
    }
    return clearTimers;
  }, [step, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), []);
  const next = useCallback(() => setStep(s => Math.min(STEPS - 1, s + 1)), []);

  // ── Canvas (step 0) ──
  const toCanvas = (x, y) => ({ x: CX + x * UNIT, y: CY - y * UNIT });
  const toMath = (cx, cy) => ({
    x: Math.round(((cx - CX) / UNIT) * 20) / 20,
    y: Math.round(((CY - cy) / UNIT) * 20) / 20,
  });
  const dot = QI.x * kj.x + QI.y * kj.y;

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cvs.width = CW * dpr; cvs.height = CH * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, CW, CH);
    for (let i = -GRID; i <= GRID; i++) {
      const v1 = toCanvas(i, -GRID), v2 = toCanvas(i, GRID);
      ctx.beginPath(); ctx.moveTo(v1.x, v1.y); ctx.lineTo(v2.x, v2.y);
      ctx.strokeStyle = i === 0 ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.15)';
      ctx.lineWidth = i === 0 ? 1 : 0.5; ctx.stroke();
      const h1 = toCanvas(-GRID, i), h2 = toCanvas(GRID, i);
      ctx.beginPath(); ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y);
      ctx.strokeStyle = i === 0 ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.15)';
      ctx.lineWidth = i === 0 ? 1 : 0.5; ctx.stroke();
    }
    const o = toCanvas(0, 0);
    const qLen2 = QI.x * QI.x + QI.y * QI.y;
    const projS = dot / qLen2;
    const projPt = { x: QI.x * projS, y: QI.y * projS };
    const projC = toCanvas(projPt.x, projPt.y);
    const kjC = toCanvas(kj.x, kj.y);
    ctx.beginPath(); ctx.moveTo(kjC.x, kjC.y); ctx.lineTo(projC.x, projC.y);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(projC.x, projC.y);
    ctx.strokeStyle = dot >= 0 ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)'; ctx.lineWidth = 4; ctx.stroke();
    const qC = toCanvas(QI.x, QI.y);
    arw(ctx, o.x, o.y, qC.x, qC.y, '#2dd4bf', 2.5);
    ctx.font = '700 13px monospace'; ctx.fillStyle = '#2dd4bf'; ctx.fillText('qᵢ', qC.x + 8, qC.y - 8);
    ctx.font = '500 9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(`(${QI.x.toFixed(1)}, ${QI.y.toFixed(1)})`, qC.x + 8, qC.y + 7);
    arw(ctx, o.x, o.y, kjC.x, kjC.y, '#facc15', 2.5);
    ctx.beginPath(); ctx.arc(kjC.x, kjC.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#facc15'; ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '700 13px monospace'; ctx.fillStyle = '#facc15'; ctx.fillText('kⱼ', kjC.x + 10, kjC.y - 10);
    ctx.font = '500 9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(`(${kj.x.toFixed(1)}, ${kj.y.toFixed(1)})`, kjC.x + 10, kjC.y + 7);
    if (Math.abs(projS) > 0.15) {
      const sz = 6, qN = Math.sqrt(qLen2);
      const ux = QI.x / qN * sz, uy = -QI.y / qN * sz;
      const dx2 = kj.x - projPt.x, dy2 = kj.y - projPt.y, dL = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      const vx = dx2 / dL * sz, vy = -dy2 / dL * sz;
      ctx.beginPath(); ctx.moveTo(projC.x - ux, projC.y - uy); ctx.lineTo(projC.x - ux + vx, projC.y - uy + vy); ctx.lineTo(projC.x + vx, projC.y + vy);
      ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(o.x, o.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  }, [kj, dot]);

  useEffect(() => { if (step === 0) draw(); }, [draw, step]);

  // drag handlers
  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const sx = CW / r.width, sy = CH / r.height;
    const cl = e.touches ? e.touches[0] : e;
    return { cx: (cl.clientX - r.left) * sx, cy: (cl.clientY - r.top) * sy };
  };
  const isNear = (cx, cy) => { const c = toCanvas(kj.x, kj.y); return (cx - c.x) ** 2 + (cy - c.y) ** 2 < 400; };
  const onDown = (e) => { const { cx, cy } = getPos(e); if (isNear(cx, cy)) { dragging.current = true; e.preventDefault(); } };
  const onMove = (e) => { if (!dragging.current) return; e.preventDefault(); const { cx, cy } = getPos(e); const m = toMath(cx, cy); setKj({ x: Math.max(-GRID + .5, Math.min(GRID - .5, m.x)), y: Math.max(-GRID + .5, Math.min(GRID - .5, m.y)) }); };
  const onUp = () => { dragging.current = false; };
  useEffect(() => { window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp); return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('touchend', onUp); }; }, []);

  const dotColor = dot > 0 ? '#4ade80' : dot < 0 ? '#f87171' : '#94a3b8';

  return (
    <div role="figure" aria-label="点积演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 740,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      border: '1px solid transparent', background: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          {step === 0 && '① 交互：拖动 kⱼ 观察 qᵢ · kⱼ'}
          {step === 1 && '② qᵢ 与 K 的每一行点积'}
          {step === 2 && '③ Q · Kᵀ = S (N×N 分数矩阵)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={prev} disabled={step === 0}>←</NavBtn>
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'center' }}>{step + 1}/{STEPS}</span>
          <NavBtn onClick={next} disabled={step === STEPS - 1}>→</NavBtn>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? '#0891b2' : '#e2e8f0', transition: 'background 250ms' }} />
        ))}
      </div>

      {step === 0 && <Step1 canvasRef={canvasRef} kj={kj} dot={dot} dotColor={dotColor} onDown={onDown} onMove={onMove} dragging={dragging} />}
      {step === 1 && <Step2 calcRow={calcRow2} />}
      {step === 2 && <Step3 />}
    </div>
  );
}

// ════════════════════════════════════════
// Step 1: 交互式 qᵢ · kⱼ
// ════════════════════════════════════════
function Step1({ canvasRef, kj, dot, dotColor, onDown, onMove, dragging }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <canvas ref={canvasRef} style={{
        width: CW, height: CH, borderRadius: 8, cursor: dragging.current ? 'grabbing' : 'grab',
        touchAction: 'none', maxWidth: '100%',
      }} onMouseDown={onDown} onMouseMove={onMove} onTouchStart={onDown} onTouchMove={onMove} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
        padding: '10px 16px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0',
        fontFamily: 'monospace', fontSize: 13,
      }}>
        <span style={{ color: '#2dd4bf', fontWeight: 600 }}>q<sub>i</sub></span>
        <span style={{ color: '#64748b' }}>·</span>
        <span style={{ color: '#facc15', fontWeight: 600 }}>k<sub>j</sub></span>
        <span style={{ color: '#64748b' }}>=</span>
        <span style={{ color: '#475569', fontSize: 11 }}>
          {QI.x.toFixed(1)}×{kj.x.toFixed(1)} + {QI.y.toFixed(1)}×{kj.y.toFixed(1)}
        </span>
        <span style={{ color: '#64748b' }}>=</span>
        <span style={{
          color: dotColor, fontWeight: 700, fontSize: 16, padding: '2px 8px', borderRadius: 4,
          background: dot > 0 ? 'rgba(74,222,128,0.1)' : dot < 0 ? 'rgba(248,113,113,0.1)' : 'transparent',
        }}>
          {dot > 0 ? '+' : ''}{dot.toFixed(2)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace', textAlign: 'center' }}>
        {dot > 1 && '方向相近 → 点积为正 → 相关性高'}
        {dot > 0 && dot <= 1 && '方向略同 → 点积为正'}
        {dot === 0 && '正交 → 点积为零 → 无关'}
        {dot < 0 && dot >= -1 && '方向相反 → 点积为负'}
        {dot < -1 && '方向相反 → 点积为负 → 相关性低'}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// Step 2: qᵢ · K → scores (1×N)
// qᵢ 与 K 的每一行做点积，逐行高亮
// ════════════════════════════════════════
function Step2({ calcRow }) {
  const vri = (isH, i) => isH ? i : SH + i;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', minHeight: 160 }}>
      {/* qᵢ 行向量 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, alignSelf: 'center' }}>
        <span style={{ fontSize: 11, color: '#2dd4bf', fontWeight: 600, fontFamily: 'monospace' }}>q<sub>i</sub></span>
        <Bk inline>
          <div style={{ display: 'flex', gap: 2 }}>
            {qi_vis.head.map((v, j) => <Cl key={j} value={v} hl={calcRow >= 0 && calcRow < VIS_ROWS} />)}
            <Dots h />
            {qi_vis.tail.map((v, j) => <Cl key={`t${j}`} value={v} hl={calcRow >= 0 && calcRow < VIS_ROWS} />)}
          </div>
        </Bk>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>1 × d</span>
      </div>

      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

      {/* K (N × d) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#facc15', fontWeight: 600, fontFamily: 'monospace' }}>K</span>
        <Bk>
          {K_vis.headRows.map((row, i) => <MRow key={`h${i}`} row={row} hl={calcRow === vri(true, i)} />)}
          <EllipsisRow />
          {K_vis.tailRows.map((row, i) => <MRow key={`t${i}`} row={row} hl={calcRow === vri(false, i)} />)}
        </Bk>
        <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × d</span>
      </div>

      <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

      {/* scores 列向量 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>s<sub>i</sub></span>
        <Bk accent>
          {scores_vis.head.map((v, i) => <RCell key={`h${i}`} value={v} idx={vri(true, i)} cur={calcRow} />)}
          <div style={{ textAlign: 'center' }}><Dots /></div>
          {scores_vis.tail.map((v, i) => <RCell key={`t${i}`} value={v} idx={vri(false, i)} cur={calcRow} />)}
        </Bk>
        <span style={{ fontSize: 10, color: '#0891b2', fontFamily: 'monospace' }}>N × 1</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// Step 3: Q · Kᵀ = S (N×N)
// Phase 0: 显示 K 矩阵
// Phase 1: K 的 cell 动画移动到 Kᵀ 位置 (行列互换)
// Phase 2: 显示完整公式 Q · Kᵀ = S，逐行计算
// ════════════════════════════════════════

// 构建用于转置动画的 cell 数据
// 可见的 K: visRows × visCols (含省略行/列)
// 实际 cell 位置: row indices [0,1, gap, 2], col indices [0,1, gap, 2]
const T_ROWS = SH + ST; // 3 visible rows
const T_COLS = SH + ST; // 3 visible cols
const CELL_W = 44, CELL_H = 28, GAP = 2;
const ELLIPSIS_W = 26, ELLIPSIS_H = 20;

// 构建所有可见 cell 的 K 值 (row, col, value)
function buildKCells() {
  const rowIndices = [...K_full.slice(0, SH), ...K_full.slice(-ST)];
  const cells = [];
  rowIndices.forEach((kr, ri) => {
    const colVals = [...kr.slice(0, SH), ...kr.slice(-ST)];
    colVals.forEach((v, ci) => {
      cells.push({ ri, ci, v });
    });
  });
  return cells;
}
const K_CELLS = buildKCells();

// 计算 cell 在网格中的像素位置 (考虑省略符号的间隔)
function cellPos(ri, ci) {
  // row position: 0,1 = head, then ellipsis gap, then tail
  let y = 0;
  if (ri < SH) {
    y = ri * (CELL_H + GAP);
  } else {
    y = SH * (CELL_H + GAP) + ELLIPSIS_H + GAP + (ri - SH) * (CELL_H + GAP);
  }
  let x = 0;
  if (ci < SH) {
    x = ci * (CELL_W + GAP);
  } else {
    x = SH * (CELL_W + GAP) + ELLIPSIS_W + GAP + (ci - SH) * (CELL_W + GAP);
  }
  return { x, y };
}

// 容器尺寸
function gridSize() {
  const w = SH * (CELL_W + GAP) + ELLIPSIS_W + GAP + ST * (CELL_W + GAP) - GAP;
  const h = SH * (CELL_H + GAP) + ELLIPSIS_H + GAP + ST * (CELL_H + GAP) - GAP;
  return { w, h };
}

const VIS_COLS = SH + ST; // 可见列数 = 3
const TOTAL_CELLS = VIS_ROWS * VIS_COLS; // 3×3 = 9
const SUB_LABEL = (vi) => vi < SH ? String(vi) : 'N-1';

function Step3() {
  // phase: 0=Q stacking, 1=show K, 2=K→Kᵀ transpose, 3=formula+逐格计算
  const [phase, setPhase] = useState(0);
  const [qRowsShown, setQRowsShown] = useState(0);
  const [calcStep, setCalcStep] = useState(-1); // -1=none, 0..8=computing cell, 9=all done
  const timers = useRef([]);

  useEffect(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current = [];
    setPhase(0);
    setQRowsShown(0);
    setCalcStep(-1);

    // Phase 0: Q stacking - 4 visual elements (head0, head1, ellipsis, tail0)
    for (let r = 1; r <= 4; r++) {
      timers.current.push(setTimeout(() => setQRowsShown(r), 200 + r * 350));
    }
    // Phase 1: show K
    timers.current.push(setTimeout(() => setPhase(1), 2000));
    // Phase 2: start transpose
    timers.current.push(setTimeout(() => setPhase(2), 2600));
    // Phase 3: show formula
    timers.current.push(setTimeout(() => setPhase(3), 4000));
    // 逐格计算: 9 cells, each 600ms
    for (let c = 0; c <= TOTAL_CELLS; c++) {
      timers.current.push(setTimeout(() => setCalcStep(c), 4400 + c * 600));
    }

    return () => timers.current.forEach(t => clearTimeout(t));
  }, []);

  const sz = gridSize();

  // Phase 0: qᵢ 堆叠形成 Q
  if (phase === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minHeight: 180 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', textAlign: 'center' }}>
          每个 qᵢ 是一个行向量，堆叠形成 Q
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {/* q_i labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
            {qRowsShown >= 1 && (
              <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '1px 0' }}>
                <span style={{ fontSize: 10, color: '#2dd4bf', fontFamily: 'monospace', fontWeight: 600 }}>q₀ →</span>
              </div>
            )}
            {qRowsShown >= 2 && (
              <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '1px 0' }}>
                <span style={{ fontSize: 10, color: '#2dd4bf', fontFamily: 'monospace', fontWeight: 600 }}>q₁ →</span>
              </div>
            )}
            {qRowsShown >= 3 && (
              <div style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>⋮</span>
              </div>
            )}
            {qRowsShown >= 4 && (
              <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '1px 0' }}>
                <span style={{ fontSize: 10, color: '#2dd4bf', fontFamily: 'monospace', fontWeight: 600 }}>qₙ₋₁→</span>
              </div>
            )}
          </div>
          {/* Q matrix */}
          {qRowsShown > 0 && (
            <Bk>
              {qRowsShown >= 1 && <MRow row={Q_vis.headRows[0]} hl={false} />}
              {qRowsShown >= 2 && <MRow row={Q_vis.headRows[1]} hl={false} />}
              {qRowsShown >= 3 && <EllipsisRow />}
              {qRowsShown >= 4 && Q_vis.tailRows.map((row, i) => <MRow key={`t${i}`} row={row} hl={false} />)}
            </Bk>
          )}
        </div>
        {qRowsShown >= 4 && (
          <span style={{ fontSize: 11, color: '#2dd4bf', fontWeight: 600, fontFamily: 'monospace' }}>Q (N × d)</span>
        )}
      </div>
    );
  }

  // Phase 1-2: K → Kᵀ 转置动画
  if (phase < 3) {
    const ellColX = SH * (CELL_W + GAP);
    const ellRowY = SH * (CELL_H + GAP);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, minHeight: 180 }}>
        <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', textAlign: 'center' }}>
          {phase === 1 ? 'K (N×d)' : 'K → Kᵀ (d×N)  行列互换'}
        </div>
        <div style={{
          position: 'relative',
          width: sz.w, height: sz.h,
          transition: 'width 600ms cubic-bezier(0.4,0,0.2,1), height 600ms cubic-bezier(0.4,0,0.2,1)',
        }}>
          {/* 省略符号: 每行的 ⋯ */}
          {[...Array(T_ROWS)].map((_, ri) => {
            const y = ri < SH ? ri * (CELL_H + GAP) : SH * (CELL_H + GAP) + ELLIPSIS_H + GAP + (ri - SH) * (CELL_H + GAP);
            return (
              <span key={`eh${ri}`} style={{
                position: 'absolute', left: ellColX, top: y,
                width: ELLIPSIS_W, height: CELL_H,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none',
              }}>⋯</span>
            );
          })}
          {/* 省略符号: ⋮ 行 */}
          {[...Array(T_COLS)].map((_, ci) => {
            const x = ci < SH ? ci * (CELL_W + GAP) : SH * (CELL_W + GAP) + ELLIPSIS_W + GAP + (ci - SH) * (CELL_W + GAP);
            return (
              <span key={`ev${ci}`} style={{
                position: 'absolute', left: x, top: ellRowY,
                width: CELL_W, height: ELLIPSIS_H,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none',
              }}>⋮</span>
            );
          })}
          {/* 中心省略: ⋱ */}
          <span style={{
            position: 'absolute', left: ellColX, top: ellRowY,
            width: ELLIPSIS_W, height: ELLIPSIS_H,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none',
          }}>⋱</span>
          {/* 数值 cell 动画 */}
          {K_CELLS.map(({ ri, ci, v }, idx) => {
            const from = cellPos(ri, ci);
            const to = cellPos(ci, ri);
            const pos = phase >= 2 ? to : from;
            return (
              <span key={idx} style={{
                position: 'absolute',
                left: pos.x, top: pos.y,
                width: CELL_W, height: CELL_H,
                borderRadius: 3,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
                background: vecColor(v) + '59',
                color: '#0f172a',
                transition: 'left 600ms cubic-bezier(0.4,0,0.2,1), top 600ms cubic-bezier(0.4,0,0.2,1)',
              }}>
                {v > 0 ? '+' : ''}{v.toFixed(2)}
              </span>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: '#facc15', fontWeight: 600, fontFamily: 'monospace' }}>
          {phase === 1 ? 'K' : 'Kᵀ'}
        </div>
      </div>
    );
  }

  // Phase 3: Q · Kᵀ = S — 逐格计算 (9 步)
  const curRow = calcStep >= 0 && calcStep < TOTAL_CELLS ? Math.floor(calcStep / VIS_COLS) : -1;
  const curCol = calcStep >= 0 && calcStep < TOTAL_CELLS ? calcStep % VIS_COLS : -1;
  const allDone = calcStep >= TOTAL_CELLS;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minHeight: 180 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, flexWrap: 'wrap',
      }}>
        {/* Q (N × d) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#2dd4bf', fontWeight: 600, fontFamily: 'monospace' }}>Q</span>
          <Bk>
            {Q_vis.headRows.map((row, i) => (
              <MRow key={`h${i}`} row={row} hl={curRow === i} />
            ))}
            <EllipsisRow />
            {Q_vis.tailRows.map((row, i) => (
              <MRow key={`t${i}`} row={row} hl={curRow === SH + i} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>N × d</span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>·</span>

        {/* Kᵀ (d × N) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#facc15', fontWeight: 600, fontFamily: 'monospace' }}>
            K<sup>T</sup>
          </span>
          <Bk>
            {KT_vis.headRows.map((row, r) => (
              <MRow key={`h${r}`} row={row} hl={false} hlCol={curCol} />
            ))}
            <EllipsisRow />
            {KT_vis.tailRows.map((row, r) => (
              <MRow key={`t${r}`} row={row} hl={false} hlCol={curCol} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>d × N</span>
        </div>

        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 300 }}>=</span>

        {/* S (N × N) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#0891b2', fontWeight: 600, fontFamily: 'monospace' }}>S</span>
          <Bk accent>
            {S_vis.headRows.map((row, i) => (
              <SRow key={`h${i}`} row={row} visRow={i} calcStep={calcStep} />
            ))}
            <EllipsisRow />
            {S_vis.tailRows.map((row, i) => (
              <SRow key={`t${i}`} row={row} visRow={SH + i} calcStep={calcStep} />
            ))}
          </Bk>
          <span style={{ fontSize: 10, color: '#0891b2', fontFamily: 'monospace' }}>N × N</span>
        </div>
      </div>

      {/* Annotation: 当前正在计算哪个元素 */}
      {curRow >= 0 && (
        <div style={{
          fontSize: 12, fontFamily: 'monospace', textAlign: 'center',
          padding: '6px 14px', borderRadius: 6,
          background: 'rgba(8,145,178,0.08)', color: '#0891b2',
          transition: 'opacity 200ms',
        }}>
          <span style={{ color: '#2dd4bf' }}>Q</span>{' 第 '}{SUB_LABEL(curRow)}{' 行'}
          {' × '}
          <span style={{ color: '#facc15' }}>K<sup>T</sup></span>{' 第 '}{SUB_LABEL(curCol)}{' 列'}
          {' → '}
          <span style={{ fontWeight: 700 }}>
            S<sub>{SUB_LABEL(curRow)},{SUB_LABEL(curCol)}</sub> = ···
          </span>
        </div>
      )}
      {allDone && (
        <div style={{
          fontSize: 12, fontFamily: 'monospace', textAlign: 'center',
          padding: '6px 14px', borderRadius: 6,
          background: 'rgba(8,145,178,0.08)', color: '#0891b2',
        }}>
          S = Q · K<sup>T</sup> — 每个 S<sub>ij</sub> = q<sub>i</sub> · k<sub>j</sub>
        </div>
      )}
    </div>
  );
}

function SRow({ row, visRow, calcStep }) {
  const rowActive = calcStep >= 0 && calcStep < TOTAL_CELLS && Math.floor(calcStep / VIS_COLS) === visRow;
  const bg = rowActive ? 'rgba(8,145,178,0.15)' : 'transparent';
  return (
    <div style={{ display: 'flex', gap: 2, background: bg, borderRadius: 3, padding: '1px 2px', transition: 'background 250ms' }}>
      {row.head.map((v, j) => {
        const cellIdx = visRow * VIS_COLS + j;
        return <SCell key={j} v={v} done={calcStep > cellIdx} active={calcStep === cellIdx} />;
      })}
      <Dots h />
      {row.tail.map((v, j) => {
        const cellIdx = visRow * VIS_COLS + SH + j;
        return <SCell key={`t${j}`} v={v} done={calcStep > cellIdx} active={calcStep === cellIdx} />;
      })}
    </div>
  );
}

function SCell({ v, done, active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 42, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
      background: done ? vecColor(v) : active ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
      color: done ? '#0f172a' : active ? '#0891b2' : '#cbd5e1',
      border: active ? '1.5px solid #0891b2' : '1px solid transparent',
      transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
    }}>
      {done ? (v > 0 ? '+' : '') + v.toFixed(2) : active ? '···' : '?'}
    </span>
  );
}

// ── 共用小组件 ──

function RCell({ value, idx, cur }) {
  const done = cur > idx, active = cur === idx;
  return (
    <div style={{ display: 'flex', padding: '1px 2px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 48, height: 26, borderRadius: 3,
        fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
        background: done ? vecColor(value) : active ? 'rgba(8,145,178,0.25)' : '#f1f5f9',
        color: done ? '#0f172a' : active ? '#0891b2' : '#cbd5e1',
        border: active ? '1.5px solid #0891b2' : '1px solid transparent',
        transition: 'all 300ms cubic-bezier(0.4,0,0.2,1)',
        transform: done ? 'scale(1)' : active ? 'scale(1.08)' : 'scale(0.95)',
      }}>
        {done ? (value > 0 ? '+' : '') + value.toFixed(2) : active ? '···' : '?'}
      </span>
    </div>
  );
}

function MRow({ row, hl, hlCol = -1 }) {
  const hasColHl = hlCol >= 0;
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: hl ? 'rgba(8,145,178,0.12)' : 'transparent',
      borderRadius: 3, padding: '1px 2px', transition: 'background 200ms',
    }}>
      {row.head.map((v, j) => <Cl key={j} value={v} hl={hl || (hasColHl && j === hlCol)} />)}
      <Dots h />
      {row.tail.map((v, j) => <Cl key={`t${j}`} value={v} hl={hl || (hasColHl && (SH + j) === hlCol)} />)}
    </div>
  );
}

function EllipsisRow() {
  return (
    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
      <Dots /><Dots /><Dots h /><Dots />
    </div>
  );
}

function Cl({ value, hl }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 42, height: 26, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
      background: hl ? 'rgba(8,145,178,0.15)' : vecColor(value) + '59',
      color: '#0f172a',
      border: hl ? '1.5px solid #0891b2' : '1px solid transparent',
      transition: 'all 200ms',
    }}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

function Dots({ h }) {
  if (h) return <span style={{ width: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none' }}>⋯</span>;
  return <span style={{ width: 42, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', userSelect: 'none' }}>⋮</span>;
}

function Bk({ children, accent, inline }) {
  const c = accent ? '#0891b2' : '#cbd5e1';
  if (inline) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <span style={{ fontSize: 22, fontWeight: 200, color: c, lineHeight: 1, userSelect: 'none', fontFamily: 'monospace' }}>[</span>
      <div style={{ display: 'flex', gap: 2, padding: '2px 3px' }}>{children}</div>
      <span style={{ fontSize: 22, fontWeight: 200, color: c, lineHeight: 1, userSelect: 'none', fontFamily: 'monospace' }}>]</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M5,2 Q2,2 2,6 L2,94 Q2,98 5,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 3px' }}>{children}</div>
      <svg width="6" viewBox="0 0 6 100" preserveAspectRatio="none" style={{ flexShrink: 0 }}><path d="M1,2 Q4,2 4,6 L4,94 Q4,98 1,98" fill="none" stroke={c} strokeWidth="1.5" /></svg>
    </div>
  );
}

function NavBtn({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={children === '←' ? '上一步' : '下一步'} style={{
      width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0',
      background: disabled ? '#f1f5f9' : '#fff', color: disabled ? '#cbd5e1' : '#164e63',
      fontSize: 14, cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
    }}>{children}</button>
  );
}

function arw(ctx, fx, fy, tx, ty, color, lw) {
  const hl = 9, dx = tx - fx, dy = ty - fy, a = Math.atan2(dy, dx);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx, ty);
  ctx.lineTo(tx - hl * Math.cos(a - Math.PI / 6), ty - hl * Math.sin(a - Math.PI / 6));
  ctx.lineTo(tx - hl * Math.cos(a + Math.PI / 6), ty - hl * Math.sin(a + Math.PI / 6));
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
