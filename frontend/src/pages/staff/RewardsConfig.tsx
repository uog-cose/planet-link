import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { CalendarField } from "../../components/CalendarField";
import {
  Button,
  Card,
  ConfirmDialog,
  Pill,
  PlayerListDialog,
} from "../../components/ui";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { SearchSelect } from "../../components/SearchSelect";
import { useToast } from "../../components/ToastProvider";
import {
  Gift,
  Plus,
  Trash2,
  Save,
  Users,
  PackageCheck,
  Clock3,
} from "lucide-react";

type Award = {
  name: string;
  type: "xp" | "physical" | "voucher" | "other";
  value: string;
  quantity: number;
  remaining?: number;
  weightage: number;
  available: boolean;
};
const blank = (): Award => ({
  name: "",
  type: "physical",
  value: "",
  quantity: 1,
  weightage: 1,
  available: true,
});
const localDateTime = (offsetMs = 0) => {
  const d = new Date(Date.now() + offsetMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const draft = () => ({
  name: "",
  description: "",
  startAt: "NOW",
  endAt: localDateTime(86400000),
  fallbackXp: 0,
  awards: [blank()] as Award[],
});
const normalize = (a: any): Award => ({
  name: String(a.name || ""),
  type: a.type || (Number(a.xp || 0) > 0 ? "xp" : "physical"),
  value: String(a.value ?? a.xp ?? ""),
  quantity: Math.max(1, Number(a.quantity) || 1),
  remaining:
    a.remaining == null
      ? Math.max(1, Number(a.quantity) || 1)
      : Math.max(0, Number(a.remaining) || 0),
  weightage: Math.max(1, Number(a.weightage ?? a.weight ?? 1) || 1),
  available: a.available !== false,
});
export function RewardsConfig({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<any[]>([]),
    [groups, setGroups] = useState<any[]>([]),
    [youth, setYouth] = useState<any[]>([]),
    [assignments, setAssignments] = useState<any[]>([]),
    [fulfillments, setFulfillments] = useState<any[]>([]),
    [f, setF] = useState<any>(draft()),
    [query, setQuery] = useState(""),
    [confirm, setConfirm] = useState<any>(null),
    [saving, setSaving] = useState(false),
    [editingId, setEditingId] = useState<number | null>(null),
    [playerDialog, setPlayerDialog] = useState<any>(null),
    [dialogPlayers, setDialogPlayers] = useState<string[]>([]),
    [dialogLoading, setDialogLoading] = useState(false);
  const { show } = useToast();
  const load = () =>
    api<any>("/staff/rewards/")
      .then((r) => {
        setItems(r.items || []);
        setGroups(r.groups || []);
        setYouth(r.youth || []);
        setAssignments(r.assignments || []);
        setFulfillments(r.fulfillments || []);
      })
      .catch((e) =>
        show(
          e instanceof Error ? e.message : "Unable to load scratch cards",
          "error",
        ),
      );
  useEffect(() => {
    load();
  }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? items.filter((x) =>
          `${x.name} ${x.description || ""}`.toLowerCase().includes(q),
        )
      : items;
  }, [items, query]);
  const cleanNumber = (v: string) =>
    v.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
  const setAward = (i: number, k: string, v: any) =>
    setF((x: any) => ({
      ...x,
      awards: x.awards.map((a: any, j: number) =>
        j === i ? { ...a, [k]: v } : a,
      ),
    }));
  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...f,
        action: editingId ? "update" : undefined,
        rewardId: editingId || undefined,
        fallbackXp: Math.max(0, Number(f.fallbackXp) || 0),
        awards: f.awards
          .filter((a: any) => a.name.trim())
          .map((a: any) => ({
            ...a,
            value:
              a.type === "xp"
                ? String(Math.max(0, Number(a.value) || 0))
                : a.value,
          })),
      };
      await api("/staff/rewards/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      show(
        editingId ? "Scratch card reconfigured" : "Scratch card saved",
        "success",
      );
      setF(draft());
      setEditingId(null);
      await load();
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Unable to save scratch card",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }
  async function loadAssignmentPlayers() {
    if (!playerDialog?.assignmentId) return;
    setDialogLoading(true);
    try {
      const r = await api<any>("/staff/rewards/", {
        method: "POST",
        body: JSON.stringify({
          action: "assignment_players",
          assignmentId: playerDialog.assignmentId,
        }),
      });
      setDialogPlayers(r.players || []);
    } catch (e) {
      show(e instanceof Error ? e.message : "Unable to load players", "error");
    } finally {
      setDialogLoading(false);
    }
  }
  async function action(body: any, message: string) {
    try {
      const r = await api<any>("/staff/rewards/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const detail =
        body.action === "assign" &&
        body.targetType === "group" &&
        r.updatedCount != null
          ? `${message}: ${r.updatedCount} young people updated.`
          : message;
      show(detail, "success");
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : "Action failed", "error");
    }
  }
  return (
    <div
      className={`worker-config-page scratch-cards-page ${embedded ? "embedded" : ""}`}
    >
      {!embedded && (
        <div className="page-title scratch-card-page-title">
          <div>
            <span className="eyebrow">REWARD DESIGN</span>
            <h2>Scratch cards</h2>
            <p>
              Configure anything a young person can reveal — XP, pizza,
              vouchers, experiences or other prizes.
            </p>
          </div>
          <img
            src="/quest-media/themes/rewards/scratch-card.svg"
            alt=""
            aria-hidden="true"
          />
        </div>
      )}
      <CollapsibleCard
        title={editingId ? "Reconfigure scratch card" : "Create scratch card"}
        description="A prize does not need to contain XP."
        icon={Gift}
        defaultOpen={false}
      >
        <div className="scratch-design-hint">
          <img src="/quest-media/themes/rewards/trophy.png" alt="" />
          <img src="/quest-media/themes/rewards/medal.png" alt="" />
          <img src="/quest-media/themes/rewards/star.png" alt="" />
          <span>Mix XP, badges, vouchers and real-world surprises.</span>
        </div>
        <div className="grid-2">
          <label>
            Card name
            <input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Friday Quest Prize"
            />
          </label>
          <label>
            Description
            <input
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>
          <CalendarField
            label="Starts"
            value={f.startAt}
            onChange={(v) => setF({ ...f, startAt: v })}
            allowPast={Boolean(editingId)}
          />
          <CalendarField
            label="Ends"
            value={f.endAt}
            onChange={(v) => setF({ ...f, endAt: v })}
            allowPast={Boolean(editingId)}
          />
          <label>
            Fallback XP
            <input
              type="number"
              min="0"
              value={f.fallbackXp}
              onChange={(e) =>
                setF({
                  ...f,
                  fallbackXp:
                    e.target.value === ""
                      ? ""
                      : Number(cleanNumber(e.target.value)),
                })
              }
            />
            <small className="muted">
              Optional. Set 0 if the card must only contain physical/other
              prizes.
            </small>
          </label>
          <div />
        </div>
        <div className="section-head">
          <div>
            <h3>Possible prizes</h3>
            <p className="muted">
              Weighted selection is applied only while a prize has stock
              remaining.
            </p>
          </div>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => setF({ ...f, awards: [...f.awards, blank()] })}
          >
            Add prize
          </Button>
        </div>
        {f.awards.map((a: Award, i: number) => (
          <div className="grid-4 scratch-prize-row" key={i}>
            <label>
              Prize
              <input
                value={a.name}
                onChange={(e) => setAward(i, "name", e.target.value)}
                placeholder="Pizza"
              />
            </label>
            <label>
              Type
              <select
                value={a.type}
                onChange={(e) => setAward(i, "type", e.target.value)}
              >
                <option value="physical">Physical item</option>
                <option value="voucher">Voucher</option>
                <option value="xp">XP</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              {a.type === "xp" ? "XP amount" : "Value / detail"}
              <input
                type={a.type === "xp" ? "number" : "text"}
                min="0"
                value={a.value}
                onChange={(e) =>
                  setAward(
                    i,
                    "value",
                    a.type === "xp"
                      ? cleanNumber(e.target.value)
                      : e.target.value,
                  )
                }
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                value={a.quantity}
                onChange={(e) =>
                  setAward(
                    i,
                    "quantity",
                    e.target.value === ""
                      ? ""
                      : Math.max(1, Number(cleanNumber(e.target.value)) || 1),
                  )
                }
              />
            </label>
            <label>
              Weight
              <input
                type="number"
                min="1"
                value={a.weightage}
                onChange={(e) =>
                  setAward(
                    i,
                    "weightage",
                    e.target.value === ""
                      ? ""
                      : Math.max(1, Number(cleanNumber(e.target.value)) || 1),
                  )
                }
              />
            </label>
            <Button
              variant="ghost"
              icon={Trash2}
              className="delete-action"
              onClick={() =>
                setF({
                  ...f,
                  awards: f.awards.filter((_: any, j: number) => j !== i),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="top-actions">
          {editingId && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditingId(null);
                setF(draft());
              }}
            >
              Cancel edit
            </Button>
          )}
          <Button
            icon={Save}
            disabled={
              saving || !f.name || !f.awards.some((a: any) => a.name.trim())
            }
            onClick={save}
          >
            {saving
              ? "Saving…"
              : editingId
                ? "Save changes"
                : "Save scratch card"}
          </Button>
        </div>
      </CollapsibleCard>
      <CollapsibleCard
        title="Configured scratch cards"
        description="Assign, remove and monitor cards."
        icon={Gift}
        summary={`${items.length} cards`}
      >
        <div className="account-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scratch cards…"
          />
        </div>
        <div className="scratch-config-grid">
          {filtered.map((r) => (
            <Card className="scratch-admin-card" key={r.id}>
              <div className="section-head">
                <div>
                  <h3>{r.name}</h3>
                  <p className="muted">
                    {r.description || "No description"} ·{" "}
                    {(r.awards || []).length} prize types
                  </p>
                </div>
                <div className="top-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(r.id);
                      setF({
                        name: r.name || "",
                        description: r.description || "",
                        startAt: r.start_at || "NOW",
                        endAt: r.end_at || localDateTime(86400000),
                        fallbackXp: Number(r.fallback_xp || 0),
                        awards: (r.awards || []).map(normalize),
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    className="delete-action"
                    onClick={() => setConfirm({ kind: "delete", id: r.id })}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className="reward-admin-prizes">
                {(r.awards || []).map((a: any, i: number) => (
                  <Pill key={i}>
                    {a.name}
                    {a.type && a.type !== "xp" ? ` · ${a.type}` : ""}
                    {a.type === "xp"
                      ? ` · ${a.xp || a.value || 0} XP`
                      : ""} · {a.remaining ?? a.quantity ?? 0} left
                  </Pill>
                ))}
              </div>
              <div className="grid-3 scratch-assignment-grid">
                <SearchSelect
                  label="Assign to group"
                  value=""
                  onChange={(v) =>
                    v &&
                    action(
                      {
                        action: "assign",
                        rewardId: r.id,
                        targetType: "group",
                        targetId: Number(v),
                      },
                      "Scratch card assigned",
                    )
                  }
                  options={groups.map((g) => ({ value: g.id, label: g.name }))}
                  placeholder="Choose group"
                />
                <SearchSelect
                  label="Assign to player"
                  value=""
                  onChange={(v) =>
                    v &&
                    action(
                      {
                        action: "assign",
                        rewardId: r.id,
                        targetType: "youth",
                        targetId: Number(v),
                      },
                      "Scratch card assigned",
                    )
                  }
                  options={youth.map((y) => ({
                    value: y.id,
                    label: y.gamertag,
                  }))}
                  placeholder="Choose player"
                />
                <div>
                  <span className="eyebrow">ASSIGNMENTS</span>
                  <div className="assignment-list">
                    {assignments
                      .filter((a) => a.reward_id === r.id)
                      .map((a) => {
                        const key = String(a.id);
                        const groupName = a.target_group_id
                          ? groups.find(
                              (g) => String(g.id) === String(a.target_group_id),
                            )?.name
                          : "";
                        const count = Number(a.playerCount || 1);
                        return (
                          <div className="assignment-row" key={key}>
                            <div className="assignment-summary">
                              <strong>{groupName || "Young person"}</strong>
                              <button
                                type="button"
                                className="assignment-count-button"
                                onClick={() => {
                                  setDialogPlayers([]);
                                  setPlayerDialog({
                                    assignmentId: Number(
                                      a.assignmentIds?.[0] ?? a.id,
                                    ),
                                    title: groupName || "Assigned player",
                                    count,
                                  });
                                }}
                              >
                                <Users size={14} />
                                <span>
                                  {count} {count === 1 ? "player" : "players"}
                                </span>
                              </button>
                            </div>
                            <Button
                              variant="ghost"
                              icon={Trash2}
                              className="delete-action"
                              onClick={() =>
                                action(
                                  {
                                    action: "unassign",
                                    assignmentId: Number(
                                      a.assignmentIds?.[0] ?? a.id,
                                    ),
                                  },
                                  "Assignment removed",
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CollapsibleCard>
      <CollapsibleCard
        title="Prize fulfilment"
        description="When a young person reveals a physical or other prize, hand it over and mark the transaction complete."
        icon={PackageCheck}
        summary={`${fulfillments.filter((x) => x.status === "pending").length} outstanding`}
      >
        <div className="fulfillment-list">
          {fulfillments.length ? (
            fulfillments.map((x) => (
              <div className={`fulfillment-row ${x.status}`} key={x.id}>
                <div>
                  <strong>{x.claim__award_name}</strong>
                  <span>
                    {x.claim__profile__gamertag} · {x.claim__reward__name}
                  </span>
                </div>
                <Pill icon={x.status === "fulfilled" ? PackageCheck : Clock3}>
                  {x.status === "fulfilled" ? "Completed" : "Outstanding"}
                </Pill>
                {x.status === "pending" && (
                  <Button
                    icon={PackageCheck}
                    onClick={() => setConfirm({ kind: "fulfill", id: x.id })}
                  >
                    Mark completed
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="muted">
              No revealed prizes are waiting for fulfilment.
            </p>
          )}
        </div>
      </CollapsibleCard>
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === "delete"
            ? "Delete scratch card?"
            : "Complete prize transaction?"
        }
        body={
          confirm?.kind === "delete"
            ? "This removes the card and its active assignments. Existing claim history is retained."
            : `Mark this prize as handed over. This creates an audit record.`
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : "Mark completed"}
        danger={confirm?.kind === "delete"}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await action(
            c.kind === "delete"
              ? { action: "delete", rewardId: c.id }
              : { action: "fulfill", fulfillmentId: c.id },
            c.kind === "delete"
              ? "Scratch card deleted"
              : "Prize marked completed",
          );
        }}
      />
      <PlayerListDialog
        open={!!playerDialog}
        title={playerDialog?.title || "Assigned players"}
        count={Number(playerDialog?.count || 0)}
        players={dialogPlayers}
        loading={dialogLoading}
        onLoad={loadAssignmentPlayers}
        onClose={() => {
          setPlayerDialog(null);
          setDialogPlayers([]);
        }}
      />
    </div>
  );
}
