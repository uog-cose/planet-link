import { useState, type CSSProperties } from "react";

const ART: Record<string, string> = {
  explorer: "/quest-media/graphics/quest-explorer.svg",
  games: "/quest-media/graphics/memory.svg",
  visual: "/quest-media/graphics/visual.svg",
  sequence: "/quest-media/graphics/sequence.svg",
  drawing: "/quest-media/graphics/drawing.svg",
  community: "/quest-media/graphics/community.svg",
  map: "/quest-media/graphics/map-grid.svg",
  points: "/quest-media/graphics/qr-demo.svg",
  reaction: "/quest-media/graphics/reaction.svg",
  typing: "/quest-media/graphics/type.svg",
  streak: "/quest-media/graphics/streak-flame.svg",
};

const FALLBACK = ART.explorer;

export function QuestArt({
  kind = "explorer",
  alt = "",
  className = "",
  style,
}: {
  kind?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <img
      className={`quest-art-image ${className}`.trim()}
      src="/quest-media/graphics/broken-image.svg"
      alt={alt}
      loading="lazy"
      decoding="async"
      style={style}
    />
  ) : (
    <img
      className={`quest-art-image ${className}`.trim()}
      src={ART[kind] || FALLBACK}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}

export function avatarAsset(name?: string | null) {
  const key = String(name || "").toLowerCase();
  const byName: Record<string, string> = {
    alex: "male-01-alex.svg",
    ben: "male-02-ben.svg",
    charlie: "male-03-charlie.svg",
    daniel: "male-04-daniel.svg",
    ethan: "male-05-ethan.svg",
    finley: "male-06-finley.svg",
    george: "male-07-george.svg",
    henry: "male-08-henry.svg",
    jack: "male-09-jack.svg",
    logan: "male-10-logan.svg",
    ava: "female-01-ava.svg",
    bella: "female-02-bella.svg",
    chloe: "female-03-chloe.svg",
    daisy: "female-04-daisy.svg",
    ella: "female-05-ella.svg",
    freya: "female-06-freya.svg",
    grace: "female-07-grace.svg",
    holly: "female-08-holly.svg",
    isabella: "female-09-isabella.svg",
    sophie: "female-10-sophie.svg",
  };
  const legacy: Record<string, string> = {
    orbit: "alex",
    comet: "ava",
    rocket: "charlie",
    star: "grace",
    moon: "henry",
    wave: "sophie",
  };
  const resolved = byName[key] || byName[legacy[key] || ""] || byName.alex;
  return `/quest-media/avatars/${resolved}`;
}
