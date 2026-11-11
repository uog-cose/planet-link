import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Button, Card } from "../../components/ui";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  Palette,
  Save,
  Check,
  Clock3,
  RotateCcw,
  Trash2,
  BookmarkPlus,
  Play,
} from "lucide-react";
import {
  applyTheme,
  THEME_PRESETS,
  setStoredThemeRotation,
  type ThemeColorKey,
} from "../../theme";
import { useToast } from "../../components/ToastProvider";

const COLOR_GROUPS: [string, [ThemeColorKey, string][]][] = [
  [
    "Core",
    [
      ["background", "Page background"],
      ["header", "Header / topbar"],
      ["nav", "Navigation"],
      ["card", "Cards"],
      ["surface", "Surface"],
      ["surface2", "Secondary surface"],
      ["text", "Text"],
      ["muted", "Muted text"],
      ["border", "Borders"],
    ],
  ],
  [
    "Actions",
    [
      ["accent", "Primary accent"],
      ["accent2", "Secondary accent"],
      ["button", "Primary button"],
      ["buttonText", "Button text"],
      ["focus", "Focus ring"],
      ["warm", "Warm accent"],
    ],
  ],
  [
    "Status",
    [
      ["success", "Success"],
      ["warning", "Warning"],
      ["danger", "Error"],
    ],
  ],
  [
    "Progress",
    [
      ["donutXp", "XP ring"],
      ["donutMilestone", "Milestone ring"],
      ["donutAchievement", "Achievement ring"],
      ["donutTrack", "Ring track"],
    ],
  ],
  [
    "Cards",
    [
      ["tile1", "Card mint"],
      ["tile2", "Card sun"],
      ["tile3", "Card warm"],
      ["tile4", "Card aqua"],
      ["tile5", "Card coral"],
      ["tile6", "Card neutral"],
    ],
  ],
];
const hex = (v: any, fallback: string) =>
  /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : fallback;
const presetKeys = Object.keys(THEME_PRESETS) as Array<
  keyof typeof THEME_PRESETS
>;
type SavedPreset = {
  id: string;
  name: string;
  theme: string;
  config: Record<string, string>;
};

export function ThemeEditor() {
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const [rotation, setRotation] = useState({
    enabled: false,
    intervalDays: 30,
  });
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  useEffect(() => {
    Promise.all([api<any>("/admin/config/"), api<any>("/admin/theme-presets/")])
      .then(([r, presetData]) => {
        const x = r.programmes?.[0];
        if (!x) throw new Error("No active programme found");
        const key = presetKeys.includes(String(x.theme))
          ? String(x.theme)
          : "meadow";
        const config = {
          ...THEME_PRESETS[key].config,
          ...(x.theme_config || {}),
        };
        const saved =
          ((x.public_config || {}).youthDashboard || {}).themeRotation || {};
        const next = {
          enabled: Boolean(saved.enabled),
          intervalDays: [7, 14, 30, 60, 90].includes(Number(saved.intervalDays))
            ? Number(saved.intervalDays)
            : 30,
        };
        setP({
          ...x,
          theme: key,
          theme_config: config,
          public_config: x.public_config || {},
        });
        setRotation(next);
        setSavedPresets(
          Array.isArray(presetData?.presets) ? presetData.presets : [],
        );
        applyTheme(config, key);
      })
      .catch((e) =>
        show(e instanceof Error ? e.message : "Unable to load theme", "error"),
      );
  }, [show]);
  const activeName = useMemo(
    () => THEME_PRESETS[p?.theme || "meadow"]?.name || "Meadow Quest",
    [p?.theme],
  );
  function preview(config: Record<string, string>, key: string) {
    setP((old: any) => ({ ...old, theme: key, theme_config: { ...config } }));
    applyTheme(config, key);
    show(
      `${THEME_PRESETS[key].name} preview applied. Save to make it persistent.`,
      "info",
    );
  }
  function setColor(key: ThemeColorKey, value: string) {
    setP((old: any) => {
      const next = {
        ...old,
        theme_config: { ...(old?.theme_config || {}), [key]: value },
      };
      applyTheme(next.theme_config, next.theme);
      return next;
    });
  }
  async function savePreset() {
    if (!p) return;
    const name = presetName.trim();
    if (!name) {
      show("Give the preset a name first.", "error");
      return;
    }
    try {
      const r = await api<any>("/admin/theme-presets/", {
        method: "POST",
        body: JSON.stringify({
          name,
          theme: p.theme,
          config: p.theme_config || {},
        }),
      });
      setSavedPresets(Array.isArray(r.presets) ? r.presets : []);
      setPresetName("");
      show(`Preset “${name}” saved.`, "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to save preset", "error");
    }
  }
  function loadPreset(item: SavedPreset) {
    setP((old: any) => ({
      ...old,
      theme: item.theme,
      theme_config: { ...item.config },
    }));
    applyTheme(item.config, item.theme);
    show(`Preset “${item.name}” loaded.`, "info");
  }
  async function deletePreset(id: string) {
    try {
      const r = await api<any>("/admin/theme-presets/", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setSavedPresets(Array.isArray(r.presets) ? r.presets : []);
      show("Preset deleted.", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to delete preset", "error");
    }
  }
  async function save() {
    if (!p) return;
    setBusy(true);
    try {
      const theme_config = Object.fromEntries(
        Object.entries(p.theme_config || {}).map(([k, v]) => [
          k,
          hex(
            v,
            THEME_PRESETS[p.theme as keyof typeof THEME_PRESETS].config[
              k as ThemeColorKey
            ] || THEME_PRESETS.meadow.config[k as ThemeColorKey],
          ),
        ]),
      );
      const public_config = {
        ...(p.public_config || {}),
        youthDashboard: {
          ...((p.public_config || {}).youthDashboard || {}),
          themeRotation: {
            enabled: rotation.enabled,
            intervalDays: rotation.intervalDays,
          },
        },
      };
      const r = await api<any>("/admin/config/", {
        method: "POST",
        body: JSON.stringify({
          programmeId: p.id,
          theme: p.theme,
          theme_config,
          public_config,
        }),
      });
      const next = r.programmes?.[0];
      setP((old: any) => ({
        ...old,
        ...next,
        theme_config: next.theme_config || theme_config,
        public_config: next.public_config || public_config,
      }));
      applyTheme(next.theme_config || theme_config, next.theme || p.theme);
      setStoredThemeRotation(rotation);
      try {
        localStorage.setItem(
          `yq-theme-cycle:${p.name || "programme"}`,
          String(Date.now()),
        );
      } catch {}
      show("Theme and rotation settings saved.", "success");
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to save theme", "error");
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return (
      <div className="page">
        <Card>
          <strong>Loading theme studio…</strong>
        </Card>
      </div>
    );
  return (
    <div className="page theme-studio-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">THEME STUDIO</span>
          <h2>Make Youth Quest feel fresh.</h2>
          <p>
            Choose a complete visual preset, then tune individual colours. Every
            major surface reads the same shared tokens.
          </p>
        </div>
        <Palette size={38} />
      </div>
      <section className="theme-preset-grid">
        {presetKeys.map((key) => {
          const item = THEME_PRESETS[key];
          return (
            <Card
              key={key}
              className={`theme-preset ${p.theme === key ? "is-active" : ""}`}
            >
              <div
                className="theme-swatch"
                style={{
                  background: item.config.background,
                  ...(["space", "cleaning", "music", "arts", "games"].includes(
                    String(key),
                  )
                    ? {
                        backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${item.config.background} 12%, transparent), transparent), url('/quest-media/themes/banners/${key}-banner.jpg')`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : {}),
                }}
              >
                <span style={{ background: item.config.nav }}></span>
                <i style={{ background: item.config.accent }}></i>
                <b style={{ background: item.config.accent2 }}></b>
                <em style={{ background: item.config.warm }}></em>
                {["space", "cleaning", "music", "arts", "games"].includes(
                  String(key),
                ) && (
                  <img
                    className="theme-preset-art"
                    src={`/quest-media/themes/theme-icons/${key}/${key}-icon.png`}
                    alt=""
                    loading="lazy"
                  />
                )}
              </div>
              <div className="theme-preset-copy">
                <span className="eyebrow">{key.replace("-", " ")}</span>
                <h3>{item.name}</h3>
                <p>
                  {p.theme === key
                    ? "Currently previewed"
                    : "A complete coordinated palette."}
                </p>
              </div>
              <Button
                variant={p.theme === key ? "primary" : "secondary"}
                icon={p.theme === key ? Check : Palette}
                onClick={() => preview(item.config, key)}
              >
                {p.theme === key ? "Active preview" : "Preview"}
              </Button>
            </Card>
          );
        })}
      </section>
      <Card className="saved-theme-presets">
        <div className="section-head">
          <div>
            <span className="eyebrow">MY PRESETS</span>
            <h3>Saved visual presets</h3>
            <p className="muted">
              These presets are saved to your admin account. Save a tuned
              palette once, then reuse or delete it.
            </p>
          </div>
          <BookmarkPlus size={23} />
        </div>
        <div className="saved-theme-create">
          <input
            value={presetName}
            maxLength={60}
            placeholder="Preset name, e.g. Summer Quest"
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") savePreset();
            }}
          />
          <Button icon={BookmarkPlus} onClick={savePreset}>
            Save current preset
          </Button>
        </div>
        {savedPresets.length ? (
          <div className="saved-theme-list">
            {savedPresets.map((item) => (
              <div className="saved-theme-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {THEME_PRESETS[item.theme]?.name || "Custom palette"}
                  </span>
                </div>
                <div className="top-actions">
                  <Button
                    variant="secondary"
                    icon={Play}
                    onClick={() => loadPreset(item)}
                  >
                    Use
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Delete ${item.name}`}
                    onClick={() => deletePreset(item.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="saved-theme-empty">
            No saved presets yet. Tune the current theme and save it here.
          </div>
        )}
      </Card>
      <div className="theme-studio-grid">
        <CollapsibleCard
          title="Manual colour controls"
          description="Change individual tokens without leaving the shared design system."
          summary="Card colours included"
          icon={Palette}
        >
          <div className="theme-color-groups">
            {COLOR_GROUPS.map(([group, fields]) => (
              <div className="theme-color-group" key={group}>
                <div>
                  <span className="eyebrow">{group}</span>
                  <h3>{group} colours</h3>
                </div>
                <div className="theme-color-grid">
                  {fields.map(([key, label]) => (
                    <label className="theme-color-control" key={key}>
                      <span>{label}</span>
                      <input
                        type="color"
                        value={hex(
                          p.theme_config?.[key],
                          THEME_PRESETS[p.theme as keyof typeof THEME_PRESETS]
                            .config[key] ||
                            THEME_PRESETS.meadow.config[key as ThemeColorKey],
                        )}
                        onChange={(e) => setColor(key, e.target.value)}
                      />
                      <code>
                        {hex(
                          p.theme_config?.[key],
                          THEME_PRESETS[p.theme as keyof typeof THEME_PRESETS]
                            .config[key] ||
                            THEME_PRESETS.meadow.config[key as ThemeColorKey],
                        )}
                      </code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>
        <Card className="theme-rotation-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">FRESHNESS</span>
              <h3>Automatic visual rotation</h3>
              <p className="muted">
                Rotate the selected visual language after a quiet period instead
                of changing it on every refresh.
              </p>
            </div>
            <RotateCcw size={24} />
          </div>
          <label className="switch-row">
            <span>
              <strong>Enable automatic rotation</strong>
              <small>
                Use the preset cycle when the programme has been quiet for the
                chosen interval.
              </small>
            </span>
            <input
              className="sr-only"
              type="checkbox"
              checked={rotation.enabled}
              onChange={(e) =>
                setRotation((v) => ({ ...v, enabled: e.target.checked }))
              }
            />
            <span
              className={`toggle-switch ${rotation.enabled ? "is-on" : ""}`}
              aria-hidden="true"
            >
              <i />
            </span>
          </label>
          <label className="theme-select-row">
            <span>
              <strong>Rotation interval</strong>
              <small>
                Longer intervals keep the app familiar while still giving it a
                refreshed feel.
              </small>
            </span>
            <select
              value={rotation.intervalDays}
              onChange={(e) =>
                setRotation((v) => ({
                  ...v,
                  intervalDays: Number(e.target.value),
                }))
              }
            >
              <option value={7}>Every 7 days</option>
              <option value={14}>Every 14 days</option>
              <option value={30}>Every 30 days</option>
              <option value={60}>Every 60 days</option>
              <option value={90}>Every 90 days</option>
            </select>
          </label>
          <div className="theme-current-preview">
            <span
              className="theme-current-dot"
              style={{
                background:
                  THEME_PRESETS[p.theme as keyof typeof THEME_PRESETS].config
                    .accent,
              }}
            />
            <div>
              <strong>{activeName}</strong>
              <span>
                Preview updates immediately. Save commits it to the programme.
              </span>
            </div>
            <Clock3 size={19} />
          </div>
        </Card>
      </div>
      <div className="sticky-save-bar">
        <Button icon={Save} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save theme"}
        </Button>
      </div>
    </div>
  );
}
