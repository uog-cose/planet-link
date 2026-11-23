import { STATIC_COLORS } from "../../theme/colors";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { t } from "../../i18n";
import { Card, Pill } from "../../components/ui";
import { celebrateAward } from "../../components/AwardCelebration";
import { Gift, X } from "lucide-react";
import { EmptyCard } from "../../components/EmptyCard";
interface Reward {
  id: number;
  name: string;
  description: string;
  start_at?: string | null;
  end_at?: string | null;
  awardCount: number;
}
function ScratchCard({
  reward,
  onClaim,
}: {
  reward: Reward;
  onClaim: (x: any) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const scratching = useRef(false);
  const claiming = useRef(false);
  const lastCheck = useRef(0);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 360;
    c.height = 190;
    ctx.fillStyle = STATIC_COLORS.scratch;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = STATIC_COLORS.scratchMark;
    for (let y = 18; y < 190; y += 26)
      for (let x = 18; x < 360; x += 36)
        (ctx.beginPath(), ctx.arc(x, y, 2, 0, Math.PI * 2), ctx.fill());
  }, []);
  const scratchAt = (e: React.PointerEvent) => {
    const c = ref.current;
    if (!c) return;
    e.preventDefault();
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (c.width / rect.width),
      y = (e.clientY - rect.top) * (c.height / rect.height);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const now = Date.now();
    if (now - lastCheck.current > 180) {
      lastCheck.current = now;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 40) transparent++;
      const p = Math.round((transparent / (data.length / 4)) * 100);
      setPct(p);
      if (p >= 48 && !claiming.current) {
        claiming.current = true;
        scratching.current = false;
        api<any>("/scratch/claim/", {
          method: "POST",
          body: JSON.stringify({ rewardId: reward.id }),
        })
          .then(onClaim)
          .catch(() => {
            claiming.current = false;
          });
      }
    }
  };
  const stopScratch = (e?: React.PointerEvent) => {
    e?.preventDefault();
    scratching.current = false;
  };
  return (
    <div className="scratch-shell">
      <div className="scratch-reward-under">
        <img
          src="/quest-media/themes/rewards/treasure-chest.png"
          alt=""
          aria-hidden="true"
        />
        <strong>Scratch to reveal</strong>
        <span>Your next surprise is inside</span>
      </div>
      <canvas
        ref={ref}
        className="scratch-canvas"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          scratching.current = true;
          scratchAt(e);
        }}
        onPointerMove={(e) => {
          if (scratching.current) scratchAt(e);
        }}
        onPointerUp={stopScratch}
        onPointerCancel={stopScratch}
        onLostPointerCapture={stopScratch}
      />
      <div
        className="scratch-progress"
        role="progressbar"
        aria-label="Scratch card revealed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <small className="scratch-progress-label">
        {pct < 48
          ? `${pct}% revealed · use broad strokes to scratch`
          : "Revealing your reward…"}
      </small>
    </div>
  );
}
export function Rewards({ liveTick = 0 }: { liveTick?: number }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [revealed, setRevealed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadRewards = () => {
    setLoading(true);
    setLoadError("");
    api<{ items: Reward[] }>("/rewards/")
      .then((x) => setRewards(x.items || []))
      .catch((e) => {
        setRewards([]);
        setLoadError(
          e instanceof Error
            ? e.message
            : "Rewards could not be loaded. Please try again.",
        );
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    loadRewards();
  }, [liveTick]);
  useEffect(() => {
    document.body.style.overflow = revealed ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [revealed]);
  useEffect(() => {
    if (!revealed) return;
    try {
      const a = new Audio("/sounds/achievement.wav");
      a.volume = 0.7;
      void a.play().catch(() => {});
    } catch {}
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRevealed(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [revealed]);
  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">{t("rewardVault").toUpperCase()}</span>
          <h3>{t("rewardVault")}</h3>
        </div>
        <Pill icon={Gift}>{rewards.length}</Pill>
      </div>
      <div className="reward-grid">
        {loading ? (
          <EmptyCard
            icon={Gift}
            title="Loading your rewards"
            body="Checking what you have unlocked…"
          />
        ) : loadError ? (
          <Card className="error-card">
            <div className="error-illustration" aria-hidden="true">
              <Gift size={42} />
            </div>
            <h3>We could not load your rewards</h3>
            <p className="muted">{loadError}</p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={loadRewards}
            >
              Try again
            </button>
          </Card>
        ) : rewards.length === 0 ? (
          <EmptyCard
            icon={Gift}
            title="Your reward vault is waiting"
            body="Earn XP and complete activities to unlock scratch-card rewards."
          />
        ) : (
          rewards.map((r) => (
            <Card className="reward-card" key={r.id}>
              <ScratchCard
                reward={r}
                onClaim={(x) => {
                  sessionStorage.setItem(
                    "yq_suppress_reward_celebration_until",
                    String(Date.now() + 6500),
                  );
                  if (x?.notificationId) {
                    const key = "yq_award_notifications_seen";
                    const seen = JSON.parse(
                      sessionStorage.getItem(key) || "[]",
                    ) as number[];
                    sessionStorage.setItem(
                      key,
                      JSON.stringify(
                        [...seen, Number(x.notificationId)].slice(-100),
                      ),
                    );
                  }
                  setRevealed(x);
                  setRewards((v) => v.filter((y) => y.id !== r.id));
                }}
              />
              <h3>{r.name}</h3>
              <p className="muted">{r.description}</p>
              <small className="muted">
                {r.awardCount} awards available ·{" "}
                {r.end_at
                  ? `valid until ${new Date(r.end_at).toLocaleString()}`
                  : "no end date"}
              </small>
            </Card>
          ))
        )}
      </div>
      {revealed &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-backdrop reward-reveal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Reward revealed"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target) setRevealed(null);
            }}
          >
            <div
              className="reward-modal reward-reveal-modal"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="reward-confetti" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as any} />
                ))}
              </div>
              <button
                className="icon-btn reward-modal-close"
                type="button"
                aria-label="Close reward"
                onClick={() => setRevealed(null)}
              >
                <X size={19} />
              </button>
              <div className="reward-burst reward-burst-video">
                <img
                  src="/quest-media/themes/rewards/trophy.png"
                  alt=""
                  aria-hidden="true"
                />
              </div>
              <span className="eyebrow">REWARD UNLOCKED</span>
              <h2>{t("rewardEarned")}</h2>
              <h3>{revealed.award}</h3>
              {revealed.amount > 0 && (
                <p className="reward-xp-pop">+{revealed.amount} XP</p>
              )}
              <p className="muted">
                Your prize has been recorded. A youth worker can fulfil physical
                or other prizes.
              </p>
              <button
                className="btn btn-primary reward-modal-action"
                onClick={() => setRevealed(null)}
              >
                {t("close")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
