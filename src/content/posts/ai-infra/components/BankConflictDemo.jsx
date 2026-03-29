/**
 * BankConflictDemo — GPU Shared Memory Bank Conflict 交互演示
 * 对比两种 shared memory 布局：s_K[tx][k] (有 bank conflict) vs s_K[k][tx] (无 conflict)
 * 展示 32 个 bank 的访问模式，逐线程步进演示冲突情况
 */
import { useState, useCallback } from 'react';

// ── 常量 ──
const TILE = 16;
const NUM_BANKS = 32;
const K_VAL = 3; // 固定 k=3
const NUM_THREADS = 16; // tx = 0..15

// ── 计算两种模式下每个线程的 offset 和 bank ──
function computeAccesses(mode) {
  const accesses = [];
  for (let tx = 0; tx < NUM_THREADS; tx++) {
    let offset, bank;
    if (mode === 'conflict') {
      // s_K[tx][k]: row-major, offset = tx * TILE + k
      offset = tx * TILE + K_VAL;
      bank = offset % NUM_BANKS;
    } else {
      // s_K[k][tx]: row-major, offset = k * TILE + tx
      offset = K_VAL * TILE + tx;
      bank = offset % NUM_BANKS;
    }
    accesses.push({ tx, offset, bank });
  }
  return accesses;
}

const CONFLICT_ACCESSES = computeAccesses('conflict');
const NO_CONFLICT_ACCESSES = computeAccesses('noconflict');

// ── bank 冲突分析 ──
function analyzeBankUsage(accesses, upToStep) {
  const bankCounts = {};
  for (let i = 0; i < upToStep; i++) {
    const b = accesses[i].bank;
    bankCounts[b] = (bankCounts[b] || 0) + 1;
  }
  const maxCount = Math.max(0, ...Object.values(bankCounts));
  return { bankCounts, maxCount };
}

// ── 给冲突 bank 分配颜色 ──
const BANK_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
function getBankColorMap(accesses) {
  const bankThreads = {};
  for (const a of accesses) {
    if (!bankThreads[a.bank]) bankThreads[a.bank] = [];
    bankThreads[a.bank].push(a.tx);
  }
  const colorMap = {};
  let ci = 0;
  for (const [bank, threads] of Object.entries(bankThreads)) {
    if (threads.length > 1) {
      colorMap[bank] = BANK_COLORS[ci % BANK_COLORS.length];
      ci++;
    }
  }
  return colorMap;
}

const CONFLICT_COLOR_MAP = getBankColorMap(CONFLICT_ACCESSES);
const NO_CONFLICT_COLOR_MAP = getBankColorMap(NO_CONFLICT_ACCESSES);

export default function BankConflictDemo() {
  const [mode, setMode] = useState('conflict'); // 'conflict' | 'noconflict'
  const [step, setStep] = useState(0);
  const totalSteps = NUM_THREADS;

  const accesses = mode === 'conflict' ? CONFLICT_ACCESSES : NO_CONFLICT_ACCESSES;
  const colorMap = mode === 'conflict' ? CONFLICT_COLOR_MAP : NO_CONFLICT_COLOR_MAP;
  const { bankCounts, maxCount } = analyzeBankUsage(accesses, step);

  const isFirst = step === 0;
  const isLast = step >= totalSteps;

  const next = useCallback(() => setStep(s => Math.min(s + 1, totalSteps)), [totalSteps]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);
  const reset = useCallback(() => setStep(0), []);

  const switchMode = useCallback((m) => {
    setMode(m);
    setStep(0);
  }, []);

  // 当前已显示的线程的 bank 集合（用于着色）
  const visibleBanks = {};
  for (let i = 0; i < step; i++) {
    const b = accesses[i].bank;
    if (!visibleBanks[b]) visibleBanks[b] = [];
    visibleBanks[b].push(accesses[i].tx);
  }

  return (
    <div
      role="figure"
      aria-label="Bank Conflict 演示"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        maxWidth: 780,
        margin: "2rem auto",
        padding: "1.5rem",
        borderRadius: 12,
        background: "transparent",
        border: "1px solid transparent",
      }}
    >
      {/* 标题 + 模式切换 + 控制按钮 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#164e63" }}>Shared Memory Bank Conflict</span>
          <TabBtn active={mode === "conflict"} onClick={() => switchMode("conflict")} label="s_K[tx][k]" />
          <TabBtn active={mode === "noconflict"} onClick={() => switchMode("noconflict")} label="s_K[k][tx]" />
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
            {step}/{totalSteps}
          </span>
          <StepBtn onClick={reset} disabled={isFirst} label="⟲" />
          <StepBtn onClick={prev} disabled={isFirst} label="◀" />
          <StepBtn onClick={next} disabled={isLast} label="▶" primary={!isLast} />
        </div>
      </div>

      {/* 访问模式说明 */}
      <div
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: "#64748b",
          marginBottom: 14,
          padding: "6px 10px",
          borderRadius: 6,
          background: "rgba(148,163,184,0.06)",
        }}
      >
        {mode === "conflict" ? (
          <>
            k={K_VAL} 固定，tx=0..15 访问 <span style={{ color: "#ef4444", fontWeight: 600 }}>s_K[tx][{K_VAL}]</span> &mdash; stride={TILE}，{TILE}%{NUM_BANKS}=
            {TILE}，每 2 个线程撞同一 bank
          </>
        ) : (
          <>
            k={K_VAL} 固定，tx=0..15 访问 <span style={{ color: "#059669", fontWeight: 600 }}>s_K[{K_VAL}][tx]</span> &mdash; stride=1，连续 bank，无冲突
          </>
        )}
      </div>

      {/* 32 个 Bank 槽位 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginBottom: 6, fontWeight: 600 }}>32 Banks</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {Array.from({ length: NUM_BANKS }, (_, bankId) => {
            const count = bankCounts[bankId] || 0;
            const hasConflict = count > 1;
            const isActive = count > 0;
            const color = colorMap[bankId];

            let bg = "#f1f5f9";
            let borderColor = "#e2e8f0";
            let textColor = "#94a3b8";

            if (isActive && hasConflict) {
              bg = color ? `${color}20` : "rgba(239,68,68,0.12)";
              borderColor = color || "#ef4444";
              textColor = color || "#ef4444";
            } else if (isActive) {
              bg = "rgba(5,150,105,0.12)";
              borderColor = "#059669";
              textColor = "#059669";
            }

            return (
              <div
                key={bankId}
                style={{
                  position: "relative",
                  width: 22,
                  height: 28,
                  borderRadius: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: bg,
                  border: `1.5px solid ${borderColor}`,
                  transition: "all 250ms",
                }}
              >
                <span style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 500, color: textColor }}>{bankId}</span>
                {hasConflict && (
                  <span
                    style={{
                      position: "absolute",
                      top: -7,
                      right: -5,
                      fontSize: 7,
                      fontWeight: 700,
                      color: "#fff",
                      background: color || "#ef4444",
                      borderRadius: 4,
                      padding: "0 3px",
                      lineHeight: "13px",
                    }}
                  >
                    x{count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 线程访问表 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginBottom: 6, fontWeight: 600 }}>Thread Access Pattern (k={K_VAL})</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 3,
          }}
        >
          {accesses.map((a, idx) => {
            const isVisible = idx < step;
            const isCurrent = idx === step - 1;
            const bankColor = colorMap[a.bank];
            // 判断该线程是否冲突（与其他可见线程同 bank）
            const bankCount = isVisible ? visibleBanks[a.bank]?.length || 0 : 0;
            const hasConflict = bankCount > 1;

            let bg = "#f8fafc";
            let border = "1px solid #e2e8f0";
            let textColor = "#cbd5e1";

            if (isVisible) {
              if (hasConflict && bankColor) {
                bg = `${bankColor}10`;
                border = `1.5px solid ${bankColor}`;
                textColor = "#0f172a";
              } else if (isVisible) {
                bg = "rgba(5,150,105,0.06)";
                border = "1.5px solid #059669";
                textColor = "#0f172a";
              }
            }

            if (isCurrent) {
              bg = hasConflict && bankColor ? `${bankColor}20` : "rgba(5,150,105,0.15)";
            }

            return (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 6px",
                  borderRadius: 4,
                  background: bg,
                  border,
                  transition: "all 250ms",
                  fontSize: 9,
                  fontFamily: "monospace",
                  opacity: isVisible ? 1 : 0.4,
                }}
              >
                <span style={{ color: textColor, fontWeight: 600, minWidth: 24 }}>t{a.tx}</span>
                <span style={{ color: isVisible ? "#64748b" : "#cbd5e1" }}>off={a.offset}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontWeight: 700,
                    color: isVisible ? (hasConflict ? bankColor || "#ef4444" : "#059669") : "#cbd5e1",
                  }}
                >
                  B{a.bank}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部总结 */}
      <div style={{ textAlign: "center", minHeight: 40 }}>
        {step === 0 && (
          <div
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              padding: "6px 14px",
              borderRadius: 6,
              display: "inline-block",
              background: "rgba(148,163,184,0.08)",
              color: "#64748b",
            }}
          >
            {mode === "conflict" ? (
              <>点击 &#x25B6; 逐线程查看 s_K[tx][{K_VAL}] 的 bank 访问模式</>
            ) : (
              <>点击 &#x25B6; 逐线程查看 s_K[{K_VAL}][tx] 的 bank 访问模式</>
            )}
          </div>
        )}
        {step > 0 && !isLast && (
          <div
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              padding: "6px 14px",
              borderRadius: 6,
              display: "inline-block",
              background: mode === "conflict" ? "rgba(239,68,68,0.06)" : "rgba(5,150,105,0.06)",
              color: mode === "conflict" ? "#ef4444" : "#059669",
              transition: "all 200ms",
            }}
          >
            {mode === "conflict" ? (
              <>
                thread {step - 1} → offset {accesses[step - 1].offset} → bank {accesses[step - 1].bank}
                {bankCounts[accesses[step - 1].bank] > 1 ? (
                  <>
                    {" "}
                    (冲突! bank {accesses[step - 1].bank} 已被访问 {bankCounts[accesses[step - 1].bank]} 次)
                  </>
                ) : null}
              </>
            ) : (
              <>
                thread {step - 1} → offset {accesses[step - 1].offset} → bank {accesses[step - 1].bank} (独占)
              </>
            )}
          </div>
        )}
        {isLast && (
          <div
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              padding: "8px 16px",
              borderRadius: 6,
              display: "inline-block",
              background: mode === "conflict" ? "rgba(239,68,68,0.08)" : "rgba(5,150,105,0.08)",
              color: mode === "conflict" ? "#ef4444" : "#059669",
              fontWeight: 600,
            }}
          >
            {mode === "conflict" ? (
              <>
                {maxCount}-way conflict &mdash; 需要 {maxCount} 个周期
              </>
            ) : (
              <>无冲突 &mdash; 1 个周期完成</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 模式切换按钮 ──
function TabBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '3px 10px', borderRadius: 5, fontSize: 11,
      fontFamily: 'monospace', fontWeight: 600,
      border: `1.5px solid ${active ? '#0891b2' : '#e2e8f0'}`,
      background: active ? 'rgba(8,145,178,0.1)' : '#f8fafc',
      color: active ? '#0891b2' : '#94a3b8',
      cursor: 'pointer', transition: 'all 150ms',
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
