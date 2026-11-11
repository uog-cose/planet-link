import { useState, type CSSProperties } from "react";
import { avatarAsset } from "./QuestArt";

export function MilestoneAvatar({
  avatar = "alex",
  imageUrl,
  tier = "grey",
  color,
  size = "md",
  level = 1,
  showLevel = true,
}: {
  avatar?: string;
  imageUrl?: string | null;
  tier?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  level?: number;
  showLevel?: boolean;
}) {
  const name = avatar;
  const px = size === "sm" ? 44 : size === "lg" ? 82 : 64;
  const safeLevel = Math.max(1, Number(level) || 1);
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`milestone-avatar size-${size}`}
      title={showLevel ? `Level ${safeLevel}` : undefined}
    >
      <div
        className={`avatar-ring tier-${tier || "grey"}`}
        style={{ "--avatar-ring": color || "var(--accent)" } as CSSProperties}
      >
        <div className="avatar-shell">
          {failed ? (
            <img
              className="avatar-image"
              src="/quest-media/graphics/broken-image.svg"
              alt=""
              width={px}
              height={px}
            />
          ) : (
            <img
              className="avatar-image"
              src={imageUrl || avatarAsset(name)}
              alt=""
              width={px}
              height={px}
              loading="eager"
              onError={() => setFailed(true)}
            />
          )}
        </div>
        {showLevel && <span className="avatar-level">{safeLevel}</span>}
      </div>
    </div>
  );
}
