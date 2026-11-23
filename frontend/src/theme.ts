import {
  THEME_PRESETS,
  STATIC_COLORS,
  type ThemeColorKey,
} from "./theme/colors";
export { THEME_PRESETS };
export type { ThemeColorKey } from "./theme/colors";
export type ThemeConfig = Record<string, string>;

const aliases: Record<string, string> = {
  background: "bg",
  bg: "bg",
  surface: "surface",
  surface2: "surface2",
  text: "text",
  muted: "muted",
  accent: "accent",
  accent2: "accent2",
  warm: "warm",
  danger: "danger",
  success: "success",
  warning: "warning",
  focus: "focus",
  button: "button",
  buttonText: "buttonText",
  header: "header",
  nav: "nav",
  card: "card",
  border: "border",
  donutXp: "donut-xp",
  donutMilestone: "donut-milestone",
  donutAchievement: "donut-achievement",
  donutTrack: "donut-track",
  tile1: "tile1",
  tile2: "tile2",
  tile3: "tile3",
  tile4: "tile4",
  tile5: "tile5",
  tile6: "tile6",
};
const isHex = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export function applyTheme(
  themeConfig?: Partial<ThemeConfig>,
  preset = "meadow",
) {
  const key: keyof typeof THEME_PRESETS = THEME_PRESETS[preset]
    ? preset
    : "meadow";
  const root = document.documentElement;
  const base: Record<ThemeColorKey, string> = { ...THEME_PRESETS[key].config };
  // Ignore legacy/unknown theme payloads (for example the old `neon` fallback).
  // Only a recognised preset may contribute custom colour overrides.
  const allowOverrides = Boolean(THEME_PRESETS[preset]);
  if (allowOverrides)
    (Object.entries(themeConfig || {}) as [ThemeColorKey, string][]).forEach(
      ([k, v]) => {
        if (isHex(v) && aliases[k]) base[k] = v;
      },
    );
  (Object.keys(base) as ThemeColorKey[]).forEach((k) => {
    const v = base[k];
    const css = aliases[k] || k;
    root.style.setProperty(`--${css}`, v);
  });
  const qMap: Record<string, string> = {
    bg: "q-paper",
    surface: "q-surface",
    surface2: "q-paper-2",
    text: "q-ink",
    muted: "q-muted",
    accent: "q-jade",
    accent2: "q-purple",
    warm: "q-yellow",
    danger: "q-red",
    success: "q-jade",
    warning: "q-orange",
    focus: "q-orange",
    button: "q-ink",
    buttonText: "q-surface",
    header: "q-paper",
    nav: "q-ink",
    card: "q-surface",
    border: "q-border",
    tile1: "q-mint",
    tile2: "q-tile2",
    tile3: "q-tile3",
    tile4: "q-tile4",
    tile5: "q-tile5",
    tile6: "q-surface",
  };
  (Object.entries(qMap) as [ThemeColorKey, string][]).forEach(
    ([source, target]) => {
      if (base[source]) root.style.setProperty(`--${target}`, base[source]);
    },
  );
  const themeBackgrounds: Record<string, string> = {
    space: "/quest-media/themes/backgrounds/space-background.jpg",
    cleaning: "/quest-media/themes/backgrounds/cleaning-background.jpg",
    music: "/quest-media/themes/backgrounds/music-background.jpg",
    arts: "/quest-media/themes/backgrounds/arts-background.jpg",
    games: "/quest-media/themes/backgrounds/games-background.jpg",
  };
  const backgroundImage =
    themeBackgrounds[key] || "/quest-media/graphics/youth-dashboard-bg.png";
  const bannerImage = themeBackgrounds[key]
    ? themeBackgrounds[key]
        .replace("/backgrounds/", "/banners/")
        .replace("-background.jpg", "-banner.jpg")
    : "";
  root.style.setProperty("--theme-bg-image", `url("${backgroundImage}")`);
  root.style.setProperty(
    "--theme-bg-opacity",
    ["space", "cleaning", "music", "arts", "games"].includes(String(key))
      ? ".30"
      : ".16",
  );
  root.style.setProperty(
    "--theme-banner-image",
    bannerImage ? `url("${bannerImage}")` : "none",
  );
  root.style.setProperty(
    "--theme-decoration-image",
    bannerImage
      ? `url("${bannerImage}")`
      : 'url("/quest-media/graphics/youth-dashboard-bg.png")',
  );
  root.style.setProperty(
    "--q-shadow",
    `0 16px 42px color-mix(in srgb, ${STATIC_COLORS.ink} 9%, transparent)`,
  );
  root.style.setProperty(
    "--q-shadow-lg",
    `0 28px 70px color-mix(in srgb, ${STATIC_COLORS.ink} 15%, transparent)`,
  );
  root.dataset.theme = key;
  try {
    localStorage.setItem("yq-active-theme", key);
  } catch {}
  window.dispatchEvent(
    new CustomEvent("yq-theme-applied", {
      detail: { theme: key, config: base, backgroundImage, bannerImage },
    }),
  );
}

export function getStoredThemeRotation() {
  try {
    return JSON.parse(localStorage.getItem("yq-theme-rotation") || "null");
  } catch {
    return null;
  }
}
export function setStoredThemeRotation(value: any) {
  try {
    localStorage.setItem("yq-theme-rotation", JSON.stringify(value));
  } catch {}
}
