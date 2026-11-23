import { STATIC_COLORS } from "../../theme/colors";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { Button, Card, ConfirmDialog } from "../../components/ui";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import {
  Save,
  Target,
  Plus,
  Trash2,
  Flame,
  Eye,
  RefreshCw,
  Bell,
} from "lucide-react";
import { CalendarField } from "../../components/CalendarField";
import { Toggle } from "../../components/Toggle";
import { Toast } from "../../components/Toast";

const cleanNumber = (v: string) =>
  v.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");

function ConfigSkeleton() {
  return (
    <div className="grid-2">
      <Card className="skeleton-card">
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
        <span className="skeleton-block" />
      </Card>
      <Card className="skeleton-card">
        <span className="skeleton-line" />
        <span className="skeleton-line short" />
        <span className="skeleton-block" />
      </Card>
    </div>
  );
}

export function AdminConfig() {
  const [p, setP] = useState<any>(null);
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");
  const [visibilityMsg, setVisibilityMsg] = useState("");
  const [loadError, setLoadError] = useState("");
  const [configSearch, setConfigSearch] = useState("");

  const initialSnapshot = useRef("");
  const [confirm, setConfirm] = useState<null | {
    kind: "save" | "visibility" | "removeMilestone" | "removeStreak";
    id?: number;
  }>(null);

  async function loadConfig() {
    const r = await api<any>("/admin/config/");
    const x = Array.isArray(r.programmes) ? r.programmes[0] : null;
    if (!x) throw new Error(t("noActiveInstance"));
    setP({
      ...x,
      milestones: Array.isArray(x.milestones) ? x.milestones : [],
      rewards: Array.isArray(x.rewards) ? x.rewards : [],
      streak_rules: Array.isArray(x.streak_rules) ? x.streak_rules : [],
      public_config: x.public_config || {},
    });
    setDate(x.starts || "");
    initialSnapshot.current = JSON.stringify({ ...x, starts: x.starts || "" });
  }

  useEffect(() => {
    loadConfig().catch((e) =>
      setLoadError(e instanceof Error ? e.message : t("errorBody")),
    );
  }, []);

  async function save() {
    if (!p) return;
    setMsg("");
    try {
      const r = await api<any>("/admin/config/", {
        method: "POST",
        body: JSON.stringify({
          programmeId: p.id,
          name: p.name,
          location: p.location,
          target_xp: Number(p.target_xp),
          max_worker_points: Number(p.max_worker_points || 100),
          attendance_points: Number(p.attendance_points || 0),
          streak_rules: p.streak_rules || [],
          attendance_attention_days: Number(p.attendance_attention_days || 7),
          points_attention_days: Number(p.points_attention_days || 7),
          attention_grace_days: Number(p.attention_grace_days || 3),
          notification_retention_days: Number(
            p.notification_retention_days || 30,
          ),
          public_config: p.public_config || {},
          active: p.active !== false,
          status: p.status || (p.active === false ? "inactive" : "active"),
          public_enabled: p.public_enabled !== false,
          starts: date || null,
          milestones: p.milestones || [],
          public_map_token: p.public_map_token || "",
          public_map_token_expires_at: p.public_map_token_expires_at || null,
        }),
      });
      const x = Array.isArray(r.programmes) ? r.programmes[0] : null;
      if (x)
        setP({
          ...x,
          milestones: x.milestones || [],
          streak_rules: x.streak_rules || [],
          public_config: x.public_config || {},
        });
      initialSnapshot.current = JSON.stringify({ ...x, starts: date || "" });
      setMsg(t("saved"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("errorBody"));
    }
  }

  async function saveVisibility() {
    if (!p) return;
    setVisibilityMsg("");
    try {
      const r = await api<any>("/admin/config/", {
        method: "POST",
        body: JSON.stringify({
          programmeId: p.id,
          public_config: p.public_config || {},
          public_enabled: p.public_enabled !== false,
        }),
      });
      const x = Array.isArray(r.programmes) ? r.programmes[0] : null;
      if (x)
        setP((prev: typeof p) =>
          prev
            ? {
                ...prev,
                public_config: x.public_config || {},
                public_enabled: x.public_enabled !== false,
              }
            : prev,
        );
      setVisibilityMsg(t("publicSettingsSaved"));
    } catch (e) {
      setVisibilityMsg(e instanceof Error ? e.message : t("errorBody"));
    }
  }

  function addMilestone() {
    setP({
      ...p,
      milestones: [
        ...p.milestones,
        {
          tier: `milestone-${p.milestones.length + 1}`,
          xp: p.milestones.length
            ? Number(p.milestones.at(-1)?.xp || 0) + 100
            : 100,
          color: STATIC_COLORS.milestone,
          rewardId: "",
        },
      ],
    });
  }

  function addStreak() {
    const last = p.streak_rules.at(-1);
    setP({
      ...p,
      streak_rules: [
        ...p.streak_rules,
        { days: last ? Number(last.days) + 1 : 3, multiplier: 1.3 },
      ],
    });
  }
  const query = configSearch.trim().toLowerCase();
  const matchesConfig = (value: string) =>
    !query || value.toLowerCase().includes(query);

  const isDirty = Boolean(
    p &&
    initialSnapshot.current &&
    JSON.stringify({ ...p, starts: date || "" }) !== initialSnapshot.current,
  );
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty]);

  const visibleDefaults = useMemo(
    () => ({
      programme: true,
      location: true,
      collectiveXp: true,
      targetXp: true,
      participants: true,
      groups: true,
      highRisers: true,
      skillsCompleted: true,
      challengesCompleted: true,
      attendance: true,
      challengeProgress: true,
      event: true,
    }),
    [],
  );
  const visibilityLabels: Record<string, { label: string; help: string }> = {
    programme: {
      label: t("public_programme"),
      help: t("public_programme_help"),
    },
    location: { label: t("public_location"), help: t("public_location_help") },
    collectiveXp: {
      label: t("public_collectiveXp"),
      help: t("public_collectiveXp_help"),
    },
    targetXp: { label: t("public_targetXp"), help: t("public_targetXp_help") },
    participants: {
      label: t("public_participants"),
      help: t("public_participants_help"),
    },
    groups: { label: t("public_groups"), help: t("public_groups_help") },
    highRisers: {
      label: t("public_highRisers"),
      help: t("public_highRisers_help"),
    },
    skillsCompleted: {
      label: t("public_skillsCompleted"),
      help: t("public_skillsCompleted_help"),
    },
    challengesCompleted: {
      label: t("public_challengesCompleted"),
      help: t("public_challengesCompleted_help"),
    },
    attendance: {
      label: "Attendance",
      help: "Show today’s attendance against registered participants on the public board.",
    },
    challengeProgress: {
      label: "Challenge progress",
      help: "Show total, active and completed challenges on the public board.",
    },
    event: { label: t("public_event"), help: t("public_event_help") },
  };
  if (!p && loadError)
    return (
      <div className="page">
        <Card>
          <div className="section-head">
            <div>
              <h3>{t("errorTitle")}</h3>
              <p className="muted">{loadError}</p>
            </div>
            <Button
              icon={RefreshCw}
              onClick={() => {
                setLoadError("");
                loadConfig().catch((e) =>
                  setLoadError(e instanceof Error ? e.message : t("errorBody")),
                );
              }}
            >
              {t("tryAgain")}
            </Button>
          </div>
        </Card>
      </div>
    );
  if (!p)
    return (
      <div className="page">
        <div className="page-title">
          <div>
            <span className="eyebrow">{t("configure").toUpperCase()}</span>
            <h2>{t("programmeControl")}</h2>
          </div>
          <Target size={34} />
        </div>
        <ConfigSkeleton />
      </div>
    );

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{t("configure").toUpperCase()}</span>
          <h2>{t("programmeControl")}</h2>
          <p>{t("configHelp")}</p>
        </div>
        <Target size={34} />
      </div>
      <Card className="config-search-card">
        <label className="config-search">
          <span className="sr-only">{t("searchConfiguration")}</span>
          <input
            value={configSearch}
            onChange={(e) => setConfigSearch(e.target.value)}
            placeholder={t("searchConfiguration")}
            aria-label={t("searchConfiguration")}
          />
        </label>
      </Card>

      <div className="grid-2">
        <CollapsibleCard
          className={
            matchesConfig("programme attendance general xp")
              ? ""
              : "config-search-hidden"
          }
          title={t("programmeAttendance")}
          description={t("programmeAttendanceHelp")}
          icon={Flame}
        >
          <label>
            {t("programmeName")}
            <input
              maxLength={120}
              value={p.name || ""}
              onChange={(e) => setP({ ...p, name: e.target.value })}
            />
          </label>
          <label>
            {t("location")}
            <input
              maxLength={120}
              value={p.location || ""}
              onChange={(e) => setP({ ...p, location: e.target.value })}
            />
          </label>
          <label>
            {t("targetXp")}
            <input
              type="number"
              min="1"
              max="100000000"
              value={
                p.target_xp === undefined ? "" : String(Number(p.target_xp))
              }
              onChange={(e) =>
                setP({ ...p, target_xp: cleanNumber(e.target.value) })
              }
            />
          </label>
          <label>
            {t("maxWorkerAward")}
            <input
              type="number"
              min="1"
              max="5000"
              value={
                p.max_worker_points === undefined
                  ? ""
                  : String(Number(p.max_worker_points))
              }
              onChange={(e) =>
                setP({ ...p, max_worker_points: cleanNumber(e.target.value) })
              }
            />
          </label>
          <label>
            {t("attendancePoints")}
            <input
              type="number"
              min="0"
              max="5000"
              value={
                p.attendance_points === undefined
                  ? ""
                  : String(Number(p.attendance_points))
              }
              onChange={(e) =>
                setP({ ...p, attendance_points: cleanNumber(e.target.value) })
              }
            />
          </label>
          <div className="grid-2">
            <label>
              {t("attendanceAttentionDays")}
              <input
                type="number"
                min="1"
                max="365"
                value={p.attendance_attention_days || 7}
                onChange={(e) =>
                  setP({
                    ...p,
                    attendance_attention_days:
                      cleanNumber(e.target.value) || "1",
                  })
                }
              />
            </label>
            <label>
              {t("pointsAttentionDays")}
              <input
                type="number"
                min="1"
                max="365"
                value={p.points_attention_days || 7}
                onChange={(e) =>
                  setP({
                    ...p,
                    points_attention_days: cleanNumber(e.target.value) || "1",
                  })
                }
              />
            </label>
          </div>
          <label>
            {t("gracePeriodDays")}
            <input
              type="number"
              min="1"
              max="365"
              value={p.attention_grace_days || 3}
              onChange={(e) =>
                setP({
                  ...p,
                  attention_grace_days: cleanNumber(e.target.value) || "1",
                })
              }
            />
          </label>
          <CalendarField
            label={t("programmeDate")}
            value={date}
            onChange={setDate}
            withTime={false}
          />
          <label>
            {t("notificationRetention")}
            <input
              type="number"
              min="1"
              max="365"
              value={p.notification_retention_days || 30}
              onChange={(e) =>
                setP({
                  ...p,
                  notification_retention_days: Math.max(
                    1,
                    Math.min(365, Number(e.target.value) || 1),
                  ),
                })
              }
            />
          </label>
          <div className="config-save-row">
            <Button icon={Save} onClick={() => setConfirm({ kind: "save" })}>
              {t("saveChanges")}
            </Button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          className={
            matchesConfig("attendance streak rewards")
              ? ""
              : "config-search-hidden"
          }
          title={t("attendanceStreakRewards")}
          description={t("attendanceStreakHelp")}
          summary={`${p.streak_rules.length} ${t("rules").toLowerCase()}`}
          icon={Flame}
        >
          <div className="section-head">
            <div>
              <h3>{t("streakRules")}</h3>
              <p className="muted">{t("highestMatchingRule")}</p>
            </div>
            <Button variant="secondary" icon={Plus} onClick={addStreak}>
              {t("addRule")}
            </Button>
          </div>
          {p.streak_rules.map((r: any, i: number) => (
            <div className="milestone-editor" key={`${r.days}-${i}`}>
              <label>
                {t("consecutiveDays")}
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={r.days}
                  onChange={(e) =>
                    setP({
                      ...p,
                      streak_rules: p.streak_rules.map((x: any, j: number) =>
                        j === i ? { ...x, days: Number(e.target.value) } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                {t("multiplier")}
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={r.multiplier}
                  onChange={(e) =>
                    setP({
                      ...p,
                      streak_rules: p.streak_rules.map((x: any, j: number) =>
                        j === i
                          ? { ...x, multiplier: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                />
              </label>
              <Button
                variant="ghost"
                icon={Trash2}
                aria-label={t("removeRule")}
                onClick={() => setConfirm({ kind: "removeStreak", id: i })}
              />
            </div>
          ))}
          {!p.streak_rules.length && (
            <div className="empty-state">
              <Flame />
              <strong>{t("noStreakBonus")}</strong>
              <span>{t("baseAttendanceStillApplies")}</span>
            </div>
          )}
          <div className="config-save-row">
            <Button icon={Save} onClick={() => setConfirm({ kind: "save" })}>
              {t("saveChanges")}
            </Button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          className={
            matchesConfig("milestones avatar progression")
              ? ""
              : "config-search-hidden"
          }
          title={t("milestones")}
          description={t("milestonesHelp")}
          summary={`${p.milestones.length} ${t("levels").toLowerCase()}`}
          icon={Target}
        >
          <div className="section-head">
            <div>
              <h3>{t("milestoneLevels")}</h3>
              <p className="muted">{t("milestoneValidationHelp")}</p>
            </div>
            <Button variant="secondary" icon={Plus} onClick={addMilestone}>
              {t("addMilestone")}
            </Button>
          </div>
          {p.milestones.map((m: any, i: number) => (
            <div className="milestone-editor" key={`${m.tier}-${i}`}>
              <label>
                {t("tierName")}
                <input
                  maxLength={60}
                  value={m.tier || ""}
                  onChange={(e) =>
                    setP({
                      ...p,
                      milestones: p.milestones.map((x: any, j: number) =>
                        j === i ? { ...x, tier: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                {t("milestoneColour")}
                <input
                  type="color"
                  value={m.color || STATIC_COLORS.milestone}
                  onChange={(e) =>
                    setP({
                      ...p,
                      milestones: p.milestones.map((x: any, j: number) =>
                        j === i ? { ...x, color: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                {t("xpThreshold")}
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={m.xp ?? 0}
                  onChange={(e) =>
                    setP({
                      ...p,
                      milestones: p.milestones.map((x: any, j: number) =>
                        j === i ? { ...x, xp: Number(e.target.value) || 0 } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Unlock award
                <select
                  value={m.rewardId ?? ""}
                  onChange={(e) =>
                    setP({
                      ...p,
                      milestones: p.milestones.map((x: any, j: number) =>
                        j === i
                          ? {
                              ...x,
                              rewardId: e.target.value
                                ? Number(e.target.value)
                                : "",
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="">No scratch card</option>
                  {(p.rewards || []).map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                icon={Trash2}
                aria-label={t("removeMilestone")}
                onClick={() => setConfirm({ kind: "removeMilestone", id: i })}
              />
            </div>
          ))}
          <div className="config-save-row">
            <Button icon={Save} onClick={() => setConfirm({ kind: "save" })}>
              {t("saveChanges")}
            </Button>
          </div>
        </CollapsibleCard>

        <CollapsibleCard
          className={
            matchesConfig("public dashboard visibility")
              ? ""
              : "config-search-hidden"
          }
          title={t("publicDashboardVisibility")}
          description={t("publicVisibilityHelp")}
          icon={Eye}
        >
          <Toggle
            label={t("publicDashboardEnabled")}
            description={t("publicDashboardEnabledHelp")}
            checked={p.public_enabled !== false}
            onChange={(v) => setP({ ...p, public_enabled: v })}
          />
          <div className="visibility-grid">
            {Object.entries(visibleDefaults).map(([k, defaultValue]) => (
              <Toggle
                key={k}
                label={visibilityLabels[k].label}
                description={visibilityLabels[k].help}
                checked={Boolean(p.public_config?.[k] ?? defaultValue)}
                onChange={(v) =>
                  setP({
                    ...p,
                    public_config: { ...(p.public_config || {}), [k]: v },
                  })
                }
              />
            ))}
          </div>
          <div className="config-save-row">
            <Button
              icon={Save}
              onClick={() => setConfirm({ kind: "visibility" })}
            >
              {t("savePublicVisibility")}
            </Button>
            {visibilityMsg && (
              <span
                className={
                  visibilityMsg === t("publicSettingsSaved")
                    ? "success"
                    : "field-error"
                }
              >
                {visibilityMsg}
              </span>
            )}
          </div>
        </CollapsibleCard>
      </div>

      <div className="config-link-grid">
        <Link
          className={
            matchesConfig("notification audio sounds")
              ? "config-link-card"
              : "config-link-card config-search-hidden"
          }
          to="/admin/notification-sounds"
        >
          <Bell />
          <span>
            <strong>Notification sounds</strong>
            <small>
              Upload positive, negative, bravo and motivation sounds
            </small>
          </span>
        </Link>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "save"}
        title={t("confirmSaveConfiguration")}
        body={t("confirmSaveConfigurationBody")}
        confirmLabel={t("saveChanges")}
        onConfirm={async () => {
          setConfirm(null);
          await save();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "visibility"}
        title={t("confirmSaveConfiguration")}
        body={t("confirmSaveConfigurationBody")}
        confirmLabel={t("saveChanges")}
        onConfirm={async () => {
          setConfirm(null);
          await saveVisibility();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "removeStreak"}
        title={t("removeRule")}
        body={t("confirmRemoveConfiguration")}
        confirmLabel={t("remove")}
        danger
        onConfirm={() => {
          const i = Number(confirm?.id);
          setP((prev: any) => ({
            ...prev,
            streak_rules: prev.streak_rules.filter(
              (_: any, j: number) => j !== i,
            ),
          }));
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "removeMilestone"}
        title={t("removeMilestone")}
        body={t("confirmRemoveConfiguration")}
        confirmLabel={t("remove")}
        danger
        onConfirm={() => {
          const i = Number(confirm?.id);
          setP((prev: any) => ({
            ...prev,
            milestones: prev.milestones.filter((_: any, j: number) => j !== i),
          }));
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      {isDirty && (
        <div className="unsaved-bar" role="status">
          <span>{t("unsavedChanges")}</span>
          <Button variant="secondary" onClick={() => loadConfig()}>
            {t("discardChanges")}
          </Button>
          <Button onClick={() => setConfirm({ kind: "save" })}>
            {t("saveChanges")}
          </Button>
        </div>
      )}
      <Toast
        message={msg}
        tone={msg === t("saved") ? "success" : "info"}
        onDismiss={() => setMsg("")}
      />
    </div>
  );
}
