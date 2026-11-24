import { useEffect, useRef } from 'react';
import type { ThemeId } from '../../lib/themes';

interface MarketFlowCanvasProps {
  themeId: ThemeId;
  /** Live market breadth bias in [-1, 1] (-1 = risk-off, +1 = risk-on). */
  sentiment?: number;
  className?: string;
}

const VERTEX_SHADER = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Procedural silk-arc financial flow shader (no purple/neon, tailored to Slate & Daylight)
const FRAGMENT_SHADER = `
precision mediump float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_isLight;
uniform float u_sentiment;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Subtle damped pointer tilt
  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0);
  float distMouse = length(p - m * 0.45);
  float mouseLift = exp(-distMouse * 2.4) * 0.14;

  // Base surface tone
  vec3 bgDark = vec3(0.075, 0.092, 0.125);
  vec3 bgLight = vec3(0.976, 0.980, 0.988);
  vec3 base = mix(bgDark, bgLight, u_isLight);

  // Palette accents (bullish emerald, neutral cool-slate, cautious warm-amber/crimson)
  vec3 bullCol = mix(vec3(0.227, 0.839, 0.624), vec3(0.051, 0.580, 0.408), u_isLight);
  vec3 bearCol = mix(vec3(0.949, 0.447, 0.490), vec3(0.788, 0.231, 0.282), u_isLight);
  vec3 slateCol = mix(vec3(0.450, 0.660, 0.920), vec3(0.220, 0.420, 0.690), u_isLight);

  float bullWeight = clamp(0.55 + u_sentiment * 0.45, 0.15, 0.95);
  vec3 primaryAccent = mix(bearCol, bullCol, bullWeight);

  // Layered predictive trajectory ribbons
  float ribbonAcc = 0.0;
  float ribbonSecondary = 0.0;
  float t = u_time * 0.28;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float freq = 1.45 + fi * 0.34;
    float phase = t * (0.85 + fi * 0.14) + fi * 1.15;
    float drift = sin(p.x * freq + phase) * (0.11 + fi * 0.018)
                + cos(p.x * (freq * 0.55) - phase * 0.65) * 0.055;
    float n = (noise(vec2(p.x * 1.3 + t * 0.25, fi * 2.1)) - 0.5) * 0.07;
    float yOffset = -0.18 + fi * 0.095 + drift + n + mouseLift * (0.5 - fi * 0.08);
    float d = abs(p.y - yOffset);

    // Crisp filament + soft atmospheric halo
    float core = smoothstep(0.0085, 0.0008, d) * (0.55 - fi * 0.06);
    float halo = exp(-d * (14.0 + fi * 2.0)) * (0.18 - fi * 0.018);

    if (i < 3) {
      ribbonAcc += core + halo;
    } else {
      ribbonSecondary += core + halo;
    }
  }

  // Gentle horizontal vignette so left editorial copy stays ultra-legible
  float rightFocus = smoothstep(-0.15, 0.85, uv.x);
  float edgeFade = smoothstep(0.0, 0.14, uv.y) * smoothstep(1.0, 0.84, uv.y);
  float strength = mix(0.28, 1.0, rightFocus) * edgeFade;

  float darkScale = mix(0.62, 0.30, u_isLight);
  vec3 col = base;
  col = mix(col, primaryAccent, clamp(ribbonAcc * strength * darkScale, 0.0, 0.52));
  col = mix(col, slateCol, clamp(ribbonSecondary * strength * darkScale * 0.85, 0.0, 0.38));

  // Subtle ambient radial sheen on right side
  float orb = exp(-length(p - vec2(aspect * 0.28, 0.05) - m * 0.15) * 2.1);
  col = mix(col, primaryAccent, orb * mix(0.11, 0.06, u_isLight));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function draw2DFallback(
  canvas: HTMLCanvasElement,
  themeId: ThemeId,
  sentiment: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const isLight = themeId === 'daylight';
  const primary =
    sentiment >= 0
      ? isLight
        ? 'rgba(13, 148, 104, 0.22)'
        : 'rgba(58, 214, 159, 0.24)'
      : isLight
        ? 'rgba(201, 59, 72, 0.20)'
        : 'rgba(242, 114, 125, 0.22)';
  const secondary = isLight
    ? 'rgba(37, 99, 235, 0.14)'
    : 'rgba(120, 183, 255, 0.16)';

  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const baseY = h * (0.32 + i * 0.14);
    for (let x = 0; x <= w; x += 12) {
      const nx = x / Math.max(w, 1);
      const y =
        baseY +
        Math.sin(nx * (4.2 + i * 0.7) + i * 1.1) * (h * 0.11) +
        Math.cos(nx * 2.1 - i) * (h * 0.05);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i < 2 ? primary : secondary;
    ctx.lineWidth = Math.max(1.25, w * 0.0014);
    ctx.stroke();
  }
}

export function MarketFlowCanvas({
  themeId,
  sentiment = 0.25,
  className = '',
}: MarketFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sentimentRef = useRef<number>(sentiment);
  const themeRef = useRef<ThemeId>(themeId);

  useEffect(() => {
    sentimentRef.current = sentiment;
  }, [sentiment]);

  useEffect(() => {
    themeRef.current = themeId;
  }, [themeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const nextW = Math.max(1, Math.floor(rect.width * dpr));
      const nextH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
      return { width: nextW, height: nextH };
    };

    if (!gl) {
      syncSize();
      draw2DFallback(canvas, themeRef.current, sentimentRef.current);
      const ro = new ResizeObserver(() => {
        syncSize();
        draw2DFallback(canvas, themeRef.current, sentimentRef.current);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(program, 'a_pos');
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');
    const uIsLight = gl.getUniformLocation(program, 'u_isLight');
    const uSentiment = gl.getUniformLocation(program, 'u_sentiment');

    const mouseTarget = { x: 0.72, y: 0.48 };
    const mouseCurrent = { x: 0.72, y: 0.48 };
    let isVisible = true;
    let rafId = 0;
    const startTs = performance.now();

    const parent = canvas.parentElement;
    const onPointerMove = (e: PointerEvent) => {
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseTarget.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      mouseTarget.y = Math.min(
        1,
        Math.max(0, 1 - (e.clientY - rect.top) / rect.height),
      );
    };

    const onPointerLeave = () => {
      mouseTarget.x = 0.72;
      mouseTarget.y = 0.48;
    };

    parent?.addEventListener('pointermove', onPointerMove, { passive: true });
    parent?.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const renderFrame = (now: number) => {
      const { width, height } = syncSize();
      gl.viewport(0, 0, width, height);

      mouseCurrent.x += (mouseTarget.x - mouseCurrent.x) * 0.06;
      mouseCurrent.y += (mouseTarget.y - mouseCurrent.y) * 0.06;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, prefersReducedMotion ? 1.8 : (now - startTs) * 0.001);
      gl.uniform2f(uMouse, mouseCurrent.x, mouseCurrent.y);
      gl.uniform1f(uIsLight, themeRef.current === 'daylight' ? 1.0 : 0.0);
      gl.uniform1f(
        uSentiment,
        Math.max(-1, Math.min(1, sentimentRef.current)),
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = (now: number) => {
      if (!isVisible || document.hidden) {
        rafId = 0;
        return;
      }
      renderFrame(now);
      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(loop);
      } else {
        rafId = 0;
      }
    };

    const startLoop = () => {
      if (prefersReducedMotion) {
        renderFrame(performance.now());
        return;
      }
      if (!rafId && isVisible && !document.hidden) {
        rafId = window.requestAnimationFrame(loop);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0]?.isIntersecting ?? true;
        if (isVisible) startLoop();
      },
      { threshold: 0.01 },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      renderFrame(performance.now());
    });
    ro.observe(canvas);

    const onVisibility = () => {
      if (!document.hidden && isVisible) startLoop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    startLoop();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      parent?.removeEventListener('pointermove', onPointerMove);
      parent?.removeEventListener('pointerleave', onPointerLeave);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [themeId]);

  return (
    <canvas
      ref={canvasRef}
      className={`market-flow-canvas${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  );
}
