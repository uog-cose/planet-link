import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trophy, X, TrendingDown } from "lucide-react";
import { Pill } from "./ui";
import { api } from "../api";

export type AwardDetail = {
  notificationId?: number;
  title?: string;
  body?: string;
  xp?: number;
  prize?: string;
  kind?:
    | "xp"
    | "penalty"
    | "game-score"
    | "reward"
    | "approval"
    | "approval-rejected"
    | "help";
  performance?: number;
  url?: string;
};
const HIGH_PHRASES = ["Amazing!", "Legendary!", "Awesome!", "Unreal!"];
const BOOST_PHRASES = [
  "Keep going!",
  "You’ve got this!",
  "Nice try!",
  "Next round!",
];
const VOICE_FILES: Record<string, string> = {
  "Amazing!": "/sounds/voice/amazing.wav",
  "Legendary!": "/sounds/voice/legendary.wav",
  "Awesome!": "/sounds/voice/awesome.wav",
  "Unreal!": "/sounds/voice/unreal.wav",
  "Keep going!": "/sounds/voice/keep-going.wav",
  "You’ve got this!": "/sounds/voice/youve-got-this.wav",
  "Nice try!": "/sounds/voice/nice-try.wav",
  "Next round!": "/sounds/voice/next-round.wav",
};
export function celebrateAward(detail: AwardDetail) {
  window.dispatchEvent(new CustomEvent("yq-award", { detail }));
}
let audioUnlocked = false;
let unlockAudioElement: HTMLAudioElement | null = null;
function unlockCelebrationAudio() {
  if (audioUnlocked || typeof window === "undefined") return;
  try {
    unlockAudioElement ||= new Audio("/sounds/achievement.wav");
    unlockAudioElement.preload = "auto";
    unlockAudioElement.volume = 0.001;
    const p = unlockAudioElement.play();
    if (p)
      void p
        .then(() => {
          audioUnlocked = true;
          unlockAudioElement?.pause();
          if (unlockAudioElement) unlockAudioElement.currentTime = 0;
        })
        .catch(() => {});
  } catch {}
}
function playSound(path: string, volume = 0.72) {
  try {
    const audio = new Audio(path);
    audio.preload = "auto";
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {}
}
function playMotivation(phrase: string) {
  const path = VOICE_FILES[phrase];
  if (path) playSound(path, 0.9);
}
export function AwardCelebration() {
  const [award, setAward] = useState<AwardDetail | null>(null);
  const [customSounds, setCustomSounds] = useState<Record<string, string[]>>(
    {},
  );
  const soundLoaded = useState(false);
  const setSoundLoaded = soundLoaded[1];
  const queue = useState<AwardDetail[]>([]);
  const queueRef = queue[0];
  const setQueue = queue[1];
  useEffect(() => {
    const unlock = () => unlockCelebrationAudio();
    const opts = { capture: true, passive: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
    };
  }, []);
  useEffect(() => {
    const seenKeys = new Set<string>();
    const handler = (e: Event) => {
      const d = (e as CustomEvent<AwardDetail>).detail || {};
      const key =
        d.notificationId != null ? `notification:${d.notificationId}` : null;
      if (key && seenKeys.has(key)) return;
      if (key) seenKeys.add(key);
      setQueue((q) => {
        if (key && q.some((x) => x.notificationId === d.notificationId))
          return q;
        return [...q, d];
      });
    };
    window.addEventListener("yq-award", handler);
    return () => {
      window.removeEventListener("yq-award", handler);
    };
  }, []);
  useEffect(() => {
    if (!award || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAward(null);
        setQueue((q) => q.slice(1));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [award]);
  useEffect(() => {
    if (award || !queueRef.length) return;
    const d = queueRef[0];
    let display = d;
    const performance =
      typeof d.performance === "number" ? d.performance : null;
    if (d.kind === "game-score" && performance !== null) {
      const phrase =
        performance > 85
          ? HIGH_PHRASES[Math.floor(Math.random() * HIGH_PHRASES.length)]
          : BOOST_PHRASES[Math.floor(Math.random() * BOOST_PHRASES.length)];
      display = { ...d, title: phrase };
    }
    setAward(display);
  }, [award, queueRef]);
  useEffect(() => {
    if (!award) return;
    let cancelled = false;
    const d = award;
    const performance =
      typeof d.performance === "number" ? d.performance : null;
    if (sessionStorage.getItem("yq_celebration_sound") !== "off") {
      if (d.kind === "penalty" || Number(d.xp || 0) < 0)
        playSound("/sounds/points-down.wav");
      else if (d.kind === "game-score" && performance !== null) {
        playSound(
          performance > 85
            ? "/sounds/high-score.wav"
            : "/sounds/achievement.wav",
          0.62,
        );
        const cat = performance > 85 ? "bravo" : "motivation";
        const list = [...(customSounds[cat] || [])];
        if (list.length)
          window.setTimeout(() => {
            if (!cancelled)
              playSound(list[Math.floor(Math.random() * list.length)], 0.9);
          }, 260);
        else if (performance <= 85)
          window.setTimeout(() => {
            if (!cancelled) playMotivation(d.title || "");
          }, 260);
      } else if (["xp", "reward", "approval"].includes(String(d.kind)))
        playSound("/sounds/achievement.wav");
    }
    return () => {
      cancelled = true;
    };
  }, [award]);
  useEffect(() => {
    if (soundLoaded[0]) return;
    api<any>("/notifications/sounds/")
      .then((r) => {
        const grouped: Record<string, string[]> = {};
        (r.items || []).forEach((x: any) => {
          (grouped[x.category] ||= []).push(x.url);
        });
        setCustomSounds(grouped);
        setSoundLoaded(true);
      })
      .catch(() => setSoundLoaded(true));
  }, [soundLoaded[0]]);
  useEffect(() => {
    if (!award) return;
    const id = window.setTimeout(() => {
      setAward(null);
      setQueue((q) => q.slice(1));
    }, 3800);
    return () => window.clearTimeout(id);
  }, [award]);
  if (!award || typeof document === "undefined") return null;
  const negative =
    award.kind === "penalty" ||
    award.kind === "approval-rejected" ||
    Number(award.xp || 0) < 0;
  return createPortal(
    <div
      className="award-overlay"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) {
          setAward(null);
          setQueue((q) => q.slice(1));
        }
      }}
    >
      <div
        onClick={() => {
          if (award.url) window.location.assign(award.url);
        }}
        className={`award-celebration ${negative ? "award-negative" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-label="Achievement notification"
      >
        <div className="award-burst">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ "--i": i } as any} />
          ))}
        </div>
        <button
          className="icon-btn award-close"
          onClick={(e) => {
            e.stopPropagation();
            setAward(null);
            setQueue((q) => q.slice(1));
          }}
          aria-label="Close celebration"
        >
          <X size={18} />
        </button>
        <div className="award-icon">
          {negative ? (
            <TrendingDown size={30} />
          ) : (
            <img
              src="/quest-media/themes/rewards/trophy.png"
              alt=""
              aria-hidden="true"
            />
          )}
        </div>
        <span className="eyebrow">
          {award.kind === "approval-rejected"
            ? "REQUEST DECLINED"
            : negative
              ? "POINTS UPDATE"
              : award.kind === "reward"
                ? "REWARD UNLOCKED"
                : award.kind === "game-score"
                  ? "GAME SCORE"
                  : "NICE ONE!"}
        </span>
        <h2>{award.title || "You earned a reward"}</h2>
        {award.xp != null && (
          <strong className="award-xp">
            {Number(award.xp) > 0 ? "+" : ""}
            {Number(award.xp).toLocaleString()} XP
          </strong>
        )}
        {award.prize && <p>{award.prize}</p>}
        {award.body && (
          <p className="muted">
            {award.kind === "approval" || award.kind === "approval-rejected"
              ? String(award.body).replace(
                  /^[+-]?[\d,]+\s*XP\s*(?:for\s+[^.]+?\s+)?(?:was\s+)?/i,
                  "",
                )
              : award.body}
          </p>
        )}
        {award.performance != null && (
          <Pill>{Math.round(Number(award.performance))}% performance</Pill>
        )}
        <Trophy className="award-sparkle" size={22} />
      </div>
    </div>,
    document.body,
  );
}
