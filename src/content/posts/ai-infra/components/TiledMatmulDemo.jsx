/**
 * TiledMatmulDemo — 分块矩阵乘法动画演示
 * 展示所有 thread block 如何通过分块加载 shared memory 来计算输出 S
 * Q(N×d) × K^T(d×N) = S(N×N)
 * S 被分成 2×2 = 4 个输出 block，每个 block 内沿 d 做 NUM_TILES 次 tile 迭代
 */
import { useState, useEffect, useCallback } from 'react';

// ── 矩阵尺寸 ──
const N = 8, D = 8, TILE = 4;
const NUM_TILES = D / TILE; // d 方向分 2 块
const GRID_R = N / TILE;    // 输出 block 行数 = 2
const GRID_C = N / TILE;    // 输出 block 列数 = 2
const NUM_BLOCKS = GRID_R * GRID_C; // 4 个输出 block

// ── 生成简单的整数矩阵 ──
function gen(seed) {
  return (i, j) => Math.round(Math.sin((i + 1) * (j + 1) * seed) * 3);
}
const qFn = gen(1.618);
const kFn = gen(2.718);

const Q = Array.from({ length: N }, (_, i) => Array.from({ length: D }, (__, j) => qFn(i, j)));
const K = Array.from({ length: N }, (_, i) => Array.from({ length: D }, (__, j) => kFn(i, j)));
const S = Q.map((qr) => K.map((kr) => qr.reduce((s, v, l) => s + v * kr[l], 0)));

// 输出 block 遍历顺序: (0,0) → (0,1) → (1,0) → (1,1)
const BLOCK_ORDER = [];
for (let br = 0; br < GRID_R; br++) {
  for (let bc = 0; bc < GRID_C; bc++) {
    BLOCK_ORDER.push({ br, bc });
  }
}

export default function TiledMatmulDemo() {
  // 每个 block 有 NUM_TILES 个 tile，每个 tile 3 个 subPhase
  const stepsPerBlock = NUM_TILES * 3;
  const totalSteps = NUM_BLOCKS * stepsPerBlock;
  const [step, setStep] = useState(0);

  // 从 step 派生当前状态
  const [blockIdx, setBlockIdx] = useState(-1);
  const [tileIdx, setTileIdx] = useState(-1);
  const [subPhase, setSubPhase] = useState(0);

  useEffect(() => {
    if (step === 0) {
      setBlockIdx(-1);
      setTileIdx(-1);
      setSubPhase(0);
    } else {
      const s = step - 1;
      const bi = Math.floor(s / stepsPerBlock);
      const rem = s % stepsPerBlock;
      const ti = Math.floor(rem / 3);
      const sp = rem % 3;
      setBlockIdx(bi);
      setTileIdx(ti);
      setSubPhase(sp);
    }
  }, [step, stepsPerBlock]);

  const done = step >= totalSteps;
  const isFirst = step === 0;
  const isLast = step >= totalSteps;
  const curBlock = blockIdx >= 0 && blockIdx < NUM_BLOCKS ? BLOCK_ORDER[blockIdx] : null;

  // 记录已完成的 block 索引
  const completedBlocks = new Set();
  if (blockIdx >= 0) {
    for (let i = 0; i < blockIdx; i++) completedBlocks.add(i);
    // 当前 block 的最后一步也算完成
    if (done) completedBlocks.add(blockIdx);
  }

  const next = useCallback(() => setStep(s => Math.min(s + 1, totalSteps)), [totalSteps]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);
  const reset = useCallback(() => setStep(0), []);

  // 计算指定输出 block 到 upToTile 为止的部分和
  function partialSum(br, bc, i, j, upToTile) {
    let s = 0;
    const maxL = Math.min((upToTile + 1) * TILE, D);
    for (let l = 0; l < maxL; l++) {
      s += Q[br * TILE + i][l] * K[bc * TILE + j][l];
    }
    return s;
  }

  // 判断某个 block 是否已计算完成
  function isBlockDone(bi) {
    if (done) return true;
    return bi < blockIdx;
  }

  return (
    <div role="figure" aria-label="分块矩阵乘法演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 880,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      background: 'transparent', border: '1px solid transparent',
    }}>
      {/* 标题 + 控制按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          分块矩阵乘法{curBlock ? `: Block(${curBlock.br},${curBlock.bc})` : ''}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
            {step}/{totalSteps}
          </span>
          <StepBtn onClick={reset} disabled={isFirst} label="⟲" />
          <StepBtn onClick={prev} disabled={isFirst} label="◀" />
          <StepBtn onClick={next} disabled={isLast} label="▶" primary={!isLast} />
        </div>
      </div>

      {/* 三个矩阵并排 */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        gap: 14, flexWrap: 'wrap',
      }}>
        {/* Q 矩阵 */}
        <MatrixView
          label="Q" labelColor="#0891b2" size={[N, D]}
          data={Q}
          highlightFn={(i, j) => {
            if (!curBlock || done) return 'none';
            const { br } = curBlock;
            const inRow = i >= br * TILE && i < (br + 1) * TILE;
            const tileStart = tileIdx * TILE;
            const inCol = j >= tileStart && j < tileStart + TILE;
            if (inRow && inCol) return 'active';
            if (inRow) return 'row';
            return 'none';
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 4 }}>
          <span style={{ fontSize: 18, color: '#94a3b8' }}>×</span>
          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>K<sup>T</sup></span>
        </div>

        {/* K^T 矩阵 */}
        <MatrixView
          label="Kᵀ" labelColor="#0891b2" size={[D, N]}
          data={Array.from({ length: D }, (_, i) => Array.from({ length: N }, (__, j) => K[j][i]))}
          highlightFn={(i, j) => {
            if (!curBlock || done) return 'none';
            const { bc } = curBlock;
            const inCol = j >= bc * TILE && j < (bc + 1) * TILE;
            const tileStart = tileIdx * TILE;
            const inRow = i >= tileStart && i < tileStart + TILE;
            if (inRow && inCol) return 'active';
            if (inCol) return 'col';
            return 'none';
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 4 }}>
          <span style={{ fontSize: 18, color: '#94a3b8' }}>=</span>
        </div>

        {/* S 输出矩阵 */}
        <MatrixView
          label="S" labelColor="#7c3aed" size={[N, N]}
          data={S} isOutput
          highlightFn={(i, j) => {
            if (!curBlock && !done) return 'none';
            // 高亮当前正在计算的 block
            if (curBlock && !done) {
              const { br, bc } = curBlock;
              const inRow = i >= br * TILE && i < (br + 1) * TILE;
              const inCol = j >= bc * TILE && j < (bc + 1) * TILE;
              if (inRow && inCol) return 'active';
            }
            return 'none';
          }}
          valueFn={(i, j) => {
            // 确定 (i,j) 属于哪个 block
            const bi_r = Math.floor(i / TILE);
            const bi_c = Math.floor(j / TILE);
            const bi = bi_r * GRID_C + bi_c;

            if (done) return S[i][j];
            if (isBlockDone(bi)) return S[i][j];
            if (bi !== blockIdx) return null;

            // 当前 block 正在计算
            const li = i - bi_r * TILE;
            const lj = j - bi_c * TILE;
            if (subPhase >= 1) return partialSum(bi_r, bi_c, li, lj, tileIdx);
            if (tileIdx > 0) return partialSum(bi_r, bi_c, li, lj, tileIdx - 1);
            return 0;
          }}
        />
      </div>

      {/* Shared Memory 展示 */}
      {curBlock && !done && (
        <div style={{
          marginTop: 20, display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap',
        }}>
          <ShmemTile
            label="shmem_Q" color="#0891b2"
            data={Array.from({ length: TILE }, (_, i) =>
              Array.from({ length: TILE }, (__, j) => Q[curBlock.br * TILE + i][tileIdx * TILE + j])
            )}
          />
          <ShmemTile
            label="shmem_K" color="#0891b2"
            data={Array.from({ length: TILE }, (_, i) =>
              Array.from({ length: TILE }, (__, j) => K[curBlock.bc * TILE + i][tileIdx * TILE + j])
            )}
          />
        </div>
      )}

      {/* Block 进度指示 */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
        {BLOCK_ORDER.map((b, bi) => {
          let status = 'pending';
          if (isBlockDone(bi)) status = 'done';
          else if (bi === blockIdx) status = 'active';
          return (
            <div key={bi} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 10,
              fontFamily: 'monospace', fontWeight: 600,
              background: status === 'done' ? '#0891b2'
                : status === 'active' ? 'rgba(8,145,178,0.15)'
                : '#f1f5f9',
              color: status === 'done' ? '#fff'
                : status === 'active' ? '#0891b2'
                : '#94a3b8',
              border: status === 'active' ? '1.5px solid #0891b2' : '1.5px solid transparent',
              transition: 'all 250ms',
            }}>
              ({b.br},{b.bc})
              {status === 'active' && ` t${tileIdx + 1}/${NUM_TILES}`}
            </div>
          );
        })}
      </div>

      {/* 状态说明 */}
      <div style={{ marginTop: 10, textAlign: 'center', minHeight: 44 }}>
        {step === 0 && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(148,163,184,0.08)', color: '#64748b',
          }}>
            点击 ▶ 开始 — S 被分成 {GRID_R}×{GRID_C} = {NUM_BLOCKS} 个 block，每个 block 做 {NUM_TILES} 次 tile 迭代
          </div>
        )}
        {curBlock && !done && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(8,145,178,0.08)', color: '#0891b2',
            transition: 'opacity 200ms',
          }}>
            {subPhase === 0 && (
              <span>Block({curBlock.br},{curBlock.bc}) Tile {tileIdx + 1}/{NUM_TILES}: 从 HBM 加载 Q[{curBlock.br * TILE}:{(curBlock.br + 1) * TILE}, {tileIdx * TILE}:{(tileIdx + 1) * TILE}] 和 K[{curBlock.bc * TILE}:{(curBlock.bc + 1) * TILE}, {tileIdx * TILE}:{(tileIdx + 1) * TILE}] 到 shmem</span>
            )}
            {subPhase === 1 && (
              <span>Block({curBlock.br},{curBlock.bc}) Tile {tileIdx + 1}/{NUM_TILES}: 每个线程用 shmem 数据计算部分内积 (累加 {TILE} 个乘积)</span>
            )}
            {subPhase === 2 && (
              <span>Block({curBlock.br},{curBlock.bc}) Tile {tileIdx + 1}/{NUM_TILES}: 部分和累加完成{tileIdx < NUM_TILES - 1 ? '，继续下一个 tile' : ' ✓'}</span>
            )}
          </div>
        )}
        {done && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
          }}>
            全部 {NUM_BLOCKS} 个 block 计算完成 — 每个 block 做 {NUM_TILES} 次 tile，每次只读 {TILE}×{TILE} 到 shared memory
          </div>
        )}
      </div>
    </div>
  );
}

// ── 矩阵可视化组件 ──
function MatrixView({ label, labelColor, size, data, highlightFn, isOutput, valueFn }) {
  const [rows, cols] = size;
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
            const hl = highlightFn(i, j);
            const val = valueFn ? valueFn(i, j) : data[i][j];
            const bg = hl === 'active'
              ? (isOutput ? 'rgba(124,58,237,0.2)' : 'rgba(8,145,178,0.25)')
              : hl === 'row' ? 'rgba(8,145,178,0.08)'
              : hl === 'col' ? 'rgba(8,145,178,0.08)'
              : isOutput && val !== null ? 'rgba(124,58,237,0.06)' : '#f8fafc';
            const border = hl === 'active'
              ? (isOutput ? '1.5px solid #7c3aed' : '1.5px solid #0891b2')
              : '1px solid #e2e8f0';
            return (
              <span key={`${i}-${j}`} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: CELL, height: CELL, borderRadius: 3,
                fontSize: 9, fontFamily: 'monospace', fontWeight: 500,
                background: bg, color: val === null ? '#cbd5e1' : '#0f172a',
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

// ── Shared Memory Tile 展示 ──
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
            fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
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
