/**
 * ThreadCoarseningDemo — 线程粗化动画演示
 * 对比无粗化 vs COARSE=2 的分块矩阵乘法
 * Q(4×2) × K^T(2×4) = C(4×4), TILE=2
 * 展示 Q tile 被重复加载 vs 复用的区别
 */
import { useState, useCallback } from 'react';

// ── 矩阵参数 ──
const N = 4, D = 2, TILE = 2, COARSE = 2;
const GRID = N / TILE; // 2×2 output tile grid

// ── 生成简单矩阵 ──
const Q = [[2, 1], [0, 3], [1, 2], [3, 1]];
const K = [[1, 2], [3, 0], [2, 1], [0, 3]]; // K is N×d
// K^T is d×N: KT[i][j] = K[j][i]
const KT = Array.from({ length: D }, (_, i) => Array.from({ length: N }, (__, j) => K[j][i]));
// C = Q × K^T
const C = Q.map(qr => Array.from({ length: N }, (_, j) => qr.reduce((s, v, l) => s + v * KT[l][j], 0)));

// ── 颜色方案 ──
const BLOCK_COLORS = ['#0891b2', '#7c3aed', '#ea580c', '#059669'];

// ── 无粗化的步骤序列 ──
// 4 个 block，每个 block: load Q tile, load K^T tile, compute
// Block(0,0) → Block(0,1) → Block(1,0) → Block(1,1)
const NAIVE_STEPS = [
  { block: [0, 0], action: 'load_q', qTile: [0, 0], desc: 'Block(0,0): 从 HBM 加载 Q₀₀ 到 shmem' },
  { block: [0, 0], action: 'load_kt', ktTile: [0, 0], desc: 'Block(0,0): 从 HBM 加载 K^T₀₀ 到 shmem' },
  { block: [0, 0], action: 'compute', cTile: [0, 0], desc: 'Block(0,0): 计算 C₀₀ = Q₀₀ · K^T₀₀' },
  { block: [0, 1], action: 'load_q', qTile: [0, 0], desc: 'Block(0,1): 从 HBM 加载 Q₀₀ 到 shmem（重复!）' },
  { block: [0, 1], action: 'load_kt', ktTile: [0, 1], desc: 'Block(0,1): 从 HBM 加载 K^T₀₁ 到 shmem' },
  { block: [0, 1], action: 'compute', cTile: [0, 1], desc: 'Block(0,1): 计算 C₀₁ = Q₀₀ · K^T₀₁' },
  { block: [1, 0], action: 'load_q', qTile: [1, 0], desc: 'Block(1,0): 从 HBM 加载 Q₁₀ 到 shmem' },
  { block: [1, 0], action: 'load_kt', ktTile: [0, 0], desc: 'Block(1,0): 从 HBM 加载 K^T₀₀ 到 shmem' },
  { block: [1, 0], action: 'compute', cTile: [1, 0], desc: 'Block(1,0): 计算 C₁₀ = Q₁₀ · K^T₀₀' },
  { block: [1, 1], action: 'load_q', qTile: [1, 0], desc: 'Block(1,1): 从 HBM 加载 Q₁₀ 到 shmem（重复!）' },
  { block: [1, 1], action: 'load_kt', ktTile: [0, 1], desc: 'Block(1,1): 从 HBM 加载 K^T₀₁ 到 shmem' },
  { block: [1, 1], action: 'compute', cTile: [1, 1], desc: 'Block(1,1): 计算 C₁₁ = Q₁₀ · K^T₀₁' },
];

// ── 粗化的步骤序列 ──
// 2 个 block，每个 block 负责 COARSE=2 列的 output tile
// Block(0,0) → Block(1,0)
const COARSE_STEPS = [
  { block: [0, 0], action: 'load_q', qTile: [0, 0], desc: 'Block(0,0): 从 HBM 加载 Q₀₀ 到 shmem（只需一次）' },
  { block: [0, 0], action: 'load_kt', ktTile: [0, 0], desc: 'Block(0,0): 从 HBM 加载 K^T₀₀ 到 shmem' },
  { block: [0, 0], action: 'compute', cTile: [0, 0], desc: 'Block(0,0): 计算 C₀₀ = Q₀₀ · K^T₀₀' },
  { block: [0, 0], action: 'load_kt', ktTile: [0, 1], desc: 'Block(0,0): 复用 shmem 中的 Q₀₀，加载 K^T₀₁' },
  { block: [0, 0], action: 'compute', cTile: [0, 1], desc: 'Block(0,0): 计算 C₀₁ = Q₀₀ · K^T₀₁（Q₀₀ 复用!）' },
  { block: [1, 0], action: 'load_q', qTile: [1, 0], desc: 'Block(1,0): 从 HBM 加载 Q₁₀ 到 shmem（只需一次）' },
  { block: [1, 0], action: 'load_kt', ktTile: [0, 0], desc: 'Block(1,0): 从 HBM 加载 K^T₀₀ 到 shmem' },
  { block: [1, 0], action: 'compute', cTile: [1, 0], desc: 'Block(1,0): 计算 C₁₀ = Q₁₀ · K^T₀₀' },
  { block: [1, 0], action: 'load_kt', ktTile: [0, 1], desc: 'Block(1,0): 复用 shmem 中的 Q₁₀，加载 K^T₀₁' },
  { block: [1, 0], action: 'compute', cTile: [1, 1], desc: 'Block(1,0): 计算 C₁₁ = Q₁₀ · K^T₀₁（Q₁₀ 复用!）' },
];

export default function ThreadCoarseningDemo() {
  const [mode, setMode] = useState('naive'); // 'naive' or 'coarse'
  const steps = mode === 'naive' ? NAIVE_STEPS : COARSE_STEPS;
  const totalSteps = steps.length;
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep(s => Math.min(s + 1, totalSteps)), [totalSteps]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);
  const resetStep = useCallback(() => setStep(0), []);

  const isFirst = step === 0;
  const isLast = step >= totalSteps;
  const curStep = step > 0 && step <= totalSteps ? steps[step - 1] : null;

  // 统计 HBM 读取次数
  let hbmReads = 0;
  let qReads = 0;
  let ktReads = 0;
  const computedTiles = new Set();
  for (let i = 0; i < Math.min(step, totalSteps); i++) {
    if (steps[i].action === 'load_q') { hbmReads++; qReads++; }
    if (steps[i].action === 'load_kt') { hbmReads++; ktReads++; }
    if (steps[i].action === 'compute') computedTiles.add(`${steps[i].cTile[0]},${steps[i].cTile[1]}`);
  }

  // 当前 shmem 中的内容
  let shmemQ = null;
  let shmemKT = null;
  for (let i = Math.min(step, totalSteps) - 1; i >= 0; i--) {
    if (!shmemQ && steps[i].action === 'load_q') shmemQ = steps[i].qTile;
    if (!shmemKT && steps[i].action === 'load_kt') shmemKT = steps[i].ktTile;
    if (shmemQ && shmemKT) break;
  }

  // 当前高亮的 tile
  const activeQTile = curStep?.action === 'load_q' ? curStep.qTile : null;
  const activeKTTile = curStep?.action === 'load_kt' ? curStep.ktTile : null;
  const activeCTile = curStep?.action === 'compute' ? curStep.cTile : null;
  const curBlockColor = curStep ? BLOCK_COLORS[curStep.block[0] * GRID + curStep.block[1]] : null;

  // 判断是否为重复加载
  const isRedundant = curStep?.desc.includes('重复');

  function switchMode(m) {
    setMode(m);
    setStep(0);
  }

  // 获取 tile 数据
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

  return (
    <div role="figure" aria-label="线程粗化演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 800,
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
        <Counter label="Q 读取" value={qReads} warn={mode === 'naive' && qReads > 0} />
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
          activeTile={activeQTile}
          activeColor={isRedundant ? '#ef4444' : curBlockColor}
          shmemTile={shmemQ}
        />

        <Op symbol="×" sub="K^T" />

        {/* K^T 矩阵 */}
        <TileMatrix
          label="K^T" labelColor="#0891b2" rows={D} cols={N} tileSize={TILE}
          data={KT}
          activeTile={activeKTTile}
          activeColor={curBlockColor}
          shmemTile={shmemKT}
        />

        <Op symbol="=" />

        {/* C 输出矩阵 */}
        <TileMatrix
          label="C" labelColor="#7c3aed" rows={N} cols={N} tileSize={TILE}
          data={C}
          activeTile={activeCTile}
          activeColor={curBlockColor}
          computedTiles={computedTiles}
          isOutput
        />
      </div>

      {/* Shared Memory 展示 */}
      {(shmemQ || shmemKT) && step > 0 && !isLast && (
        <div style={{
          marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          {shmemQ && (
            <ShmemTile
              label="shmem_Q"
              color={isRedundant && activeQTile ? '#ef4444' : '#0891b2'}
              data={getQTileData(shmemQ[0], shmemQ[1])}
              pulsing={activeQTile != null}
            />
          )}
          {shmemKT && (
            <ShmemTile
              label="shmem_K"
              color="#0891b2"
              data={getKTTileData(shmemKT[0], shmemKT[1])}
              pulsing={activeKTTile != null}
            />
          )}
        </div>
      )}

      {/* Block 分配图 */}
      <div style={{ marginTop: 16 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
          线程块分配 ({mode === 'naive' ? '4 个 Block' : '2 个 Block, COARSE=2'})
        </span>
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${GRID}, 1fr)`,
          gap: 3, marginTop: 6, maxWidth: 240,
        }}>
          {Array.from({ length: GRID }, (_, r) =>
            Array.from({ length: GRID }, (__, c) => {
              let blockLabel, color;
              if (mode === 'naive') {
                blockLabel = `Block(${r},${c})`;
                color = BLOCK_COLORS[r * GRID + c];
              } else {
                blockLabel = `Block(${r},0)`;
                color = BLOCK_COLORS[r * GRID];
              }
              const isActive = curStep && curStep.block[0] === r && (mode === 'naive' ? curStep.block[1] === c : true);
              const isDone = computedTiles.has(`${r},${c}`);
              return (
                <div key={`${r}-${c}`} style={{
                  padding: '4px 6px', borderRadius: 4, textAlign: 'center',
                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                  background: isDone ? color : isActive ? `${color}20` : '#f1f5f9',
                  color: isDone ? '#fff' : isActive ? color : '#94a3b8',
                  border: isActive ? `1.5px solid ${color}` : '1.5px solid transparent',
                  transition: 'all 250ms',
                }}>
                  C<sub>{r}{c}</sub> → {blockLabel}
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
        }}>
          {step === 0 && `点击 ▶ 开始 — ${mode === 'naive' ? '无粗化: 4 个 Block 各自加载数据' : '线程粗化: 2 个 Block，每个负责 2 列 tile'}`}
          {curStep && curStep.desc}
          {isLast && (
            mode === 'naive'
              ? `完成！共 ${hbmReads} 次 HBM 读取（Q 被重复加载了 ${qReads - GRID} 次）`
              : `完成！共 ${hbmReads} 次 HBM 读取（Q 零冗余，节省 ${8 - hbmReads} 次读取）`
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tile 矩阵可视化 ──
function TileMatrix({ label, labelColor, rows, cols, tileSize, data, activeTile, activeColor, shmemTile, computedTiles, isOutput }) {
  const CELL = 30;
  const tileRows = rows / tileSize;
  const tileCols = cols / tileSize;

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
            const isActiveTile = activeTile && activeTile[0] === tr && activeTile[1] === tc;
            const isShmemTile = shmemTile && shmemTile[0] === tr && shmemTile[1] === tc && !isActiveTile;
            const isDoneTile = computedTiles && computedTiles.has(`${tr},${tc}`);

            let bg = '#f8fafc';
            let border = '1px solid #e2e8f0';

            if (isActiveTile) {
              bg = `${activeColor}25`;
              border = `2px solid ${activeColor}`;
            } else if (isDoneTile) {
              bg = 'rgba(124,58,237,0.12)';
              border = '1px solid rgba(124,58,237,0.3)';
            } else if (isShmemTile) {
              bg = 'rgba(8,145,178,0.06)';
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
function ShmemTile({ label, color, data, pulsing }) {
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
