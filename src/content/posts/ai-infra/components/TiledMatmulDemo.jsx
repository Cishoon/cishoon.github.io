/**
 * TiledMatmulDemo — 分块矩阵乘法动画演示
 * 展示一个 thread block 如何通过分块加载 shared memory 来计算输出 tile
 * Q(N×d) × K^T(d×N) = S(N×N)，聚焦一个输出 block 的计算过程
 */
import { useState, useEffect, useCallback } from 'react';

// ── 矩阵尺寸 ──
const N = 8, D = 8, TILE = 4;
const NUM_TILES = D / TILE; // d 方向分 2 块

// ── 生成简单的整数矩阵方便展示 ──
function gen(seed) {
  return (i, j) => Math.round(Math.sin((i + 1) * (j + 1) * seed) * 3);
}
const qFn = gen(1.618);
const kFn = gen(2.718);

const Q = Array.from({ length: N }, (_, i) => Array.from({ length: D }, (__, j) => qFn(i, j)));
const K = Array.from({ length: N }, (_, i) => Array.from({ length: D }, (__, j) => kFn(i, j)));
// S = Q * K^T  →  S[i][j] = sum_l Q[i][l] * K[j][l]
const S = Q.map((qr, i) => K.map((kr, j) => qr.reduce((s, v, l) => s + v * kr[l], 0)));

// 当前聚焦的输出 block: blockRow=0, blockCol=0 (左上角 TILE×TILE)
const BR = 0, BC = 0;

export default function TiledMatmulDemo() {
  // phase: 哪个 tile 步骤 (0 ~ NUM_TILES-1)，NUM_TILES=完成
  const [phase, setPhase] = useState(-1);
  // subPhase: 0=加载到shmem, 1=计算部分和, 2=累加完成
  const [subPhase, setSubPhase] = useState(0);

  // 总步骤数: 每个 tile 有 3 个 subPhase，共 NUM_TILES * 3 步，再加初始态和完成态
  const totalSteps = NUM_TILES * 3; // 6 步
  const [step, setStep] = useState(0); // 0 = 初始态, 1~totalSteps = 各步, totalSteps+1 不会到

  // 根据 step 计算 phase 和 subPhase
  useEffect(() => {
    if (step === 0) {
      setPhase(-1);
      setSubPhase(0);
    } else if (step <= totalSteps) {
      const s = step - 1; // 0-based
      const tile = Math.floor(s / 3);
      const sub = s % 3;
      setPhase(tile);
      setSubPhase(sub);
    }
  }, [step]);

  const done = step >= totalSteps;
  const isFirst = step === 0;
  const isLast = step >= totalSteps;

  const next = useCallback(() => {
    setStep(s => Math.min(s + 1, totalSteps));
  }, [totalSteps]);

  const prev = useCallback(() => {
    setStep(s => Math.max(s - 1, 0));
  }, []);

  const reset = useCallback(() => {
    setStep(0);
  }, []);

  // 计算到当前 tile 为止的部分和
  function partialSum(i, j, upToTile) {
    let s = 0;
    const maxL = Math.min((upToTile + 1) * TILE, D);
    for (let l = 0; l < maxL; l++) {
      s += Q[BR * TILE + i][l] * K[BC * TILE + j][l];
    }
    return s;
  }

  return (
    <div role="figure" aria-label="分块矩阵乘法演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 820,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      background: 'transparent', border: '1px solid transparent',
    }}>
      {/* 标题 + 控制按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          分块矩阵乘法: 聚焦 Block(0,0) 的计算过程
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
        gap: 16, flexWrap: 'wrap',
      }}>
        {/* Q 矩阵 */}
        <MatrixView
          label="Q" labelColor="#0891b2" size={[N, D]}
          data={Q} phase={phase} subPhase={subPhase} done={done}
          highlightFn={(i, j) => {
            if (phase < 0 || done) return 'none';
            const inRow = i >= BR * TILE && i < (BR + 1) * TILE;
            const tileStart = phase * TILE;
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

        {/* K^T 矩阵 (显示为转置) */}
        <MatrixView
          label="Kᵀ" labelColor="#0891b2" size={[D, N]}
          data={Array.from({ length: D }, (_, i) => Array.from({ length: N }, (__, j) => K[j][i]))}
          phase={phase} subPhase={subPhase} done={done}
          highlightFn={(i, j) => {
            if (phase < 0 || done) return 'none';
            const inCol = j >= BC * TILE && j < (BC + 1) * TILE;
            const tileStart = phase * TILE;
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
          data={S} phase={phase} subPhase={subPhase} done={done}
          isOutput
          highlightFn={(i, j) => {
            if (phase < 0) return 'none';
            const inRow = i >= BR * TILE && i < (BR + 1) * TILE;
            const inCol = j >= BC * TILE && j < (BC + 1) * TILE;
            if (inRow && inCol) return 'active';
            return 'none';
          }}
          valueFn={(i, j) => {
            const inRow = i >= BR * TILE && i < (BR + 1) * TILE;
            const inCol = j >= BC * TILE && j < (BC + 1) * TILE;
            if (!inRow || !inCol) return done ? S[i][j] : null;
            if (phase < 0) return null;
            if (done) return S[i][j];
            const li = i - BR * TILE, lj = j - BC * TILE;
            if (subPhase >= 2) return partialSum(li, lj, phase);
            if (subPhase >= 1) return partialSum(li, lj, phase);
            if (phase > 0) return partialSum(li, lj, phase - 1);
            return 0;
          }}
        />
      </div>

      {/* Shared Memory 展示 */}
      {phase >= 0 && !done && (
        <div style={{
          marginTop: 20, display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap',
        }}>
          <ShmemTile
            label="shmem_Q" color="#0891b2"
            data={Array.from({ length: TILE }, (_, i) =>
              Array.from({ length: TILE }, (__, j) => Q[BR * TILE + i][phase * TILE + j])
            )}
            visible={subPhase >= 0}
          />
          <ShmemTile
            label="shmem_K" color="#0891b2"
            data={Array.from({ length: TILE }, (_, i) =>
              Array.from({ length: TILE }, (__, j) => K[BC * TILE + i][phase * TILE + j])
            )}
            visible={subPhase >= 0}
          />
        </div>
      )}

      {/* 状态说明 */}
      <div style={{ marginTop: 14, textAlign: 'center', minHeight: 44 }}>
        {phase >= 0 && !done && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(8,145,178,0.08)', color: '#0891b2',
            transition: 'opacity 200ms',
          }}>
            {subPhase === 0 && (
              <span>Tile {phase + 1}/{NUM_TILES}: 从 HBM 加载 Q[:, {phase * TILE}:{(phase + 1) * TILE}] 和 K[:, {phase * TILE}:{(phase + 1) * TILE}] 到 shared memory</span>
            )}
            {subPhase === 1 && (
              <span>Tile {phase + 1}/{NUM_TILES}: 每个线程用 shmem 中的数据计算部分内积 (累加 {TILE} 个乘积)</span>
            )}
            {subPhase === 2 && (
              <span>Tile {phase + 1}/{NUM_TILES}: 部分和累加完成{phase < NUM_TILES - 1 ? '，继续下一个 tile ...' : ' ✓'}</span>
            )}
          </div>
        )}
        {done && (
          <div style={{
            fontSize: 12, fontFamily: 'monospace',
            padding: '6px 14px', borderRadius: 6, display: 'inline-block',
            background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
          }}>
            Block(0,0) 计算完成 — 共 {NUM_TILES} 次 tile 迭代，每次只从 HBM 读 TILE×TILE 的数据到 shared memory
          </div>
        )}
      </div>
    </div>
  );
}

// ── 矩阵可视化组件 ──
function MatrixView({ label, labelColor, size, data, highlightFn, isOutput, valueFn, done }) {
  const [rows, cols] = size;
  const CELL = 28;
  const MAX_SHOW = 8;
  const showRows = Math.min(rows, MAX_SHOW);
  const showCols = Math.min(cols, MAX_SHOW);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: labelColor, fontWeight: 600, fontFamily: 'monospace' }}>{label}</span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${showCols}, ${CELL}px)`,
        gap: 1,
      }}>
        {Array.from({ length: showRows }, (_, i) =>
          Array.from({ length: showCols }, (__, j) => {
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
function ShmemTile({ label, color, data, visible }) {
  if (!visible) return null;
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
