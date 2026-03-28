/**
 * ParallelReductionDemo — 并行归约动画演示
 * 展示 BLOCK_SIZE 个线程如何协作完成归约：
 * 1. 每个线程求局部最大值
 * 2. 树形归约求整行最大值
 */
import { useState, useCallback } from 'react';

// ── 参数 ──
const N = 16;           // 一行的元素数
const BLOCK_SIZE = 4;   // 线程数
const CHUNK = N / BLOCK_SIZE; // 每个线程负责 4 个元素

// ── 生成一行数据 ──
const ROW_DATA = [3, 1, 7, 2, 5, 9, 0, 4, 8, 6, 1, 3, 2, 7, 4, 5];

// ── 线程颜色 ──
const THREAD_COLORS = ['#0891b2', '#7c3aed', '#ea580c', '#059669'];

// 计算每个线程的局部最大值
function getLocalMax(tid) {
  let m = -Infinity;
  for (let i = tid; i < N; i += BLOCK_SIZE) {
    m = Math.max(m, ROW_DATA[i]);
  }
  return m;
}

// 归约层级数
const REDUCTION_LEVELS = Math.log2(BLOCK_SIZE); // 2 levels for BLOCK_SIZE=4

export default function ParallelReductionDemo() {
  // 阶段:
  // 0: 初始
  // 1..BLOCK_SIZE: 逐个线程高亮其负责的元素并显示局部最大值
  // BLOCK_SIZE+1 .. BLOCK_SIZE+REDUCTION_LEVELS: 归约的每一层
  // BLOCK_SIZE+REDUCTION_LEVELS+1: 完成
  const totalSteps = BLOCK_SIZE + REDUCTION_LEVELS + 1;
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep(s => Math.min(s + 1, totalSteps)), [totalSteps]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);
  const reset = useCallback(() => setStep(0), []);

  const isFirst = step === 0;
  const isLast = step >= totalSteps;

  // 当前激活的线程 (局部最大值阶段)
  const activeThread = step >= 1 && step <= BLOCK_SIZE ? step - 1 : -1;
  // 已完成局部最大值的线程
  const completedThreads = step >= 1 ? Math.min(step, BLOCK_SIZE) : 0;

  // 归约阶段
  const reductionLevel = step > BLOCK_SIZE ? step - BLOCK_SIZE : 0;
  const inReduction = reductionLevel > 0 && reductionLevel <= REDUCTION_LEVELS;
  const done = step >= totalSteps;

  // 计算归约过程中 sdata 的状态
  function getSdata() {
    const sdata = Array.from({ length: BLOCK_SIZE }, (_, tid) => getLocalMax(tid));
    for (let level = 0; level < Math.min(reductionLevel, REDUCTION_LEVELS); level++) {
      const stride = BLOCK_SIZE >> (level + 1);
      for (let tid = 0; tid < stride; tid++) {
        sdata[tid] = Math.max(sdata[tid], sdata[tid + stride]);
      }
    }
    return sdata;
  }

  const sdata = getSdata();
  const globalMax = Math.max(...ROW_DATA);

  // 判断元素属于哪个线程 (交错分配: tid, tid+BLOCK_SIZE, tid+2*BLOCK_SIZE, ...)
  function getOwnerThread(idx) {
    return idx % BLOCK_SIZE;
  }

  // 状态描述
  function getDescription() {
    if (step === 0) {
      return `点击 ▶ 开始 — ${BLOCK_SIZE} 个线程并行处理 ${N} 个元素，每个线程负责 ${CHUNK} 个`;
    }
    if (activeThread >= 0) {
      const indices = [];
      for (let i = activeThread; i < N; i += BLOCK_SIZE) indices.push(i);
      const localMax = getLocalMax(activeThread);
      return `线程 ${activeThread}: 遍历索引 [${indices.join(', ')}]，局部最大值 = ${localMax}`;
    }
    if (inReduction) {
      const stride = BLOCK_SIZE >> reductionLevel;
      return `归约第 ${reductionLevel} 层: stride=${stride}，线程 0..${stride - 1} 比较 sdata[tid] 和 sdata[tid+${stride}]`;
    }
    if (done) {
      return `归约完成！sdata[0] = ${globalMax} 即为整行最大值`;
    }
    return '';
  }

  return (
    <div role="figure" aria-label="并行归约演示" style={{
      fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 720,
      margin: '2rem auto', padding: '1.5rem', borderRadius: 12,
      background: 'transparent', border: '1px solid transparent',
    }}>
      {/* 标题 + 控制 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          并行归约求最大值
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

      {/* 线程图例 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        {Array.from({ length: BLOCK_SIZE }, (_, tid) => (
          <div key={tid} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            opacity: activeThread >= 0 && activeThread !== tid ? 0.4 : 1,
            transition: 'opacity 250ms',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: THREAD_COLORS[tid],
            }} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569' }}>
              Thread {tid}
            </span>
          </div>
        ))}
      </div>

      {/* 原始数据行 */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
          S[row] (HBM)
        </span>
        <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'center' }}>
          {ROW_DATA.map((val, idx) => {
            const owner = getOwnerThread(idx);
            const isActive = activeThread === owner;
            const isCompleted = owner < completedThreads;
            const showColor = step >= 1 && (isActive || isCompleted);
            return (
              <div key={idx} style={{
                width: 38, height: 34, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 1,
                background: showColor ? `${THREAD_COLORS[owner]}18` : '#f8fafc',
                border: isActive ? `2px solid ${THREAD_COLORS[owner]}` : '1px solid #e2e8f0',
                transition: 'all 250ms',
              }}>
                <span style={{
                  fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                  color: showColor ? THREAD_COLORS[owner] : '#0f172a',
                }}>
                  {val}
                </span>
                <span style={{
                  fontSize: 7, fontFamily: 'monospace',
                  color: showColor ? THREAD_COLORS[owner] : '#94a3b8',
                }}>
                  [{idx}]
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 箭头指示 */}
      {completedThreads > 0 && (
        <div style={{ textAlign: 'center', margin: '8px 0', fontSize: 14, color: '#94a3b8' }}>↓</div>
      )}

      {/* sdata 共享内存 */}
      {completedThreads > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>
            sdata[{BLOCK_SIZE}] (Shared Memory)
          </span>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'center' }}>
            {Array.from({ length: BLOCK_SIZE }, (_, tid) => {
              const filled = tid < completedThreads || step > BLOCK_SIZE;
              const localMax = getLocalMax(tid);
              const currentVal = step > BLOCK_SIZE ? sdata[tid] : localMax;

              // 归约中高亮活跃的位置
              let isReductionActive = false;
              let isReductionSource = false;
              if (inReduction) {
                const stride = BLOCK_SIZE >> reductionLevel;
                isReductionActive = tid < stride;
                isReductionSource = tid >= stride && tid < stride * 2;
              }

              return (
                <div key={tid} style={{
                  width: 64, height: 48, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 2,
                  background: isReductionActive ? `${THREAD_COLORS[tid]}20`
                    : isReductionSource ? 'rgba(234,88,12,0.08)'
                    : filled ? `${THREAD_COLORS[tid]}10` : '#f1f5f9',
                  border: isReductionActive ? `2px solid ${THREAD_COLORS[tid]}`
                    : isReductionSource ? '2px dashed #ea580c'
                    : filled ? `1.5px solid ${THREAD_COLORS[tid]}40` : '1px solid #e2e8f0',
                  transition: 'all 300ms',
                  opacity: filled ? 1 : 0.4,
                }}>
                  <span style={{
                    fontSize: 14, fontFamily: 'monospace', fontWeight: 700,
                    color: filled ? '#0f172a' : '#cbd5e1',
                  }}>
                    {filled ? currentVal : '·'}
                  </span>
                  <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#94a3b8' }}>
                    sdata[{tid}]
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 归约过程可视化 */}
      {(inReduction || done) && (
        <div style={{
          marginTop: 12, padding: '10px 16px', borderRadius: 8,
          background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)',
        }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 600 }}>
            树形归约过程
          </span>
          <div style={{ marginTop: 8 }}>
            {Array.from({ length: REDUCTION_LEVELS }, (_, level) => {
              const stride = BLOCK_SIZE >> (level + 1);
              const isCurrentLevel = reductionLevel === level + 1;
              const isPastLevel = reductionLevel > level + 1 || done;
              if (!isCurrentLevel && !isPastLevel) return null;

              // 计算该层归约前的 sdata
              const sdataBefore = Array.from({ length: BLOCK_SIZE }, (_, tid) => getLocalMax(tid));
              for (let l = 0; l < level; l++) {
                const s = BLOCK_SIZE >> (l + 1);
                for (let t = 0; t < s; t++) {
                  sdataBefore[t] = Math.max(sdataBefore[t], sdataBefore[t + s]);
                }
              }

              return (
                <div key={level} style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                  opacity: isPastLevel ? 0.5 : 1,
                  transition: 'opacity 300ms',
                }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'monospace', color: '#7c3aed',
                    minWidth: 70, fontWeight: isCurrentLevel ? 700 : 400,
                  }}>
                    stride={stride}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: stride }, (_, tid) => (
                      <span key={tid} style={{
                        fontSize: 9, fontFamily: 'monospace', padding: '2px 6px',
                        borderRadius: 3,
                        background: isCurrentLevel ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.05)',
                        color: '#7c3aed',
                      }}>
                        max({sdataBefore[tid]},{sdataBefore[tid + stride]})→{Math.max(sdataBefore[tid], sdataBefore[tid + stride])}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 结果 */}
      {done && (
        <div style={{
          marginTop: 12, textAlign: 'center', padding: '8px 16px',
          borderRadius: 8, background: 'rgba(5,150,105,0.08)',
          border: '1px solid rgba(5,150,105,0.2)',
        }}>
          <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
            m = sdata[0] = {globalMax}
          </span>
        </div>
      )}

      {/* 状态说明 */}
      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <div style={{
          fontSize: 12, fontFamily: 'monospace',
          padding: '6px 14px', borderRadius: 6, display: 'inline-block',
          background: done ? 'rgba(5,150,105,0.08)' : inReduction ? 'rgba(124,58,237,0.08)' : 'rgba(8,145,178,0.08)',
          color: done ? '#059669' : inReduction ? '#7c3aed' : '#0891b2',
        }}>
          {getDescription()}
        </div>
      </div>
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
