import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { t } from "../../i18n";
import { Button, Card, Pill } from "../../components/ui";
import { Users, Plus, Save, Search, ChevronDown, Trophy } from "lucide-react";
import { Toggle } from "../../components/Toggle";
import { useToast } from "../../components/ToastProvider";

export function Groups({ embedded = false }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [youth, setYouth] = useState<any[]>([]);
  const [playerQuery, setPlayerQuery] = useState("");
  const [name, setName] = useState("");
  const [tierDraft, setTierDraft] = useState<
    Record<number, { name: string; xp: string; prize: string }[]>
  >({});
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [editPeople, setEditPeople] = useState<
    Record<number, { query?: string; items: any[] }>
  >({});
  const { show } = useToast();
  const load = async () => {
    try {
      const g = await api<any>("/staff/groups/");
      setGroups(g.items || []);
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to load groups", "error");
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const id = window.setTimeout(
      () =>
        api<any>(
          `/staff/accounts/?role=youth&q=${encodeURIComponent(playerQuery)}&page=1&limit=30`,
        )
          .then((r) => setYouth(r.items || []))
          .catch(() => setYouth([])),
      180,
    );
    return () => window.clearTimeout(id);
  }, [playerQuery]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q
      ? groups
      : groups.filter((g) =>
          `${g.name} ${(g.memberNames || []).join(" ")}`
            .toLowerCase()
            .includes(q),
        );
  }, [groups, query]);
  async function create() {
    if (!name.trim()) {
      show("Enter a group name before creating the group.", "error");
      return;
    }
    if (!selected.length) {
      show(
        "Select at least one young person for the group before creating it.",
        "error",
      );
      return;
    }
    try {
      await api("/staff/groups/", {
        method: "POST",
        body: JSON.stringify({ name, memberIds: selected }),
      });
      setName("");
      setSelected([]);
      show("Group created.", "success");
      load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to create group", "error");
    }
  }
  async function save(g: any) {
    try {
      await api("/staff/groups/members/", {
        method: "POST",
        body: JSON.stringify({ groupId: g.id, memberIds: g.memberIds }),
      });
      show("Group membership saved.", "success");
      load();
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Unable to save group membership",
        "error",
      );
    }
  }
  return (
    <div
      className={embedded ? "groups-page groups-embedded" : "page groups-page"}
    >
      {!embedded && (
        <div className="page-title">
          <div>
            <span className="eyebrow">{t("groups").toUpperCase()}</span>
            <h2>{t("manageGroups")}</h2>
            <p>{t("groupsHelp")}</p>
          </div>
          <Users size={34} />
        </div>
      )}
      <div className="groups-toolbar">
        <label className="account-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups or young people…"
          />
        </label>
        <div className="top-actions">
          <Pill>{filtered.length} groups</Pill>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => setCreateOpen((v) => !v)}
          >
            {createOpen ? "Close create" : "Create group"}
          </Button>
        </div>
      </div>
      <Card className={`group-create-compact ${createOpen ? "is-open" : ""}`}>
        <div className="section-head">
          <div>
            <span className="eyebrow">CREATE</span>
            <h3>{t("createGroup")}</h3>
            <p className="muted">
              Start with a name and the young people who belong in it.
            </p>
          </div>
          <Plus />
        </div>
        <div className="grid-2">
          <label>
            {t("groupName")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monday explorers"
            />
          </label>
          <div>
            <span className="eyebrow">{t("assignPlayers")}</span>
            <label className="group-player-search">
              <Search size={15} />
              <input
                value={playerQuery}
                onChange={(e) => setPlayerQuery(e.target.value)}
                placeholder="Search players by name…"
              />
            </label>
            <div className="group-player-picker">
              {youth.map((x) => (
                <Toggle
                  key={x.userId}
                  label={x.gamertag}
                  checked={selected.includes(x.profileId)}
                  onChange={(v) =>
                    setSelected((prev) =>
                      v
                        ? prev.includes(x.profileId)
                          ? prev
                          : [...prev, x.profileId]
                        : prev.filter((id) => id !== x.profileId),
                    )
                  }
                />
              ))}
            </div>
            <small className="muted">
              {selected.length} selected · showing matching players only
            </small>
          </div>
        </div>
        <Button icon={Plus} onClick={create}>
          Create group
        </Button>
      </Card>
      <div className="groups-list-compact">
        {filtered.map((g) => {
          const isOpen = openId === g.id;
          return (
            <Card
              className={`group-compact-card ${isOpen ? "is-open" : ""}`}
              key={g.id}
            >
              <button
                type="button"
                className="group-compact-trigger"
                onClick={async () => {
                  if (isOpen) {
                    setOpenId(null);
                    return;
                  }
                  setOpenId(g.id);
                  if (!tierDraft[g.id])
                    setTierDraft((v) => ({
                      ...v,
                      [g.id]: (g.tierTargets?.length
                        ? g.tierTargets
                        : [
                            { name: "Tier 1", xp: 10000, prize: "" },
                            { name: "Tier 2", xp: 25000, prize: "" },
                            { name: "Tier 3", xp: 50000, prize: "" },
                          ]
                      ).map((x: any) => ({
                        name: String(x.name || ""),
                        xp: String(x.xp || ""),
                        prize: String(x.prize || ""),
                      })),
                    }));
                  if (!editPeople[g.id]) {
                    try {
                      const r = await api<any>(
                        `/staff/accounts/?role=youth&q=&page=1&limit=30`,
                      );
                      setEditPeople((v) => ({
                        ...v,
                        [g.id]: { query: "", items: r.items || [] },
                      }));
                    } catch {
                      setEditPeople((v) => ({
                        ...v,
                        [g.id]: { query: "", items: [] },
                      }));
                    }
                  }
                }}
              >
                <span className="config-collapsible-icon">
                  <Users size={18} />
                </span>
                <span>
                  <strong>{g.name}</strong>
                  <small>
                    {g.memberNames?.length || 0} players ·{" "}
                    {Number(g.xp || 0).toLocaleString()} XP
                  </small>
                </span>
                <span className="group-trigger-end">
                  <Pill>{g.memberNames?.length || 0}</Pill>
                  <ChevronDown size={18} />
                </span>
              </button>
              {isOpen && (
                <div className="group-compact-body">
                  <label className="group-player-search">
                    <Search size={15} />
                    <input
                      placeholder="Search players to add or remove…"
                      value={editPeople[g.id]?.query || ""}
                      onChange={async (e) => {
                        const q = e.target.value;
                        setEditPeople((v) => ({
                          ...v,
                          [g.id]: { query: q, items: v[g.id]?.items || [] },
                        }));
                        const r = await api<any>(
                          `/staff/accounts/?role=youth&q=${encodeURIComponent(q)}&page=1&limit=30`,
                        );
                        setEditPeople((v) => ({
                          ...v,
                          [g.id]: { query: q, items: r.items || [] },
                        }));
                      }}
                    />
                  </label>
                  <div className="group-selected-summary">
                    <strong>{(g.memberIds || []).length} selected</strong>
                    <span>
                      {(g.memberNames || []).slice(0, 6).join(", ")}
                      {(g.memberNames || []).length > 6 ? "…" : ""}
                    </span>
                  </div>
                  <div className="check-list">
                    {(editPeople[g.id]?.items || []).map((x: any) => (
                      <Toggle
                        key={x.userId}
                        label={x.gamertag}
                        checked={(g.memberIds || []).includes(x.profileId)}
                        onChange={(v) =>
                          setGroups((gs) =>
                            gs.map((z) =>
                              z.id === g.id
                                ? {
                                    ...z,
                                    memberIds: v
                                      ? (z.memberIds || []).includes(
                                          x.profileId,
                                        )
                                        ? z.memberIds
                                        : [...(z.memberIds || []), x.profileId]
                                      : (z.memberIds || []).filter(
                                          (id: number) => id !== x.profileId,
                                        ),
                                  }
                                : z,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                  <Button icon={Save} onClick={() => save(g)}>
                    {t("saveMembers")}
                  </Button>
                  <div className="group-tier-editor">
                    <div className="section-head">
                      <div>
                        <span className="eyebrow">JACKPOT TARGETS</span>
                        <h4>Independent group milestones</h4>
                        <p className="muted">
                          Set XP thresholds and prizes for this group.
                        </p>
                      </div>
                      <Trophy size={19} />
                    </div>
                    {(tierDraft[g.id] || []).map((tier, i) => (
                      <div className="group-tier-row" key={i}>
                        <label>
                          Tier name
                          <input
                            value={tier.name}
                            onChange={(e) =>
                              setTierDraft((v) => ({
                                ...v,
                                [g.id]: v[g.id].map((x, j) =>
                                  i === j ? { ...x, name: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          XP target
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={tier.xp}
                            onChange={(e) =>
                              setTierDraft((v) => ({
                                ...v,
                                [g.id]: v[g.id].map((x, j) =>
                                  i === j ? { ...x, xp: e.target.value } : x,
                                ),
                              }))
                            }
                          />
                        </label>
                        <label>
                          Prize
                          <input
                            value={tier.prize}
                            maxLength={160}
                            onChange={(e) =>
                              setTierDraft((v) => ({
                                ...v,
                                [g.id]: v[g.id].map((x, j) =>
                                  i === j ? { ...x, prize: e.target.value } : x,
                                ),
                              }))
                            }
                            placeholder="e.g. group trip"
                          />
                        </label>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            setTierDraft((v) => ({
                              ...v,
                              [g.id]: v[g.id].filter((_, j) => j !== i),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="top-actions">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setTierDraft((v) => ({
                            ...v,
                            [g.id]: [
                              ...(v[g.id] || []),
                              {
                                name: `Tier ${(v[g.id] || []).length + 1}`,
                                xp: "",
                                prize: "",
                              },
                            ],
                          }))
                        }
                      >
                        Add tier
                      </Button>
                      <Button
                        icon={Save}
                        onClick={async () => {
                          try {
                            const tiers = (tierDraft[g.id] || [])
                              .filter((x) => x.name.trim() && x.xp.trim())
                              .map((x) => ({ ...x, xp: Number(x.xp) }));
                            await api("/staff/groups/progress/", {
                              method: "POST",
                              body: JSON.stringify({ groupId: g.id, tiers }),
                            });
                            show("Group jackpot targets saved.", "success");
                            load();
                          } catch (e) {
                            show(
                              e instanceof Error
                                ? e.message
                                : "Unable to save targets",
                              "error",
                            );
                          }
                        }}
                      >
                        Save targets
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="null-card">
          <Users size={26} />
          <strong>{query ? "No matching groups" : "No groups yet"}</strong>
          <p>
            {query
              ? "Try another search."
              : "Create a group above to start organising young people."}
          </p>
        </div>
      )}
    </div>
  );
}
