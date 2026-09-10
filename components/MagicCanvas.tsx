"use client";

import { createFalClient } from "@fal-ai/client";
import {
  Brush,
  Download,
  Eraser,
  Image as ImageIcon,
  Maximize2,
  Moon,
  Redo2,
  RotateCcw,
  Sparkles,
  Sun,
  Undo2,
  WandSparkles,
  Zap,
} from "lucide-react";
import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const MODEL_ID = "fal-ai/flux-2/klein/realtime";
const CANVAS_SIZE = 704;

const fal = createFalClient();

type Point = { x: number; y: number };
type Stroke = {
  tool: "brush" | "eraser";
  width: number;
  points: Point[];
};

type ConnectionState = "connecting" | "ready" | "generating" | "error";

type StylePreset = {
  id: string;
  label: string;
  prompt: string;
};

const STYLES: StylePreset[] = [
  {
    id: "real",
    label: "Realistic",
    prompt: "photorealistic, natural materials, believable lighting, detailed textures, real-world proportions",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    prompt: "cinematic realism, dramatic natural light, filmic depth, premium composition, subtle atmospheric detail",
  },
  {
    id: "architecture",
    label: "Architecture",
    prompt: "professional architectural visualization, realistic building materials, landscaped environment, daylight render",
  },
  {
    id: "3d",
    label: "3D Render",
    prompt: "high-end 3D render, physically based materials, soft global illumination, polished product-quality finish",
  },
  {
    id: "anime",
    label: "Anime",
    prompt: "premium anime illustration, clean forms, rich cel shading, expressive lighting, polished key visual",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    prompt: "refined watercolor illustration, soft pigment blooms, paper texture, elegant color harmony",
  },
];

const BASE_PROMPT =
  "Transform this rough black line sketch into a coherent finished image. Infer what the user is drawing from the visual structure. Preserve the sketch composition, silhouette, object placement, perspective and proportions. Do not add text, borders, UI, signatures or watermarks.";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function bytesToUrl(image: any): string | null {
  if (!image?.content) return null;
  const mime = image.content_type || "image/jpeg";

  if (typeof image.content === "string") {
    if (image.content.startsWith("data:")) return image.content;
    return `data:${mime};base64,${image.content}`;
  }

  try {
    const bytes = image.content instanceof Uint8Array
      ? image.content
      : new Uint8Array(image.content);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return URL.createObjectURL(new Blob([buffer], { type: mime }));
  } catch {
    return null;
  }
}

export default function MagicCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionRef = useRef<any>(null);
  const latestResultUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(7);
  const [styleId, setStyleId] = useState("real");
  const [prompt, setPrompt] = useState("");
  const [feedback, setFeedback] = useState(0.93);
  const [steps, setSteps] = useState(3);
  const [interpolation, setInterpolation] = useState(true);
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [statusText, setStatusText] = useState("Connecting AI…");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const [mobileView, setMobileView] = useState<"draw" | "result">("draw");
  const [hasDrawing, setHasDrawing] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  const selectedStyle = useMemo(
    () => STYLES.find((s) => s.id === styleId) ?? STYLES[0],
    [styleId],
  );

  const fullPrompt = useMemo(() => {
    const intent = prompt.trim()
      ? ` The user intent is: ${prompt.trim()}.`
      : " Infer the subject entirely from the sketch.";
    return `${BASE_PROMPT}${intent} Final visual style: ${selectedStyle.prompt}. High quality, visually coherent.`;
  }, [prompt, selectedStyle]);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.restore();
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    const pts = stroke.points;
    if (!pts.length) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.tool === "eraser" ? "#fbfaf7" : "#171717";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = stroke.width;

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) {
        const prev = pts[i - 1];
        const p = pts[i];
        const mx = (prev.x + p.x) / 2;
        const my = (prev.y + p.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintBackground(ctx);
    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke));
  }, [drawStroke, paintBackground]);

  const sendFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const connection = connectionRef.current;
    if (!canvas || !connection || !hasDrawing) return;

    try {
      setStatus("generating");
      setStatusText("AI is imagining…");
      connection.send({
        image_url: canvas.toDataURL("image/jpeg", 0.5),
        prompt: fullPrompt,
        output_feedback_strength: feedback,
        enable_interpolation: interpolation,
        num_inference_steps: steps,
        schedule_mu: 2.3,
        image_size: "square",
      });
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusText("AI connection interrupted");
    }
  }, [feedback, fullPrompt, hasDrawing, interpolation, steps]);

  const scheduleSend = useCallback(
    (immediate = false) => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(sendFrame, immediate ? 0 : 110);
    },
    [sendFrame],
  );

  useEffect(() => {
    mountedRef.current = true;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) paintBackground(ctx);
    }

    const connection = fal.realtime.connect(MODEL_ID, {
      connectionKey: "magicdraw-ai-v1",
      throttleInterval: 140,
      tokenProvider: async (app: string) => {
        const response = await fetch("/api/fal/realtime-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app }),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to get fal realtime token");
        }
        return response.text();
      },
      tokenExpirationSeconds: 90,
      onResult: (result: any) => {
        if (!mountedRef.current) return;
        const image = result?.images?.[result.images.length - 1];
        const nextUrl = bytesToUrl(image);
        if (!nextUrl) return;

        if (latestResultUrlRef.current?.startsWith("blob:")) {
          URL.revokeObjectURL(latestResultUrlRef.current);
        }
        latestResultUrlRef.current = nextUrl;
        setResultUrl(nextUrl);
        setFrameCount((v) => v + 1);
        setStatus("ready");
        setStatusText("Live · Ready");
      },
      onError: (error: unknown) => {
        console.error("fal realtime:", error);
        if (!mountedRef.current) return;
        setStatus("error");
        setStatusText("AI offline · check FAL_KEY");
      },
    });

    connectionRef.current = connection;
    setStatus("ready");
    setStatusText("Live · Draw something");

    return () => {
      mountedRef.current = false;
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      if (latestResultUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(latestResultUrlRef.current);
      }
      try {
        connection?.close?.();
      } catch {}
    };
  }, [paintBackground]);

  useEffect(() => {
    if (hasDrawing) scheduleSend(false);
  }, [fullPrompt, feedback, interpolation, steps, hasDrawing, scheduleSend]);

  const getPoint = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * CANVAS_SIZE, 0, CANVAS_SIZE),
      y: clamp(((e.clientY - rect.top) / rect.height) * CANVAS_SIZE, 0, CANVAS_SIZE),
    };
  };

  const startDrawing = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    redoRef.current = [];
    const stroke: Stroke = {
      tool,
      width: tool === "eraser" ? brushSize * 3 : brushSize,
      points: [getPoint(e)],
    };
    activeStrokeRef.current = stroke;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawStroke(ctx, stroke);
    setHasDrawing(true);
  };

  const continueDrawing = (e: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!stroke || !ctx) return;

    const point = getPoint(e);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.width;
    ctx.strokeStyle = stroke.tool === "eraser" ? "#fbfaf7" : "#171717";
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();

    scheduleSend(false);
  };

  const endDrawing = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    strokesRef.current.push({ ...stroke, points: [...stroke.points] });
    activeStrokeRef.current = null;
    setHistoryTick((v) => v + 1);
    scheduleSend(true);
  };

  const undo = () => {
    const stroke = strokesRef.current.pop();
    if (!stroke) return;
    redoRef.current.push(stroke);
    redraw();
    setHasDrawing(strokesRef.current.length > 0);
    setHistoryTick((v) => v + 1);
    if (strokesRef.current.length) scheduleSend(true);
  };

  const redo = () => {
    const stroke = redoRef.current.pop();
    if (!stroke) return;
    strokesRef.current.push(stroke);
    redraw();
    setHasDrawing(true);
    setHistoryTick((v) => v + 1);
    scheduleSend(true);
  };

  const clear = () => {
    strokesRef.current = [];
    redoRef.current = [];
    activeStrokeRef.current = null;
    redraw();
    setHasDrawing(false);
    setResultUrl(null);
    setHistoryTick((v) => v + 1);
    setStatusText("Live · Draw something");
  };

  const downloadSketch = () => {
    const url = canvasRef.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "magicdraw-sketch.png";
    a.click();
  };

  const downloadResult = async () => {
    if (!resultUrl) return;
    try {
      const blob = await fetch(resultUrl).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "magicdraw-ai.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(resultUrl, "_blank");
    }
  };

  const statusClass = status === "error" ? "status-dot error" : status === "generating" ? "status-dot pulse" : "status-dot";
  const canUndo = strokesRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  void historyTick;

  return (
    <main className={dark ? "app dark" : "app light"}>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="topbar glass">
        <div className="brand">
          <div className="brand-mark"><WandSparkles size={18} /></div>
          <div>
            <strong>MagicDraw</strong><span> AI</span>
          </div>
          <div className="beta">REALTIME</div>
        </div>

        <div className="top-status">
          <span className={statusClass} />
          <span>{statusText}</span>
        </div>

        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDark((v) => !v)} aria-label="Toggle theme">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="primary-btn" onClick={downloadResult} disabled={!resultUrl}>
            <Download size={17} /> Export
          </button>
        </div>
      </header>

      <section className="hero-copy">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> SKETCH → REALITY</div>
          <h1>Draw an idea.<br /><span>Watch it become real.</span></h1>
        </div>
        <p>Gambar dengan garis sederhana. AI membaca bentuk, komposisi, dan arah sketsa lalu membangun visual baru secara live.</p>
      </section>

      <div className="mobile-switch glass">
        <button className={mobileView === "draw" ? "active" : ""} onClick={() => setMobileView("draw")}><Brush size={16}/> Draw</button>
        <button className={mobileView === "result" ? "active" : ""} onClick={() => setMobileView("result")}><Zap size={16}/> AI Result</button>
      </div>

      <section className="workspace-shell">
        <aside className="toolbar glass">
          <button className={tool === "brush" ? "tool-btn active" : "tool-btn"} onClick={() => setTool("brush")} title="Brush"><Brush size={19}/><span>Brush</span></button>
          <button className={tool === "eraser" ? "tool-btn active" : "tool-btn"} onClick={() => setTool("eraser")} title="Eraser"><Eraser size={19}/><span>Eraser</span></button>
          <div className="tool-sep" />
          <button className="tool-btn" onClick={undo} disabled={!canUndo} title="Undo"><Undo2 size={19}/><span>Undo</span></button>
          <button className="tool-btn" onClick={redo} disabled={!canRedo} title="Redo"><Redo2 size={19}/><span>Redo</span></button>
          <button className="tool-btn danger" onClick={clear} title="Clear"><RotateCcw size={19}/><span>Clear</span></button>
        </aside>

        <div className="panels">
          <article className={`panel glass ${mobileView !== "draw" ? "mobile-hidden" : ""}`}>
            <div className="panel-head">
              <div><span className="panel-kicker">01</span><strong>Your canvas</strong></div>
              <button className="ghost-btn" onClick={downloadSketch}><Download size={15}/> Sketch</button>
            </div>

            <div className="canvas-frame">
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="draw-canvas"
                onPointerDown={startDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={endDrawing}
                onPointerCancel={endDrawing}
                onPointerLeave={(e) => { if (e.buttons) endDrawing(); }}
              />
              {!hasDrawing && (
                <div className="canvas-empty">
                  <div className="empty-icon"><Brush size={22}/></div>
                  <strong>Start drawing</strong>
                  <span>Coba gambar rumah, mobil, bunga, karakter, atau benda apa saja.</span>
                </div>
              )}
            </div>

            <div className="brush-control">
              <span>Stroke</span>
              <input type="range" min="2" max="28" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
              <b>{brushSize}px</b>
            </div>
          </article>

          <article className={`panel result-panel glass ${mobileView !== "result" ? "mobile-hidden" : ""}`}>
            <div className="panel-head">
              <div><span className="panel-kicker accent">02</span><strong>AI imagination</strong></div>
              <div className="frame-counter"><Zap size={13}/>{frameCount} frames</div>
            </div>

            <div className="result-frame">
              {resultUrl ? (
                <img src={resultUrl} alt="AI generated result" className="result-image" />
              ) : (
                <div className="result-empty">
                  <div className="orb"><Sparkles size={28}/></div>
                  <strong>Waiting for your first stroke</strong>
                  <span>Hasil AI akan muncul di sini dan ikut berubah saat sketsa berkembang.</span>
                </div>
              )}
              {status === "generating" && <div className="generating-badge"><span className="status-dot pulse"/> imagining</div>}
              {resultUrl && <button className="float-download" onClick={downloadResult}><Maximize2 size={16}/> Open result</button>}
            </div>
          </article>
        </div>

        <aside className="control-panel glass">
          <div className="control-title"><WandSparkles size={17}/><strong>Magic controls</strong></div>

          <label className="field-label">What are you imagining? <span>optional</span></label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A tiny modern house in a pine forest…"
            rows={3}
          />
          <div className="hint">Kosongkan agar AI menebak langsung dari sketsa.</div>

          <label className="field-label top-gap">Visual style</label>
          <div className="style-grid">
            {STYLES.map((style) => (
              <button key={style.id} className={styleId === style.id ? "style-chip active" : "style-chip"} onClick={() => setStyleId(style.id)}>
                {style.label}
              </button>
            ))}
          </div>

          <div className="control-block">
            <div className="control-row"><span>Consistency</span><b>{Math.round((1 - feedback) * 100)}%</b></div>
            <input type="range" min="0.86" max="1" step="0.01" value={feedback} onChange={(e) => setFeedback(Number(e.target.value))}/>
            <small>Lebih tinggi = perubahan lebih liar. Lebih rendah = hasil lebih stabil.</small>
          </div>

          <div className="control-block compact">
            <div className="control-row"><span>Inference quality</span><div className="segmented">
              {[2,3,4].map((v) => <button key={v} onClick={() => setSteps(v)} className={steps === v ? "active" : ""}>{v}</button>)}
            </div></div>
          </div>

          <label className="toggle-row">
            <div><strong>Smooth transitions</strong><span>Interpolasi antar frame AI</span></div>
            <input type="checkbox" checked={interpolation} onChange={(e) => setInterpolation(e.target.checked)}/>
            <i />
          </label>

          <button className="generate-btn" onClick={() => scheduleSend(true)} disabled={!hasDrawing}>
            <Zap size={18}/> Regenerate now
          </button>

          <div className="security-note">
            <div className="security-icon"><Sparkles size={15}/></div>
            <span><b>Secure realtime.</b> API key tetap di server; browser hanya menerima token berumur pendek.</span>
          </div>
        </aside>
      </section>

      <footer>
        <span>MagicDraw AI · Realtime visual playground</span>
        <span>Canvas input {CANVAS_SIZE}×{CANVAS_SIZE}</span>
      </footer>
    </main>
  );
}
