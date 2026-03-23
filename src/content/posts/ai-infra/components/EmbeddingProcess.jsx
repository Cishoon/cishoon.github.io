import { useState, useEffect, useRef, useCallback } from 'react';

const PROMPT_PARTS = [
  { token: "Attention", trailing: " " },
  { token: "is", trailing: " " },
  { token: "all", trailing: " " },
  { token: "you", trailing: " " },
  { token: "need", trailing: "" },
];
const TOKENS = PROMPT_PARTS.map(p => p.token);

// 实际 embedding 维度 d=128，界面只展示前3维 + ··· + 后3维
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
  const [embedProgress, setEmbedProgress] = useState(0);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const goto = useCallback((s) => {
    setStep(s);
    if (s < 2) setEmbedProgress(0);
  }, []);
  const prev = useCallback(() => goto(Math.max(0, step - 1)), [step, goto]);
  const next = useCallback(() => goto(Math.min(STEP_COUNT - 1, step + 1)), [step, goto]);

  // step 2: 逐个送入动画
  useEffect(() => {
    if (step !== 2) return;
    if (embedProgress < TOKENS.length) {
      timerRef.current = setTimeout(() => setEmbedProgress(p => p + 1), 600);
      return () => clearTimeout(timerRef.current);
    }
  }, [step, embedProgress]);

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

  // step 0: 句子样式（无间隙、无背景）
  // step 1: 裂开（间隙、背景色、圆角）
  // step 2: token 被消耗后变灰缩小
  const tokenStyle = (i) => {
    const consumed = step === 2 && i < embedProgress;
    const base = {
      display: 'inline-block',
      fontFamily: 'monospace',
      fontSize: 14,
      fontWeight: 500,
      whiteSpace: 'pre',
      transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
    };
    if (step === 0) {
      return {
        ...base,
        padding: '4px 0',
        borderRadius: 0,
        background: 'transparent',
        color: '#0f172a',
        marginRight: 0,
      };
    }
    // step >= 1: 分词块
    return {
      ...base,
      padding: '4px 10px',
      borderRadius: 5,
      marginRight: 6,
      background: consumed ? '#e2e8f0' : '#0891b2',
      color: consumed ? '#94a3b8' : '#fff',
      opacity: consumed ? 0.45 : 1,
      transform: consumed ? 'scale(0.92)' : 'scale(1)',
    };
  };

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
        border: '1px solid transparent',
        background: 'transparent',
        outline: 'none',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#164e63' }}>
          {['① 输入句子', '② Tokenizer 分词', `③ Token → Embedding → ℝ^${D}`][step]}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={prev} disabled={step === 0}>←</NavBtn>
          <span style={{ fontSize: 12, color: '#64748b', minWidth: 36, textAlign: 'center' }}>
            {step + 1}/{STEP_COUNT}
          </span>
          <NavBtn onClick={next} disabled={step === STEP_COUNT - 1}>→</NavBtn>
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= step ? '#0891b2' : '#e2e8f0',
            transition: 'background 250ms',
          }} />
        ))}
      </div>

      {/* === Token 行：始终存在，样式随 step 过渡 === */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: '12px 16px',
        borderRadius: 8,
        border: step >= 1 ? '1px dashed #0891b2' : '1px solid #e2e8f0',
        background: '#fff',
        transition: 'border 300ms',
        minHeight: 40,
      }}>
        {PROMPT_PARTS.map((part, i) => (
          <span key={i}>
            <span style={tokenStyle(i)}>{part.token}</span>
            {/* step 0 时显示空格保持句子原样 */}
            {step === 0 && part.trailing && (
              <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{part.trailing}</span>
            )}
          </span>
        ))}
      </div>

      {/* === Step 2: Embedding 模块 + 输出向量 === */}
      <div style={{
        overflow: 'hidden',
        maxHeight: step >= 2 ? 500 : 0,
        opacity: step >= 2 ? 1 : 0,
        transition: 'max-height 500ms ease, opacity 400ms ease',
      }}>
        {/* 箭头 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <svg width="16" height="22" viewBox="0 0 16 22" fill="none">
            <path d="M8 2 L8 15 M3 12 L8 18 L13 12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Embedding Layer 模块 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
          <div style={{
            padding: '8px 32px', borderRadius: 8,
            background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            letterSpacing: '0.04em',
            boxShadow: embedProgress > 0 && embedProgress < TOKENS.length
              ? '0 0 20px rgba(8,145,178,0.4)' : '0 2px 8px rgba(8,145,178,0.15)',
            transition: 'box-shadow 300ms',
          }}>
            Embedding Layer
          </div>
        </div>

        {/* 箭头 */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
          <svg width="16" height="22" viewBox="0 0 16 22" fill="none">
            <path d="M8 2 L8 15 M3 12 L8 18 L13 12" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* 输出向量纵向排列 */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {TOKENS.map((tok, i) => {
            const show = i < embedProgress;
            const { head, tail } = displaySlice(EMBEDDINGS[i]);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: show ? 1 : 0,
                transform: show ? 'translateY(0)' : 'translateY(-8px)',
                maxHeight: show ? 32 : 0,
                transition: 'all 350ms ease',
                overflow: 'hidden',
              }}>
                <span style={{
                  width: 56, fontSize: 12, fontFamily: 'monospace',
                  color: '#164e63', fontWeight: 600, textAlign: 'right', flexShrink: 0,
                }}>
                  x<sub>{i + 1}</sub>
                </span>
                <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>=&nbsp;[</span>
                {head.map((v, j) => (
                  <VecCell key={j} value={v} show={show} delay={j * 30} />
                ))}
                <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: 2 }}>···</span>
                {tail.map((v, j) => (
                  <VecCell key={`t${j}`} value={v} show={show} delay={(SHOW_HEAD + j) * 30} />
                ))}
                <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>]</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>{tok}</span>
              </div>
            );
          })}
        </div>
        </div>
      </div>
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
