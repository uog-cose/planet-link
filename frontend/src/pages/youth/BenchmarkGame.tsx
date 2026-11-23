import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { flushOfflineQueue, queueWrite } from "../../offlineQueue";
import { Button, Card, Pill } from "../../components/ui";
import { celebrateAward } from "../../components/AwardCelebration";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Gamepad2,
  RotateCcw,
  Send,
} from "lucide-react";
import { generateUUID } from "../../utils/uuid";

type Game = {
  id: number;
  title: string;
  description: string;
  kind: string;
  gameType: string | null;
  assignmentId: number;
  scoreRanges: any[];
  startAt: string | null;
  endAt: string | null;
  attemptsRemaining: number | null;
  retries: number;
  status: string;
  scoringPolicy?: "best" | "last";
};
function useCountdown(until: string | null) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      if (!until) {
        setLeft("");
        return;
      }
      const ms = Math.max(0, new Date(until).getTime() - Date.now());
      const s = Math.ceil(ms / 1000);
      setLeft(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [until]);
  return left;
}

export function BenchmarkGame() {
  const { assignmentId } = useParams();
  const nav = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<any>("/challenges/")
      .then((x) =>
        setGame(
          (x.items || []).find(
            (g: any) => String(g.assignmentId) === String(assignmentId),
          ) || null,
        ),
      )
      .catch((e) => setError(e.message));
  }, [assignmentId]);
  const refreshGame = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const x = await api<any>("/challenges/");
      const latest = (x.items || []).find(
        (g: any) => String(g.assignmentId) === String(assignmentId),
      );
      if (latest) setGame(latest);
    } catch {}
  }, [assignmentId]);
  const start = async () => {
    if (!game) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api<any>("/games/start/", {
        method: "POST",
        body: JSON.stringify({
          gameId: game.id,
          assignmentId: game.assignmentId,
        }),
      });
      setAttempt({ ...r, startedAt: Date.now() });
      setGame((g) =>
        g
          ? {
              ...g,
              attemptsRemaining: Number(
                r.attemptsRemaining ?? g.attemptsRemaining ?? 0,
              ),
              status: "live",
            }
          : g,
      );
    } catch (e) {
      setError((e as Error).message);
      void refreshGame();
    } finally {
      setBusy(false);
    }
  };
  const finishResult = useCallback((r: any) => {
    sessionStorage.setItem(
      "yq_suppress_reward_celebration_until",
      String(Date.now() + 7000),
    );
    celebrateAward({
      title: r.finalAttempt
        ? `+${r.xp || 0} XP awarded`
        : `${r.attemptXp || 0} XP earned this attempt`,
      body: r.finalAttempt
        ? "Great work — your game result has been recorded."
        : "This attempt has been recorded.",
      kind: "game-score",
      performance: Number(r.performance || 0),
      xp: Number(r.finalAttempt ? r.xp || 0 : r.attemptXp || 0),
    });
    setResult(r);
    setAttempt(null);
    setGame((g) =>
      g
        ? {
            ...g,
            attemptsRemaining: Number(
              r.attemptsRemaining ??
                Math.max(0, (g.attemptsRemaining ?? 0) - 1),
            ),
            scoringPolicy: r.scoringPolicy || g.scoringPolicy,
          }
        : g,
    );
  }, []);
  const retryPending = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await flushOfflineQueue();
    if (r.sent > 0) setError("");
    else if (r.pending > 0)
      setError(
        "Your completed game is safely saved on this device and will submit automatically when the connection returns.",
      );
  }, []);
  useEffect(() => {
    const on = () => {
      void retryPending();
    };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [retryPending]);
  const submit = async (payload: any) => {
    if (!attempt) return;
    const request = {
      attemptId: attempt.attemptId,
      result: payload,
      durationMs: Date.now() - attempt.startedAt,
    };
    const idempotencyKey = generateUUID();
    setBusy(true);
    setError("");
    try {
      const r = await api<any>(
        "/games/submit/",
        { method: "POST", body: JSON.stringify(request) },
        false,
        idempotencyKey,
      );
      finishResult(r);
    } catch (e) {
      if (
        !navigator.onLine ||
        !(e as any)?.status ||
        Number((e as any).status) >= 500
      ) {
        await queueWrite("/games/submit/", request, idempotencyKey);
        setError(
          "Your completed game is safely saved on this device and will submit automatically when the connection returns. You can close Youth Quest and come back later.",
        );
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void retryPending();
  }, [retryPending]);
  if (!game)
    return (
      <div className="page">
        <Card>
          <p>{error || "Game not found."}</p>
          <Button icon={ArrowLeft} onClick={() => nav("/games")}>
            Back to games
          </Button>
        </Card>
      </div>
    );
  if (game.kind === "reaction")
    return (
      <Reaction
        game={game}
        attempt={attempt}
        result={result}
        error={error}
        busy={busy}
        start={start}
        submit={submit}
        back={() => nav("/games")}
      />
    );
  if (game.kind === "sequence")
    return (
      <Sequence
        game={game}
        attempt={attempt}
        result={result}
        error={error}
        busy={busy}
        start={start}
        submit={submit}
        back={() => nav("/games")}
      />
    );
  if (game.kind === "number_memory")
    return (
      <NumberMemory
        game={game}
        attempt={attempt}
        result={result}
        error={error}
        busy={busy}
        start={start}
        submit={submit}
        back={() => nav("/games")}
      />
    );
  if (game.kind === "visual_memory")
    return (
      <VisualMemory
        game={game}
        attempt={attempt}
        result={result}
        error={error}
        busy={busy}
        start={start}
        submit={submit}
        back={() => nav("/games")}
      />
    );
  if (game.kind === "typing")
    return (
      <Typing
        game={game}
        attempt={attempt}
        result={result}
        error={error}
        busy={busy}
        start={start}
        submit={submit}
        back={() => nav("/games")}
      />
    );
  return (
    <div className="page">
      <Card>
        <h2>This game is not playable yet</h2>
        <p>{game.description}</p>
        <Button icon={ArrowLeft} onClick={() => nav("/games")}>
          Back to games
        </Button>
      </Card>
    </div>
  );
}

type Props = {
  game: Game;
  attempt: any;
  result: any;
  error: string;
  busy: boolean;
  start: () => void;
  submit: (x: any) => void;
  back: () => void;
};
function Frame({
  game,
  attempt,
  result,
  error,
  busy,
  start,
  submit,
  back,
  children,
}: {
  game: Game;
  attempt: any;
  result: any;
  error: string;
  busy: boolean;
  start: () => void;
  submit: (x: any) => void;
  back: () => void;
  children: any;
}) {
  const startsIn = useCountdown(game.startAt);
  const isUpcoming = game.status === "upcoming";
  return (
    <div className="page benchmark-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GAME</span>
          <h2>{game.title}</h2>
          <p>{game.description}</p>
        </div>
        <Gamepad2 size={34} />
      </div>
      {error && (
        <Card className="error-card">
          <strong>{error}</strong>
        </Card>
      )}
      {result ? (
        <Card className="game-result benchmark-result">
          <CheckCircle2 size={42} />
          <span className="eyebrow">RESULT</span>
          <h2>
            {result.finalAttempt
              ? `+${result.xp || 0} XP awarded`
              : `${result.attemptXp || 0} XP earned this attempt`}
          </h2>
          <p>
            {result.score} {result.scoreUnit}
            {game.kind === "drawing"
              ? " · " +
                Math.round(Number(result.performance || 0)) +
                "% accuracy"
              : ""}
            {result.finalAttempt &&
            result.scoringPolicy === "best" &&
            result.selectedPerformance != null &&
            Number(result.selectedPerformance) !== Number(result.performance)
              ? ` · best attempt selected`
              : ""}
          </p>
          {!result.finalAttempt && (
            <p className="muted">
              This result is recorded immediately. You can continue while rounds
              remain.
            </p>
          )}
          <Pill>
            {Number(result.attemptsRemaining || 0) > 0
              ? `${result.attemptsRemaining} rounds left`
              : "No rounds remaining"}
          </Pill>
          {Number(result.attemptsRemaining || 0) > 0 && (
            <Button icon={RotateCcw} onClick={start}>
              Play again
            </Button>
          )}
          <Button variant="secondary" icon={ArrowLeft} onClick={back}>
            Back to games
          </Button>
        </Card>
      ) : (
        <Card className="benchmark-card">
          {!attempt ? (
            <>
              <div className="benchmark-intro">
                <Clock3 size={24} />
                <Pill>
                  {isUpcoming
                    ? "Coming up"
                    : `${Number(game.attemptsRemaining ?? 0)} rounds left`}
                </Pill>
                {isUpcoming && startsIn && <Pill>Starts in {startsIn}</Pill>}
              </div>
              <>
                <h3>{isUpcoming ? "Your game is queued" : "Ready?"}</h3>
                <p>
                  {isUpcoming
                    ? "This challenge will unlock automatically when its start time arrives. You can come back here or find it in Games."
                    : "Start when you're ready, then submit as soon as you feel you've finished. You can continue while rounds remain."}
                </p>
                <Button
                  icon={Send}
                  disabled={
                    busy ||
                    isUpcoming ||
                    Number(game.attemptsRemaining || 0) <= 0
                  }
                  onClick={start}
                >
                  {isUpcoming
                    ? "Not started yet"
                    : Number(game.attemptsRemaining || 0) <= 0
                      ? "No rounds remaining"
                      : "Start game"}
                </Button>
              </>
            </>
          ) : (
            children
          )}
        </Card>
      )}
    </div>
  );
}

function Reaction(p: Props) {
  const [phase, setPhase] = useState<"wait" | "go">("wait");
  const started = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!p.attempt) return;
    setPhase("wait");
    const delay = 900 + Math.floor(Math.random() * 1700);
    timer.current = window.setTimeout(() => {
      started.current = performance.now();
      setPhase("go");
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [p.attempt?.attemptId]);
  return (
    <Frame {...p}>
      <button
        type="button"
        className={`reaction-game ${phase === "go" ? "is-go" : ""}`}
        onClick={() => {
          if (phase !== "go") return;
          p.submit({
            milliseconds: Math.round(performance.now() - started.current),
          });
          setPhase("wait");
        }}
        aria-label={phase === "go" ? "Tap now" : "Wait for the colour change"}
      >
        <span className="reaction-orbit">
          {phase === "go" ? "TAP!" : "WAIT"}
        </span>
        <strong>
          {phase === "go" ? "Tap now" : "Wait for the colour change"}
        </strong>
        <small>
          {phase === "go"
            ? "React as quickly as you can."
            : "The board will change colour when it is time."}
        </small>
      </button>
    </Frame>
  );
}
function Sequence(p: Props) {
  const [phase, setPhase] = useState<"show" | "input">("show");
  const [index, setIndex] = useState(-1);
  const [answer, setAnswer] = useState<number[]>([]);
  const [pressed, setPressed] = useState<number | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!p.attempt) return;
    setPhase("show");
    setIndex(-1);
    setAnswer([]);
    setPressed(null);
  }, [p.attempt?.attemptId]);
  useEffect(() => {
    if (!p.attempt || phase !== "show") return;
    const seq = p.attempt?.challenge?.sequence as number[] | undefined;
    if (!seq?.length) return;
    let step = 0;
    setIndex(seq.length ? seq[0] : -1);
    const id = window.setInterval(() => {
      step += 1;
      if (step >= seq.length) {
        window.clearInterval(id);
        window.setTimeout(() => setPhase("input"), 500);
        return;
      }
      setIndex(seq[step]);
    }, 700);
    return () => window.clearInterval(id);
  }, [p.attempt?.attemptId, phase]);
  useEffect(
    () => () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
    },
    [],
  );
  const seq = p.attempt?.challenge?.sequence || [];
  const cells = Array.from({ length: 16 }, (_, i) => i);
  return (
    <Frame {...p}>
      <div className="memory-game">
        {phase === "show" ? (
          <>
            <p>Watch the sequence</p>
            <div className="sequence-grid sequence-grid-4x4">
              {cells.map((n) => (
                <div
                  key={n}
                  className={`sequence-tile ${index === n ? "lit" : ""}`}
                ></div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>Repeat the sequence</p>
            <p className="memory-progress">
              Step {Math.min(answer.length + 1, seq.length)} of {seq.length}
            </p>
            <div className="sequence-grid sequence-grid-4x4">
              {cells.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={p.busy || answer.includes(n)}
                  className={`sequence-tile ${pressed === n ? "pressed" : ""} ${answer.includes(n) ? "selected" : ""}`}
                  aria-label={`Choose tile ${n + 1}`}
                  onClick={() => {
                    if (answer.includes(n) || p.busy) return;
                    const next = [...answer, n];
                    setPressed(n);
                    if (pressTimer.current)
                      window.clearTimeout(pressTimer.current);
                    pressTimer.current = window.setTimeout(
                      () => setPressed(null),
                      220,
                    );
                    setAnswer(next);
                    if (next.length === seq.length)
                      p.submit({ sequence: next });
                  }}
                ></button>
              ))}
            </div>
            <p className="memory-hint">
              Tap a tile once. Every tap lights up so you know it registered.
            </p>
          </>
        )}
      </div>
    </Frame>
  );
}
function NumberMemory(p: Props) {
  const [visible, setVisible] = useState(true);
  const [answer, setAnswer] = useState("");
  const [digitIndex, setDigitIndex] = useState(0);
  const number = String(p.attempt?.challenge?.number ?? "");
  useEffect(() => {
    if (!p.attempt) return;
    setVisible(true);
    setAnswer("");
    setDigitIndex(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      if (i >= number.length) {
        window.clearInterval(id);
        window.setTimeout(() => setVisible(false), 550);
        return;
      }
      setDigitIndex(i);
    }, 520);
    return () => window.clearInterval(id);
  }, [p.attempt?.attemptId, number]);
  return (
    <Frame {...p}>
      {visible ? (
        <div className="number-memory-stage">
          <span className="eyebrow">REMEMBER</span>
          <div className="number-memory-pop">{number[digitIndex] || "•"}</div>
          <p>One digit at a time. Keep the whole number in your head.</p>
          <div className="number-memory-progress">
            {number.split("").map((_, i) => (
              <i key={i} className={i <= digitIndex ? "seen" : ""} />
            ))}
          </div>
        </div>
      ) : (
        <form
          className="game-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!p.attempt || !answer) return;
            p.submit({ number: answer });
          }}
        >
          <label>
            What was the number?
            <input
              autoFocus
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <Button type="submit" disabled={p.busy || !answer}>
            Submit
          </Button>
        </form>
      )}
    </Frame>
  );
}
function VisualMemory(p: Props) {
  const size = Number(p.attempt?.challenge?.gridSize || 4);
  const targets = new Set<number>(p.attempt?.challenge?.targets || []);
  const [show, setShow] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    if (!p.attempt) return;
    setShow(true);
    setSelected([]);
    const id = window.setTimeout(() => setShow(false), 2200);
    return () => window.clearTimeout(id);
  }, [p.attempt?.attemptId]);
  return (
    <Frame {...p}>
      {
        <div>
          <p>
            {show
              ? "Watch the pattern."
              : "Tap every square you remember, then submit whenever you feel ready."}
          </p>
          <div
            className="visual-grid"
            style={{ gridTemplateColumns: `repeat(${size},1fr)` }}
          >
            {Array.from({ length: size * size }, (_, i) => {
              const active = show ? targets.has(i) : selected.includes(i);
              return (
                <button
                  type="button"
                  key={i}
                  className={`visual-cell ${active ? "active" : ""}`}
                  disabled={show}
                  onClick={() =>
                    setSelected((v) =>
                      v.includes(i) ? v.filter((x) => x !== i) : [...v, i],
                    )
                  }
                ></button>
              );
            })}
          </div>
          {!show && (
            <Button
              icon={Send}
              disabled={p.busy}
              onClick={() => p.submit({ selected })}
            >
              Submit
            </Button>
          )}
        </div>
      }
    </Frame>
  );
}
function Typing(p: Props) {
  const [text, setText] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const left = useCountdown(p.game.endAt);
  useEffect(() => {
    if (!p.attempt) {
      setText("");
      setStarted(null);
      return;
    }
    setText("");
    setStarted(null);
    setNow(Date.now());
  }, [p.attempt?.attemptId]);
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [started]);
  const challenge = String(p.attempt?.challenge?.text || "");
  const elapsed = Math.max(0, now - (started || now));
  const chars = Math.min(text.length, challenge.length);
  const correct = Array.from(
    { length: chars },
    (_, i) => text[i] === challenge[i],
  ).filter(Boolean).length;
  const accuracy = chars ? Math.round((correct / chars) * 100) : 100;
  const wpm = elapsed > 0 ? Math.round(correct / 5 / (elapsed / 60000)) : 0;
  return (
    <Frame {...p}>
      {
        <form
          className="game-form typing-master"
          onSubmit={(e) => {
            e.preventDefault();
            if (started) p.submit({ text, durationMs: Date.now() - started });
          }}
        >
          <div className="typing-metrics">
            <div>
              <strong>{wpm}</strong>
              <span>WPM</span>
            </div>
            <div>
              <strong>{accuracy}%</strong>
              <span>Accuracy</span>
            </div>
            <div>
              <strong>
                {Math.round((chars / Math.max(1, challenge.length)) * 100)}%
              </strong>
              <span>Progress</span>
            </div>
            {left && (
              <div>
                <strong>{left}</strong>
                <span>Time left</span>
              </div>
            )}
          </div>
          <div className="typing-window">
            <div className="typing-passage" aria-label="Typing passage">
              {Array.from(challenge).map((char, i) => {
                const typed = text[i];
                const state =
                  typed == null
                    ? i === text.length
                      ? "current"
                      : "pending"
                    : typed === char
                      ? "correct"
                      : "incorrect";
                return (
                  <span key={i} className={`typing-char ${state}`}>
                    {char === " " ? " " : char}
                  </span>
                );
              })}
            </div>
          </div>
          <label className="typing-input-label">
            Type here
            <textarea
              autoFocus
              value={text}
              onFocus={() => {
                if (!started) setStarted(Date.now());
              }}
              onPaste={(e) => e.preventDefault()}
              onChange={(e) =>
                setText(e.target.value.slice(0, challenge.length))
              }
              spellCheck={false}
            />
          </label>
          <div className="upcoming-meta">
            <Pill>Type exactly as shown</Pill>
            <Pill>Finish when the passage is complete</Pill>
          </div>
          <Button
            icon={Send}
            type="submit"
            disabled={p.busy || text.length === 0 || !started}
          >
            Finish
          </Button>
        </form>
      }
    </Frame>
  );
}
