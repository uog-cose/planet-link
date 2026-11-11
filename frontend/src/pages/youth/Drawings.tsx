import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { flushOfflineQueue, queueWrite } from "../../offlineQueue";
import { Button, Card, Pill } from "../../components/ui";
import { EmptyCard } from "../../components/EmptyCard";
import {
  Pencil,
  Send,
  RotateCcw,
  Trophy,
  Target,
  Dot,
  CheckCircle2,
} from "lucide-react";
import { celebrateAward } from "../../components/AwardCelebration";
type Game = {
  id: number;
  title: string;
  description: string;
  shape: string;
  scoreRanges: any[];
  startAt: string | null;
  endAt: string | null;
  retries: number;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  status: string;
};
type Point = [number, number];
export function Drawings({ liveTick = 0 }: { liveTick?: number }) {
  const [searchParams] = useSearchParams();
  const requestedAssignmentId = searchParams.get("assignmentId");
  const [game, setGame] = useState<Game | null>(null);
  const [stage, setStage] = useState<"intro" | "play" | "result">("intro");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef<Point[] | null>(null);
  const load = () =>
    api<any>("/challenges/")
      .then((x) => {
        const items = Array.isArray(x.items) ? x.items : [];
        const selected = requestedAssignmentId
          ? items.find(
              (g: any) =>
                String(g.assignmentId) === String(requestedAssignmentId) &&
                g.kind === "drawing",
            )
          : items.find((g: any) => g.kind === "drawing" && g.status === "live");
        setGame(selected || null);
      })
      .catch(() => setGame(null));
  useEffect(() => {
    load();
  }, [liveTick, requestedAssignmentId]);
  const guideDots = (shape: string) => {
    const common = [
      ["18%", "22%"],
      ["34%", "12%"],
      ["50%", "9%"],
      ["66%", "12%"],
      ["82%", "22%"],
      ["89%", "50%"],
      ["82%", "78%"],
      ["66%", "88%"],
      ["50%", "91%"],
      ["34%", "88%"],
      ["18%", "78%"],
      ["11%", "50%"],
    ];
    if (shape.toLowerCase().includes("triangle"))
      return [
        ["50%", "8%"],
        ["24%", "82%"],
        ["76%", "82%"],
        ["50%", "8%"],
      ];
    if (
      shape.toLowerCase().includes("square") ||
      shape.toLowerCase().includes("rectangle")
    )
      return [
        ["24%", "20%"],
        ["50%", "20%"],
        ["76%", "20%"],
        ["76%", "50%"],
        ["76%", "80%"],
        ["50%", "80%"],
        ["24%", "80%"],
        ["24%", "50%"],
      ];
    if (shape.toLowerCase().includes("pentagon"))
      return [
        ["50%", "8%"],
        ["82%", "34%"],
        ["68%", "82%"],
        ["32%", "82%"],
        ["18%", "34%"],
        ["50%", "8%"],
      ];
    if (shape.toLowerCase().includes("hexagon"))
      return [
        ["30%", "12%"],
        ["70%", "12%"],
        ["88%", "50%"],
        ["70%", "88%"],
        ["30%", "88%"],
        ["12%", "50%"],
        ["30%", "12%"],
      ];
    return common;
  };
  useEffect(() => {
    if (stage !== "play") return;
    const c = canvasRef.current;
    if (!c) return;
    const frame = frameRef.current;
    if (!frame) return;
    const ctx = c.getContext("2d")!;
    const resize = () => {
      const rect = frame.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(320, Math.floor(rect.width * dpr));
      c.height = Math.max(260, Math.floor(rect.height * dpr));
      c.style.width = "100%";
      c.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "var(--accent)";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(frame);
    const pos = (e: PointerEvent): Point => {
      const r = c.getBoundingClientRect();
      return [
        ((e.clientX - r.left) / r.width) * 1000,
        ((e.clientY - r.top) / r.height) * 800,
      ];
    };
    const drawPos = (p: Point): Point => {
      const r = c.getBoundingClientRect();
      return [(p[0] / 1000) * r.width, (p[1] / 800) * r.height];
    };
    const start = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      active.current = [p];
      const dp = drawPos(p);
      ctx.beginPath();
      ctx.moveTo(dp[0], dp[1]);
    };
    const move = (e: PointerEvent) => {
      if (!active.current) return;
      const p = pos(e);
      active.current.push(p);
      const dp = drawPos(p);
      ctx.lineTo(dp[0], dp[1]);
      ctx.stroke();
      requestPreview([...strokes.current, active.current!]);
    };
    const end = () => {
      if (active.current && active.current.length > 1) {
        strokes.current.push(active.current);
        requestPreview();
      }
      active.current = null;
    };
    c.addEventListener("pointerdown", start);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    return () => {
      ro.disconnect();
      c.removeEventListener("pointerdown", start);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", end);
      c.removeEventListener("pointercancel", end);
    };
  }, [stage]);
  const previewTimer = useRef<number | undefined>(undefined);
  const requestPreview = (previewStrokes: Point[][] = strokes.current) => {
    if (!game || previewStrokes.flat().length < 8) return;
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(async () => {
      try {
        const r = await api<any>("/drawings/submit/", {
          method: "POST",
          body: JSON.stringify({
            gameId: game.id,
            strokes: previewStrokes,
            preview: true,
          }),
        });
        setPreview(r);
      } catch {}
    }, 450);
  };
  const clear = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    strokes.current = [];
    setPreview(null);
  };
  const send = async () => {
    if (!game) return;
    const request = {
      gameId: game.id,
      strokes: strokes.current,
      preview: false,
    };
    const idempotencyKey = crypto.randomUUID();
    setBusy(true);
    try {
      const r = await api<any>(
        "/drawings/submit/",
        { method: "POST", body: JSON.stringify(request) },
        false,
        idempotencyKey,
      );
      setResult(r);
      setStage("result");
      celebrateAward({
        title: `+${r.awardedXp || r.xp || 0} XP earned`,
        body: "Your drawing has been scored and saved. Another round is available while attempts remain.",
        kind: "game-score",
        performance: Number(r.accuracy || 0),
        xp: Number(r.awardedXp || r.xp || 0),
      });
      load();
    } catch (e) {
      if (
        !navigator.onLine ||
        !(e as any)?.status ||
        Number((e as any).status) >= 500
      ) {
        await queueWrite("/drawings/submit/", request, idempotencyKey);
        setResult({ queued: true });
        setStage("result");
      } else setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const on = () => {
      void flushOfflineQueue();
    };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
  if (!game)
    return (
      <EmptyCard
        icon={Target}
        title="No game is ready yet"
        body="Your next drawing activity will appear here when it is available."
      />
    );
  if (stage === "intro")
    return (
      <Card className="game-intro">
        <div className={`shape-display shape-${game.shape}`}></div>
        <div className="game-intro-copy">
          <span className="eyebrow">READY TO PLAY</span>
          <h2>{game.title}</h2>
          <p>{game.description}</p>
          <div className="upcoming-meta">
            <Pill>{game.shape}</Pill>
            <Pill>{game.attemptsRemaining ?? game.retries} rounds left</Pill>
            {game.endAt && (
              <small>Valid until {new Date(game.endAt).toLocaleString()}</small>
            )}
          </div>
        </div>
        <Button
          className="start-drawing-btn"
          icon={Pencil}
          disabled={Number(game.attemptsRemaining || 0) <= 0}
          onClick={() => setStage("play")}
        >
          {Number(game.attemptsRemaining || 0) <= 0
            ? "No rounds remaining"
            : "Start drawing"}
        </Button>
      </Card>
    );
  if (stage === "result")
    return (
      <Card className="game-result">
        {result?.queued ? (
          <>
            <CheckCircle2 size={42} />
            <span className="eyebrow">SAVED OFFLINE</span>
            <h2>Your drawing is safely saved</h2>
            <p>
              Your result will be submitted automatically when you reconnect.
              You can close Youth Quest and come back later.
            </p>
            <Button
              icon={RotateCcw}
              onClick={() => {
                clear();
                setResult(null);
                setStage("play");
                load();
              }}
            >
              Keep playing
            </Button>
          </>
        ) : result?.error ? (
          <>
            <h3>Try again</h3>
            <p>{result.error}</p>
          </>
        ) : (
          <>
            <Trophy size={42} />
            <span className="eyebrow">RESULT</span>
            <h2>
              {result.finalAttempt
                ? `+${result.awardedXp || 0} XP awarded`
                : `${result.attemptXp || 0} XP on this attempt`}
            </h2>
            <p>{result.accuracy}% shape match</p>
            {!result.finalAttempt && (
              <p className="muted">
                This attempt is recorded. Your{" "}
                {result.scoringPolicy === "best" ? "best" : "last"} attempt will
                determine the final XP when all retries are used.
              </p>
            )}
            <Pill>
              {Number(result.attemptsRemaining || 0) > 0
                ? `${result.attemptsRemaining} rounds left`
                : "No rounds remaining"}
            </Pill>
            {Number(result.attemptsRemaining || 0) > 0 && (
              <Button
                icon={RotateCcw}
                onClick={() => {
                  clear();
                  setResult(null);
                  setStage("play");
                  load();
                }}
              >
                Try again
              </Button>
            )}
          </>
        )}
      </Card>
    );
  return (
    <Card className="drawing-game">
      <div className="section-head">
        <div>
          <span className="eyebrow">DRAW</span>
          <h3>{game.title}</h3>
          <p className="muted">
            Follow the reference points and trace the shape. Take your time,
            then submit when you're happy.
          </p>
        </div>
        <div className="drawing-live-score">
          <Pill>{game.shape}</Pill>
          {preview && !preview.error && (
            <strong>{preview.accuracy}% match</strong>
          )}
        </div>
      </div>
      <div className="canvas-target drawing-stage" ref={frameRef}>
        <canvas ref={canvasRef} />
        <div className={`target-outline shape-${game.shape}`}></div>
        <div className="reference-dots" aria-hidden="true">
          {guideDots(game.shape).map(([x, y], i) => (
            <span key={i} style={{ left: x, top: y }}>
              <Dot size={13} />
            </span>
          ))}
        </div>
      </div>
      <div className="drawing-live-meter" aria-live="polite">
        {preview?.error
          ? ""
          : preview
            ? `Live score: ${preview.accuracy}% · ${preview.xp} XP on this attempt`
            : "Start at a reference dot and trace the guide."}
      </div>
      <div className="top-actions">
        <Button variant="secondary" icon={RotateCcw} onClick={clear}>
          Clear
        </Button>
        <Button icon={Send} disabled={busy} onClick={send}>
          {busy ? "Scoring…" : "Submit drawing"}
        </Button>
      </div>
    </Card>
  );
}
