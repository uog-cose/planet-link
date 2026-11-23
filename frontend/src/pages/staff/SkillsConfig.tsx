import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { Card, Button, Pill, ConfirmDialog } from "../../components/ui";
import { Save, Plus, Trash2, Target, Users, UserRound } from "lucide-react";
import { SearchSelect } from "../../components/SearchSelect";
import { t } from "../../i18n";
import { CollapsibleCard } from "../../components/CollapsibleCard";

const blank = {
  name: "",
  description: "",
  activity_url: "",
  xp_reward: 50,
  milestones: [] as any[],
};

export function SkillsConfig({ embedded = false }: { embedded?: boolean }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true),
    [skillSearch, setSkillSearch] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [youth, setYouth] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [rewards, setRewards] = useState<any[]>([]),
    [f, setF] = useState<any>({ ...blank }),
    [assignment, setAssignment] = useState<any>({
      skillId: "",
      profileId: "",
      groupId: "",
    }),
    [progress, setProgress] = useState<any>({
      profileId: "",
      skillId: "",
      value: 0,
    }),
    [msg, setMsg] = useState(""),
    [loadError, setLoadError] = useState(""),
    [saveConfirm, setSaveConfirm] = useState(false),
    [confirmId, setConfirmId] = useState<number | null>(null);
  const load = () =>
    api<any>("/skills/")
      .then((r) => {
        setItems(r.items || []);
        setYouth(r.youth || []);
        setGroups(r.groups || []);
        setRewards(r.rewards || []);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Unable to load skills"),
      )
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  const edit = (x: any) => {
    setF({
      id: x.id,
      name: x.name,
      description: x.description,
      activity_url: x.activity_url || "",
      xp_reward: x.xp_reward,
      milestones: (x.milestones || []).map((m: any) => ({ ...m })),
    });
    window.requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const setM = (i: number, k: string, v: any) =>
    setF({
      ...f,
      milestones: f.milestones.map((m: any, j: number) =>
        j === i ? { ...m, [k]: v } : m,
      ),
    });
  const filteredItems = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    return q
      ? items.filter((x) =>
          `${x.name} ${x.description || ""}`.toLowerCase().includes(q),
        )
      : items;
  }, [items, skillSearch]);
  async function save() {
    setMsg("");
    try {
      await api("/skills/", { method: "POST", body: JSON.stringify(f) });
      setF({ ...blank });
      setMsg("Skill saved");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function remove() {
    if (confirmId == null) return;
    try {
      await api("/skills/", {
        method: "DELETE",
        body: JSON.stringify({ id: confirmId }),
      });
      setMsg("Skill disabled");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setConfirmId(null);
    }
  }
  async function assign() {
    setMsg("");
    if (
      !assignment.skillId ||
      (!assignment.profileId && !assignment.groupId) ||
      (assignment.profileId && assignment.groupId)
    ) {
      setMsg("Choose a skill and exactly one young person or group.");
      return;
    }
    try {
      await api("/skills/assign/", {
        method: "POST",
        body: JSON.stringify({
          skillId: Number(assignment.skillId),
          profileId: assignment.profileId
            ? Number(assignment.profileId)
            : undefined,
          groupId: assignment.groupId ? Number(assignment.groupId) : undefined,
        }),
      });
      setMsg("Skill assigned");
      setAssignment({ ...assignment, profileId: "", groupId: "" });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  if (loadError)
    return (
      <div
        ref={editorRef}
        className={`worker-config-page skills-config-page ${embedded ? "embedded" : ""}`}
      >
        <Card className="skills-state-card">
          <p className="field-error">{loadError}</p>
          <Button
            onClick={() => {
              setLoadError("");
              setLoading(true);
              load();
            }}
          >
            Try again
          </Button>
        </Card>
      </div>
    );
  if (loading)
    return (
      <div
        ref={editorRef}
        className={`worker-config-page skills-config-page ${embedded ? "embedded" : ""}`}
      >
        <div className="loading-skeleton">
          <span className="skeleton-line" />
          <div className="skeleton-card" />
        </div>
      </div>
    );
  return (
    <div
      ref={editorRef}
      className={`worker-config-page skills-config-page ${embedded ? "embedded" : ""}`}
    >
      {!embedded && (
        <div className="page-title">
          <div>
            <span className="eyebrow">SKILL TREE</span>
            <h2>{t("skillsMilestones")}</h2>
            <p>
              Create reusable skills, connect milestone rewards, then assign and
              track progress from one focused workspace.
            </p>
          </div>
          <Target size={34} />
        </div>
      )}
      <div className="skills-config-grid">
        <CollapsibleCard
          className="skills-panel skills-panel-create"
          defaultOpen={false}
          title={f.id ? t("editSkillMilestones") : "Create a skill"}
          description="Define the skill, base XP and milestone rewards."
          icon={Target}
          summary={f.id ? "Editing" : "New skill"}
        >
          <div className="grid-2">
            <label>
              Skill name
              <input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="e.g. Teamwork"
              />
            </label>
            <label>
              Base XP
              <input
                type="number"
                min="0"
                max="5000"
                value={f.xp_reward}
                onChange={(e) =>
                  setF({ ...f, xp_reward: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label className="span-2">
              Description / instructions
              <textarea
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="Explain what the young person should do."
              ></textarea>
            </label>
            <label className="span-2">
              Activity URL (optional)
              <input
                type="url"
                value={f.activity_url || ""}
                onChange={(e) => setF({ ...f, activity_url: e.target.value })}
                placeholder="https://…"
              />
              <small className="muted">
                Link to a game, video, or learning resource.
              </small>
            </label>
          </div>
          <div className="skills-subsection-head">
            <div>
              <h3>Milestone rewards</h3>
              <p className="muted">
                Connect progress thresholds to XP or a scratch-card reward.
              </p>
            </div>
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() =>
                setF({
                  ...f,
                  milestones: [
                    ...f.milestones,
                    {
                      name: "New milestone",
                      progress: f.milestones.length
                        ? Math.min(
                            100,
                            (f.milestones.at(-1)?.progress || 0) + 10,
                          )
                        : 10,
                      xp: 0,
                      rewardId: null,
                    },
                  ],
                })
              }
            >
              Add milestone
            </Button>
          </div>
          <div className="skill-milestone-list">
            {f.milestones.map((m: any, i: number) => (
              <div className="skill-milestone-card" key={i}>
                <div className="skill-milestone-number">{i + 1}</div>
                <div className="grid-4 skill-milestone-fields">
                  <label>
                    Name
                    <input
                      value={m.name}
                      onChange={(e) => setM(i, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    Progress %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={m.progress ?? 1}
                      onChange={(e) =>
                        setM(i, "progress", Number(e.target.value) || 1)
                      }
                    />
                  </label>
                  <label>
                    XP
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={m.xp}
                      onChange={(e) =>
                        setM(i, "xp", Number(e.target.value) || 0)
                      }
                    />
                  </label>
                  <label>
                    Prize
                    <select
                      value={m.rewardId || ""}
                      onChange={(e) =>
                        setM(
                          i,
                          "rewardId",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">No reward</option>
                      {rewards.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label="Remove milestone"
                  onClick={() =>
                    setF({
                      ...f,
                      milestones: f.milestones.filter(
                        (_: any, j: number) => j !== i,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="top-actions">
            <Button icon={Save} onClick={() => setSaveConfirm(true)}>
              {f.id ? t("saveChanges") : t("saveSkill")}
            </Button>
            {f.id && (
              <Button variant="secondary" onClick={() => setF({ ...blank })}>
                {t("cancelEdit")}
              </Button>
            )}
            {msg && <span className="muted">{msg}</span>}
          </div>
        </CollapsibleCard>
        <CollapsibleCard
          className="skills-panel skills-panel-assign"
          defaultOpen={false}
          title="Assign a skill"
          description="Apply a skill to a young person or group."
          icon={Users}
          summary="Individual or group"
        >
          <div className="skills-panel-copy">
            <Users size={20} />
            <p>
              A group assignment applies to current members and future
              membership is checked dynamically.
            </p>
          </div>
          <div className="grid-3">
            <label>
              Skill
              <select
                value={assignment.skillId}
                onChange={(e) =>
                  setAssignment({ ...assignment, skillId: e.target.value })
                }
              >
                <option value="">Choose</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <SearchSelect
              label="Young person"
              value={assignment.profileId}
              onChange={(v) =>
                setAssignment({ ...assignment, profileId: v, groupId: "" })
              }
              placeholder="None"
              searchPlaceholder="Search young person…"
              options={youth.map((x) => ({ value: x.id, label: x.name }))}
            />
            <SearchSelect
              label="Group"
              value={assignment.groupId}
              onChange={(v) =>
                setAssignment({ ...assignment, groupId: v, profileId: "" })
              }
              placeholder="None"
              searchPlaceholder="Search group…"
              options={groups.map((x) => ({ value: x.id, label: x.name }))}
            />
          </div>
          <Button icon={UserRound} onClick={assign}>
            Assign skill
          </Button>
        </CollapsibleCard>
        <CollapsibleCard
          className="skills-panel skills-panel-progress"
          defaultOpen={false}
          title="Update player progress"
          description="Record progress against an assigned skill."
          icon={Save}
          summary="Progress tracking"
        >
          <div className="grid-3">
            <SearchSelect
              label="Young person"
              value={progress.profileId}
              onChange={(v) => setProgress({ ...progress, profileId: v })}
              placeholder="Choose"
              searchPlaceholder="Search young person…"
              options={youth.map((x) => ({ value: x.id, label: x.name }))}
            />
            <label>
              Skill
              <select
                value={progress.skillId}
                onChange={(e) =>
                  setProgress({ ...progress, skillId: e.target.value })
                }
              >
                <option value="">Choose</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Progress %
              <input
                type="number"
                min="0"
                max="100"
                value={progress.value}
                onChange={(e) =>
                  setProgress({
                    ...progress,
                    value: Number(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>
          <Button
            icon={Save}
            disabled={!progress.profileId || !progress.skillId}
            onClick={async () => {
              try {
                const r = await api<any>("/skills/progress/", {
                  method: "POST",
                  body: JSON.stringify({
                    profileId: Number(progress.profileId),
                    skillId: Number(progress.skillId),
                    progress: Number(progress.value),
                  }),
                });
                setMsg(
                  (r.awarded || []).length
                    ? `Progress saved — ${(r.awarded || []).map((x: any) => `${x.name}: +${x.xp} XP`).join(", ")}`
                    : "Progress saved",
                );
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Save player progress
          </Button>
        </CollapsibleCard>
      </div>
      <CollapsibleCard
        className="skills-panel skills-panel-library"
        defaultOpen={false}
        title="Configured skills"
        description={t("configuredSkillsHelp")}
        summary={`${items.length} skills`}
        icon={Target}
      >
        <div className="skills-library-head">
          <div>
            <h3>Skill library</h3>
            <p className="muted">
              Edit, review milestones or disable skills without losing history.
            </p>
          </div>
          <Pill>{items.length}</Pill>
        </div>
        <label className="inline-search">
          <span className="sr-only">Search skills</span>
          <input
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            placeholder={t("searchSkills")}
            aria-label={t("searchSkills")}
          />
        </label>
        <div className="skills-library-grid">
          {filteredItems.map((x, i) => (
            <div
              className={`skill-library-card skill-tone-${(i % 4) + 1}`}
              key={x.id}
            >
              <div className="skill-library-icon">
                <Target size={18} />
              </div>
              <div className="skill-library-main">
                <strong>{x.name}</strong>
                <span>{x.description || "No description"}</span>
                <small>
                  {(x.milestones || []).length} milestone
                  {(x.milestones || []).length === 1 ? "" : "s"} ·{" "}
                  {x.xp_reward || 0} base XP
                </small>
              </div>
              <div className="skill-library-actions">
                <Button
                  variant="secondary"
                  onClick={() => edit(x)}
                  aria-label={`Edit ${x.name}`}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => setConfirmId(x.id)}
                  aria-label={`Disable ${x.name}`}
                >
                  Disable
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleCard>
      <ConfirmDialog
        open={saveConfirm}
        title="Save skill?"
        body="Save these skill and milestone configuration changes?"
        confirmLabel="Save skill"
        onConfirm={async () => {
          setSaveConfirm(false);
          await save();
        }}
        onCancel={() => setSaveConfirm(false)}
      />
      <ConfirmDialog
        open={confirmId != null}
        title="Disable skill?"
        body="The skill will no longer be available for new progress, while its existing history is retained."
        confirmLabel="Disable skill"
        danger
        onConfirm={remove}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
