import { useState, useEffect, useRef, useCallback } from 'react';

const PROMPT = "Attention is all you need";
const TOKENS = ["Attention", "is", "all", "you", "need"];

// 实际 embedding 维度 d=128，界面只展示前3维 + ... + 后3维
const D = 128;
const SHOW_HEAD = 3;
const SHOW_TAIL = 3;

const EMBEDDINGS = TOKENS.map((_, i) =>
  Array.from({ length: D }, (__, j) => {
    const v = Math.sin((i + 1) * (j + 1) * 1.618) * 0.5;
    return parseFloat(v.toFixed(2));
  })
);

function displaySlice(vec) {
  return { head: vec.slice(0, SHOW_HEAD), tail: vec.slice(-SHOW_TAIL) };
}

// step 0: 展示句子
// step 1: 句子内部切分出 token（原地高亮分割）
// step 2: Embedding 模块出现，token 逐个送入，输出向量纵向排列
const STEP_COUNT = 3;

function vecColor(v) {
  const t = v + 0.5;
  if (t < 0.5) {
    const s = t / 0.5;
    return `rgb(${Math.round(59 + s * 196)},${Math.round(130 + s * 125)},${Math.round(246 - s * 46)})`;
  }
  const s = (t - 0.5) / 0.5;
  return `rgb(255,${Math.round(255 - s * 118)},${Math.round(200 - s * 140)})`;
}

export default function EmbeddingProcess() {
  const [step, setStep] = useState(0);
  // step2 中逐个送入的进度（0 ~ TOKENS.length）
  const [embedProgress, setEmbedProgress] = useState(0);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const prev = useCallback(() => {
    setStep(s => {
      const ns = Math.max(0, s - 1);
      if (ns < 2) setEmbedProgress(0);
      return ns;
    });
  }, []);

  const next = useCallback(() => {
    setStep(s => Math.min(STEP_COUNT - 1, s + 1));
  }, []);

  // step 2 进入时，逐个送入 token 的动画
  useEffect(() => {
    if (step !== 2) return;
    if (embedProgress < TOKENS.length) {
      timerRef.current = setTimeout(() => setEmbedProgress(p => p + 1), 500);
      return () => clearTimeout(timerRef.current);
    }
  }, [step, embedProgress]);

  // 离开 step 2 时重置进度
  useEffect(() => {
    if (step < 2) setEmbedProgress(0);
  }, [step]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    const el = containerRef.current;
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [prev, next]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="figure"
      aria-label="Token Embedding 流程演示，使用左右方向键切换步骤"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: 740,
        margin: '2rem auto',
        padding: '1.5rem',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        outline: 'none',
        minHeight: 260,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          {['① 输入句子', '② Tokenizer 分词', `③ Embedding → ℝ^${D}`][step]}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={prev} disabled={step === 0}>←</NavBtn>
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'center' }}>
            {step + 1}/{STEP_COUNT}
          </span>
          <NavBtn onClick={next} disabled={step === STEP_COUNT - 1}>→</NavBtn>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? '#0891b2' : '#e2e8f0',
            transition: 'background 250ms',
          }} />
        ))}
      </div>

      {/* === Stage area === */}
      <div style={{ position: 'relative' }}>

        {/* Step 0: 完整句子 */}
        {step === 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '32px 0',
            animation: 'fadeIn 300ms ease',
          }}>
            <div style={{
              padding: '12px 24px', borderRadius: 8,
              background: '#fff', border: '1px solid #e2e8f0',
              fontSize: 16, color: '#0f172a', fontFamily: 'monospace',
            }}>
              "{PROMPT}"
            </div>
          </div>
        )}

        {/* Step 1: 句子内切分 token */}
        {step === 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '32px 0',
            animation: 'fadeIn 300ms ease',
          }}>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: '12px 16px', borderRadius: 8,
              background: '#fff', border: '1px dashed #0891b2',
            }}>
              {TOKENS.map((tok, i) => (
                <span key={i} style={{
                  display: 'inline-block',
                  padding: '4px 10px', borderRadius: 5,
                  fontSize: 14, fontFamily: 'monospace', fontWeight: 500,
                  background: '#0891b2', color: '#fff',
                  transform: 'scale(1)',
                  animation: `popIn 300ms cubic-bezier(0.34,1.56,0.64,1) ${i * 80}ms both`,
                }}>
                  {tok}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Embedding 流程 */}
        {step === 2 && (
          <div style={{ animation: 'fadeIn 300ms ease' }}>
            {/* 上方：横向 tokens 队列 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              justifyContent: 'center', marginBottom: 12,
            }}>
              {TOKENS.map((tok, i) => {
                const consumed = i < embedProgress;
                const active = i === embedProgress - 1;
                return (
                  <span key={i} style={{
                    padding: '4px 10px', borderRadius: 5,
                    fontSize: 13, fontFamily: 'monospace', fontWeight: 500,
                    background: consumed ? '#e2e8f0' : '#0891b2',
                    color: consumed ? '#94a3b8' : '#fff',
                    opacity: consumed ? 0.5 : 1,
                    transform: active ? 'translateY(4px) scale(0.95)' : 'translateY(0)',
                    transition: 'all 350ms ease',
                  }}>
                    {tok}
                  </span>
                );
              })}
            </div>

            {/* 中间：Embedding 模块 */}
            <div style={{
              display: 'flex', justifyContent: 'center', margin: '8px 0',
            }}>
              <div style={{
                padding: '8px 28px', borderRadius: 8,
                background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.05em',
                boxShadow: embedProgress > 0 && embedProgress <= TOKENS.length
                  ? '0 0 16px rgba(8,145,178,0.35)' : 'none',
                transition: 'box-shadow 300ms',
              }}>
                Embedding Layer
              </div>
            </div>

            {/* 下方箭头 */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                <path d="M8 2 L8 14 M3 11 L8 16 L13 11" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* 下方：输出的向量纵向排列 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {TOKENS.map((tok, i) => {
                const show = i < embedProgress;
                const { head, tail } = displaySlice(EMBEDDINGS[i]);
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: show ? 1 : 0,
                    transform: show ? 'translateY(0)' : 'translateY(-10px)',
                    transition: `all 350ms ease ${show ? '0ms' : '0ms'}`,
                    height: show ? 30 : 0,
                    overflow: 'hidden',
                  }}>
                    <span style={{
                      width: 72, fontSize: 12, fontFamily: 'monospace',
                      color: '#164e63', fontWeight: 500, textAlign: 'right', flexShrink: 0,
                    }}>
                      x<sub>{i + 1}</sub> =
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>[</span>
                    {head.map((v, j) => (
                      <VecCell key={j} value={v} show={show} delay={j * 30} />
                    ))}
                    <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: 2 }}>···</span>
                    {tail.map((v, j) => (
                      <VecCell key={`t${j}`} value={v} show={show} delay={(SHOW_HEAD + j) * 30} />
                    ))}
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>]</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginLeft: 4 }}>
                      {tok}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 图例 */}
            {embedProgress >= TOKENS.length && (
              <div style={{
                marginTop: 14, fontSize: 11, color: '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                animation: 'fadeIn 400ms ease',
              }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  background: 'linear-gradient(90deg, #3b82f6, #fff, #f97316)', flexShrink: 0,
                }} />
                d={D}，展示前{SHOW_HEAD}维 + 后{SHOW_TAIL}维 | 蓝(负) → 白(0) → 橙(正)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        ← → 方向键切换步骤
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.7); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function VecCell({ value, show, delay }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 44, height: 24, borderRadius: 3,
      fontSize: 10, fontFamily: 'monospace', fontWeight: 500,
      background: show ? vecColor(value) : '#f1f5f9',
      color: show ? '#0f172a' : '#cbd5e1',
      transition: `background 350ms ease ${delay}ms`,
    }}>
      {value > 0 ? '+' : ''}{value.toFixed(2)}
    </span>
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
