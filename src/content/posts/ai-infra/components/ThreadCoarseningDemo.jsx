/**
 * ThreadCoarseningDemo — 线程粗化动画演示
 * 对比无粗化 vs COARSE=2 的分块矩阵乘法
 * Q(4×4) × K^T(4×4) = C(4×4), TILE=2, NUM_TILES=2
 * 展示 tile 沿 d 方向移动，以及 Q tile 被重复加载 vs 复用的区别
 */
import { useState, useCallback } from 'react';

// ── 矩阵参数 ──
const N = 4, D = 4, TILE = 2, COARSE = 2;
const GRID = N / TILE;       // 2 — 输出 tile 网格 2×2
const NUM_TILES = D / TILE;  // 2 — d 方向分 2 块 tile

// ── 生成矩阵数据 ──
const Q = [[2, 1, 3, 0], [0, 3, 1, 2], [1, 2, 0, 3], [3, 1, 2, 1]];
const K = [[1, 2, 0, 3], [3, 0, 2, 1], [2, 1, 3, 0], [0, 3, 1, 2]];
const KT = Array.from({ length: D }, (_, i) => Array.from({ length: N }, (__, j) => K[j][i]));
const C = Q.map(qr => Array.from({ length: N }, (_, j) => qr.reduce((s, v, l) => s + v * KT[l][j], 0)));

// ── 颜色 ──
const BLOCK_COLORS = ['#0891b2', '#7c3aed', '#ea580c', '#059669'];

// ── 生成步骤序列 ──
function genNaiveSteps() {
  // 4 个 block，每个 block 沿 d 做 NUM_TILES 次迭代
  // 每次迭代: load Q+K^T → compute (累加部分和)
  const steps = [];
  for (let br = 0; br < GRID; br++) {
    for (let bc = 0; bc < GRID; bc++) {
      for (let t = 0; t < NUM_TILES; t++) {
        const isQRedundant = bc > 0; // 同一行的 Q tile 已经被其他 block 加载过
        steps.push({
          type: 'load', block: [br, bc], tileIter: t,
          qTile: [br, t], ktTile: [t, bc],
          redundantQ: isQRedundant,
          desc: `Block(${br},${bc}) tile ${t}: 加载 Q${sub(br, t)} ${isQRedundant ? '(重复!)' : ''} 和 K^T${sub(t, bc)} 到 shmem`,
        });
        steps.push({
          type: 'compute', block: [br, bc], tileIter: t,
          cTile: [br, bc], qTile: [br, t], ktTile: [t, bc],
          desc: `Block(${br},${bc}) tile ${t}: 累加 C${sub(br, bc)} += Q${sub(br, t)} · K^T${sub(t, bc)}${t === NUM_TILES - 1 ? ' ✓' : ''}`,
        });
      }
    }
  }
  return steps;
}

function genCoarseSteps() {
  // 2 个 block (grid cols 减半)，每个 block 负责 COARSE=2 列 tile
  // 每次 tile 迭代: load Q → (load K^T_0 + compute) → (load K^T_1 + compute, Q 复用)
  const steps = [];
  for (let br = 0; br < GRID; br++) {
    for (let t = 0; t < NUM_TILES; t++) {
      steps.push({
        type: 'load_q', block: [br, 0], tileIter: t,
        qTile: [br, t],
        desc: `Block(${br},0) tile ${t}: 加载 Q${sub(br, t)} 到 shmem（只需一次）`,
      });
      for (let c = 0; c < COARSE; c++) {
        steps.push({
          type: 'load_kt_compute', block: [br, 0], tileIter: t,
          ktTile: [t, c], cTile: [br, c],
          reuse: c > 0,
          desc: c > 0
            ? `Block(${br},0) tile ${t}: 复用 Q${sub(br, t)}，加载 K^T${sub(t, c)} → 累加 C${sub(br, c)}`
            : `Block(${br},0) tile ${t}: 加载 K^T${sub(t, c)} → 累加 C${sub(br, c)}`,
        });
      }
    }
  }
  return steps;
}

function sub(r, c) { return `₍${r}${c}₎`; }

const NAIVE_STEPS = genNaiveSteps();
const COARSE_STEPS = genCoarseSteps();

// ── 从步骤历史中提取状态 ──
function deriveState(steps, step) {
  let qReads = 0, ktReads = 0;
  const cPartials = {}; // "r,c" → 已完成的 tile 迭代数
  let shmemQ = null, shmemKT = null;
  let curQTile = null, curKTTile = null, curCTile = null;
  let isRedundant = false;

  for (let i = 0; i < Math.min(step, steps.length); i++) {
    const s = steps[i];
    if (s.type === 'load') {
      qReads++; ktReads++;
      shmemQ = s.qTile; shmemKT = s.ktTile;
    } else if (s.type === 'load_q') {
      qReads++;
      shmemQ = s.qTile;
    } else if (s.type === 'load_kt_compute') {
      ktReads++;
      shmemKT = s.ktTile;
      const key = `${s.cTile[0]},${s.cTile[1]}`;
      cPartials[key] = (cPartials[key] || 0) + 1;
    } else if (s.type === 'compute') {
      const key = `${s.cTile[0]},${s.cTile[1]}`;
      cPartials[key] = (cPartials[key] || 0) + 1;
    }
  }

  // 当前步骤高亮
  const cur = step > 0 && step <= steps.length ? steps[step - 1] : null;
  if (cur) {
    if (cur.type === 'load') {
      curQTile = cur.qTile; curKTTile = cur.ktTile;
      isRedundant = cur.redundantQ;
    } else if (cur.type === 'load_q') {
      curQTile = cur.qTile;
    } else if (cur.type === 'load_kt_compute') {
      curKTTile = cur.ktTile; curCTile = cur.cTile;
      isRedundant = cur.reuse;
    } else if (cur.type === 'compute') {
      curCTile = cur.cTile;
      curQTile = cur.qTile; curKTTile = cur.ktTile;
    }
  }

  return { qReads, ktReads, hbmReads: qReads + ktReads, cPartials, shmemQ, shmemKT, curQTile, curKTTile, curCTile, isRedundant, cur };
}

// ── 计算 tile 子矩阵乘法的部分和 ──
function tilePartialSum(br, bc, upToCount) {
  // C[br][bc] tile 的值，累加 upToCount 个 tile 迭代
  const result = Array.from({ length: TILE }, () => Array.from({ length: TILE }, () => 0));
  const count = Math.min(upToCount, NUM_TILES);
  for (let t = 0; t < count; t++) {
    for (let i = 0; i < TILE; i++) {
      for (let j = 0; j < TILE; j++) {
        for (let k = 0; k < TILE; k++) {
          result[i][j] += Q[br * TILE + i][t * TILE + k] * KT[t * TILE + k][bc * TILE + j];
        }
      }
    }
  }
  return result;
}

export default function ThreadCoarseningDemo() {
  const [mode, setMode] = useState('naive');
  const steps = mode === 'naive' ? NAIVE_STEPS : COARSE_STEPS;
  const totalSteps = steps.length;
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep(s => Math.min(s + 1, totalSteps)), [totalSteps]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);
  const resetStep = useCallback(() => setStep(0), []);

  const isFirst = step === 0;
  const isLast = step >= totalSteps;

  const state = deriveState(steps, step);
  const { qReads, ktReads, hbmReads, cPartials, shmemQ, shmemKT, curQTile, curKTTile, curCTile, isRedundant, cur } = state;

  const curBlockColor = cur ? BLOCK_COLORS[cur.block[0] * GRID + (mode === 'naive' ? cur.block[1] : 0)] : null;

  function switchMode(m) {
    setMode(m);
    setStep(0);
  }

  function getQTileData(tr, tc) {
    return Array.from({ length: TILE }, (_, i) =>
      Array.from({ length: TILE }, (__, j) => Q[tr * TILE + i][tc * TILE + j])
    );
  }
  function getKTTileData(tr, tc) {
    return Array.from({ length: TILE }, (_, i) =>
      Array.from({ length: TILE }, (__, j) => KT[tr * TILE + i][tc * TILE + j])
    );
  }

  // 计算 C 矩阵中每个元素的当前显示值
  function getCValue(i, j) {
    const tr = Math.floor(i / TILE);
    const tc = Math.floor(j / TILE);
    const key = `${tr},${tc}`;
    const count = cPartials[key] || 0;
    if (count === 0) return null;
    const partial = tilePartialSum(tr, tc, count);
    return partial[i - tr * TILE][j - tc * TILE];
  }

  const naiveTotalReads = GRID * GRID * NUM_TILES * 2; // 16
  const coarseTotalReads = GRID * NUM_TILES * (1 + COARSE); // 12

  return (
    <div role="figure" aria-label="线程粗化演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 880,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      background: 'transparent', border: '1px solid transparent',
    }}>
      {/* 标题 + 模式切换 + 控制 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63', marginRight: 8 }}>
            线程粗化对比
          </span>
          <TabBtn label="无粗化" active={mode === 'naive'} onClick={() => switchMode('naive')} />
          <TabBtn label="COARSE=2" active={mode === 'coarse'} onClick={() => switchMode('coarse')} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
            {step}/{totalSteps}
          </span>
          <StepBtn onClick={resetStep} disabled={isFirst} label="⟲" />
          <StepBtn onClick={prev} disabled={isFirst} label="◀" />
          <StepBtn onClick={next} disabled={isLast} label="▶" primary={!isLast} />
        </div>
      </div>

      {/* HBM 读取计数 */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 16, justifyContent: 'center', flexWrap: 'wrap',
      }}>
        <Counter label="Q 读取" value={qReads} warn={mode === 'naive' && isRedundant} />
        <Counter label="K^T 读取" value={ktReads} />
        <Counter label="总 HBM 读取" value={hbmReads} highlight />
      </div>

      {/* 三个矩阵 */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        gap: 12, flexWrap: 'wrap',
      }}>
        {/* Q 矩阵 */}
        <TileMatrix
          label="Q" labelColor="#0891b2" rows={N} cols={D} tileSize={TILE}
          data={Q}
          activeTile={curQTile}
          activeColor={isRedundant ? '#ef4444' : curBlockColor}
          shmemTile={!curQTile ? shmemQ : null}
        />

        <Op symbol="×" sub="K^T" />

        {/* K^T 矩阵 */}
        <TileMatrix
          label="K^T" labelColor="#0891b2" rows={D} cols={N} tileSize={TILE}
          data={KT}
          activeTile={curKTTile}
          activeColor={curBlockColor}
          shmemTile={!curKTTile ? shmemKT : null}
        />

        <Op symbol="=" />

        {/* C 输出矩阵 */}
        <OutputMatrix
          rows={N} cols={N} tileSize={TILE}
          fullData={C}
          valueFn={getCValue}
          activeTile={curCTile}
          activeColor={curBlockColor}
          cPartials={cPartials}
        />
      </div>

      {/* Shared Memory 展示 */}
      {(shmemQ || shmemKT) && step > 0 && !isLast && (
        <div style={{
          marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          {shmemQ && (
            <ShmemTile
              label={`shmem_Q = Q${sub(shmemQ[0], shmemQ[1])}`}
              color={isRedundant && curQTile ? '#ef4444' : '#0891b2'}
              data={getQTileData(shmemQ[0], shmemQ[1])}
            />
          )}
          {shmemKT && (
            <ShmemTile
              label={`shmem_K = K^T${sub(shmemKT[0], shmemKT[1])}`}
              color="#0891b2"
              data={getKTTileData(shmemKT[0], shmemKT[1])}
            />
          )}
        </div>
      )}

      {/* Block 分配图 */}
      <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
          线程块分配 ({mode === 'naive' ? `${GRID * GRID} 个 Block` : `${GRID} 个 Block, COARSE=${COARSE}`})
        </span>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${GRID}, 1fr)`,
          gap: 3, marginTop: 6, maxWidth: 260,
        }}>
          {Array.from({ length: GRID }, (_, r) =>
            Array.from({ length: GRID }, (__, c) => {
              let blockLabel, color;
              if (mode === 'naive') {
                blockLabel = `Blk(${r},${c})`;
                color = BLOCK_COLORS[r * GRID + c];
              } else {
                blockLabel = `Blk(${r},0)`;
                color = BLOCK_COLORS[r * GRID];
              }
              const key = `${r},${c}`;
              const count = cPartials[key] || 0;
              const isDone = count >= NUM_TILES;
              const isActive = cur && cur.block[0] === r && (mode === 'naive' ? cur.block[1] === c : true);
              return (
                <div key={`${r}-${c}`} style={{
                  padding: '4px 6px', borderRadius: 4, textAlign: 'center',
                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                  background: isDone ? color : isActive ? `${color}20` : '#f1f5f9',
                  color: isDone ? '#fff' : isActive ? color : '#94a3b8',
                  border: isActive && !isDone ? `1.5px solid ${color}` : '1.5px solid transparent',
                  transition: 'all 250ms',
                }}>
                  C{r}{c} → {blockLabel}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 状态说明 */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <div style={{
          fontSize: 12, fontFamily: 'monospace',
          padding: '6px 14px', borderRadius: 6, display: 'inline-block',
          background: isRedundant ? 'rgba(239,68,68,0.08)'
            : isLast ? 'rgba(5,150,105,0.08)'
            : 'rgba(8,145,178,0.08)',
          color: isRedundant ? '#ef4444'
            : isLast ? '#059669'
            : '#0891b2',
          transition: 'all 200ms',
          maxWidth: 700,
        }}>
          {step === 0 && `点击 ▶ 开始 — Q(4×4) × K^T(4×4), TILE=2, 沿 d 做 ${NUM_TILES} 次 tile 迭代`}
          {cur && cur.desc}
          {isLast && (
            mode === 'naive'
              ? `完成！共 ${hbmReads} 次 HBM 读取（Q 被重复加载了 ${qReads - GRID * NUM_TILES} 次）`
              : `完成！共 ${hbmReads} 次 HBM 读取（Q 零冗余，比无粗化节省 ${naiveTotalReads - hbmReads} 次）`
          )}
        </div>
      </div>
    </div>
  );
}

// ── 输出矩阵 C 的可视化（显示部分和进度） ──
function OutputMatrix({ rows, cols, tileSize, fullData, valueFn, activeTile, activeColor, cPartials }) {
  const CELL = 28;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, fontFamily: 'monospace' }}>C</span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
        gap: 1,
      }}>
        {Array.from({ length: rows }, (_, i) =>
          Array.from({ length: cols }, (__, j) => {
            const tr = Math.floor(i / tileSize);
            const tc = Math.floor(j / tileSize);
            const key = `${tr},${tc}`;
            const count = cPartials[key] || 0;
            const isDone = count >= NUM_TILES;
            const isActive = activeTile && activeTile[0] === tr && activeTile[1] === tc;
            const val = valueFn(i, j);

            let bg = '#f8fafc';
            let border = '1px solid #e2e8f0';
            if (isActive) {
              bg = `${activeColor}20`;
              border = `2px solid ${activeColor}`;
            } else if (isDone) {
              bg = 'rgba(124,58,237,0.12)';
              border = '1px solid rgba(124,58,237,0.3)';
            } else if (count > 0) {
              bg = 'rgba(124,58,237,0.06)';
            }

            return (
              <span key={`${i}-${j}`} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: CELL, height: CELL, borderRadius: 3,
                fontSize: val !== null ? 9 : 11, fontFamily: 'monospace', fontWeight: 500,
                background: bg, color: val !== null ? '#0f172a' : '#cbd5e1',
                border, transition: 'all 250ms',
              }}>
                {val !== null ? val : '·'}
              </span>
            );
          })
        )}
      </div>
      <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{rows}×{cols}</span>
    </div>
  );
}

// ── Tile 矩阵可视化 ──
function TileMatrix({ label, labelColor, rows, cols, tileSize, data, activeTile, activeColor, shmemTile }) {
  const CELL = 28;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: labelColor, fontWeight: 600, fontFamily: 'monospace' }}>{label}</span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
        gap: 1,
      }}>
        {Array.from({ length: rows }, (_, i) =>
          Array.from({ length: cols }, (__, j) => {
            const tr = Math.floor(i / tileSize);
            const tc = Math.floor(j / tileSize);
            const isActive = activeTile && activeTile[0] === tr && activeTile[1] === tc;
            const isShmem = shmemTile && shmemTile[0] === tr && shmemTile[1] === tc;

            let bg = '#f8fafc';
            let border = '1px solid #e2e8f0';
            if (isActive) {
              bg = `${activeColor}25`;
              border = `2px solid ${activeColor}`;
            } else if (isShmem) {
              bg = 'rgba(8,145,178,0.08)';
              border = '1px dashed rgba(8,145,178,0.3)';
            }

            return (
              <span key={`${i}-${j}`} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: CELL, height: CELL, borderRadius: 3,
                fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
                background: bg, color: '#0f172a', border,
                transition: 'all 250ms',
              }}>
                {data[i][j]}
              </span>
            );
          })
        )}
      </div>
      <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{rows}×{cols}</span>
    </div>
  );
}

// ── Shared Memory Tile ──
function ShmemTile({ label, color, data }) {
  const CELL = 30;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color }}>
        {label} (SRAM)
      </span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${TILE}, ${CELL}px)`,
        gap: 1, padding: 4, borderRadius: 6,
        border: `1.5px dashed ${color}44`,
        background: `${color}08`,
      }}>
        {data.flat().map((v, idx) => (
          <span key={idx} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: CELL, height: CELL - 4, borderRadius: 3,
            fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
            background: `${color}18`, color: '#0f172a',
            transition: 'all 200ms',
          }}>
            {v}
          </span>
        ))}
      </div>
      <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>{TILE}×{TILE}</span>
    </div>
  );
}

// ── 计数器 ──
function Counter({ label, value, warn, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      borderRadius: 6,
      background: highlight ? 'rgba(8,145,178,0.08)' : 'rgba(148,163,184,0.06)',
    }}>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b' }}>{label}</span>
      <span style={{
        fontSize: 14, fontFamily: 'monospace', fontWeight: 700,
        color: warn ? '#ef4444' : highlight ? '#0891b2' : '#0f172a',
        transition: 'color 200ms',
      }}>
        {value}
      </span>
    </div>
  );
}

// ── 运算符 ──
function Op({ symbol, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: 4 }}>
      <span style={{ fontSize: 18, color: '#94a3b8' }}>{symbol}</span>
      {sub && <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{sub}</span>}
    </div>
  );
}

// ── Tab 按钮 ──
function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 5, fontSize: 11,
      fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer',
      border: active ? '1.5px solid #0891b2' : '1.5px solid #e2e8f0',
      background: active ? 'rgba(8,145,178,0.1)' : '#fff',
      color: active ? '#0891b2' : '#64748b',
      transition: 'all 150ms',
    }}>
      {label}
    </button>
  );
}

// ── 步进按钮 ──
function StepBtn({ onClick, disabled, label, primary }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 30, height: 26, borderRadius: 6,
      border: `1px solid ${disabled ? '#e2e8f0' : primary ? '#0891b2' : '#cbd5e1'}`,
      background: disabled ? '#f8fafc' : primary ? '#0891b2' : '#fff',
      color: disabled ? '#cbd5e1' : primary ? '#fff' : '#164e63',
      fontSize: 13, cursor: disabled ? 'default' : 'pointer',
      transition: 'all 150ms', opacity: disabled ? 0.5 : 1,
    }}>
      {label}
    </button>
  );
}
