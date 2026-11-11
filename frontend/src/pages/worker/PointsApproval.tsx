import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { Button, Card, Pill, ConfirmDialog } from "../../components/ui";
import { SearchSelect } from "../../components/SearchSelect";
import { MultiSearchSelect } from "../../components/MultiSearchSelect";
import {
  CheckCircle2,
  MinusCircle,
  PlusCircle,
  Clock3,
  XCircle,
} from "lucide-react";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { useToast } from "../../components/ToastProvider";
import { PublicPointRequests } from "./PublicPointRequests";

export function PointsApproval({ role }: { role: "worker" | "admin" }) {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [d, setD] = useState<any>({
    participants: [],
    groups: [],
    requests: [],
  });
  const [f, setF] = useState({
    profileId: "",
    profileIds: [] as string[],
    amount: 50,
    reason: "Completed activity",
  });
  const [awardGroupId, setAwardGroupId] = useState("");
  const [pen, setPen] = useState({
    profileId: "",
    groupId: "",
    amount: 10,
    reason: "Penalty",
  });
  const [confirmGroup, setConfirmGroup] = useState<any>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { show } = useToast();

  const load = async () => {
    const requestsPromise = api<any>("/points/awards/");
    if (role === "admin") {
      const [p, r] = await Promise.all([
        api<any>("/worker/participants/"),
        requestsPromise,
      ]);
      setD({
        participants: p.items || [],
        groups: p.groups || [],
        requests: r.items || [],
      });
    } else {
      const [p, r] = await Promise.all([
        api<any>("/worker/participants/"),
        requestsPromise,
      ]);
      setD({
        participants: p.items || [],
        groups: p.groups || [],
        requests: r.items || [],
      });
    }
  };

  useEffect(() => {
    void load();
    if (token) {
      api<any>(`/points/scan-info/?token=${encodeURIComponent(token)}`)
        .then((x) =>
          setF((v) => ({
            ...v,
            profileId: String(x.profileId),
            profileIds: [String(x.profileId)],
          })),
        )
        .catch(() => {});
    }
    const refresh = () => {
      void load();
    };
    window.addEventListener("yq-approval-changed", refresh);
    window.addEventListener("yq-notification-received", refresh);
    return () => {
      window.removeEventListener("yq-approval-changed", refresh);
      window.removeEventListener("yq-notification-received", refresh);
    };
  }, [role, token]);

  async function award() {
    if (!awardGroupId && !f.profileIds.length && !f.profileId) {
      show(
        "Choose a group or at least one young person before awarding points.",
        "error",
      );
      return;
    }
    if (!Number.isFinite(Number(f.amount)) || Number(f.amount) < 1) {
      show("Enter a points amount greater than zero.", "error");
      return;
    }
    if (!f.reason.trim()) {
      show("Add a reason so the points change can be recorded.", "error");
      return;
    }
    try {
      const payload: any = { amount: f.amount, reason: f.reason, token };
      if (awardGroupId) payload.groupId = Number(awardGroupId);
      if (f.profileIds.length) payload.profileIds = f.profileIds;
      else payload.profileId = f.profileId;
      if (awardGroupId) {
        setConfirmGroup({
          groupId: Number(awardGroupId),
          amount: f.amount,
          reason: f.reason,
          count: d.groups.find(
            (g: any) => String(g.id) === String(awardGroupId),
          )?.memberCount,
        });
        return;
      }
      const r = await api<any>("/points/awards/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const pending =
        r.status === "pending" ||
        (r.results || []).some((x: any) => x.status === "pending");
      const message =
        r.status === "bulk"
          ? `${Number(r.updatedCount ?? (r.results || []).length)} young people ${pending ? "submitted for approval." : "updated."}`
          : r.status === "pending"
            ? "Points request submitted for admin approval."
            : `${r.gamertag}: ${r.newXp} XP`;
      show(message, pending ? "info" : "success");
      window.dispatchEvent(new CustomEvent("yq-approval-changed"));
      void load();
    } catch (e) {
      show((e as Error).message, "error");
    }
  }

  async function executeGroup() {
    if (!confirmGroup) return;
    try {
      const r = await api<any>("/points/awards/", {
        method: "POST",
        body: JSON.stringify({
          groupId: confirmGroup.groupId,
          amount: confirmGroup.amount,
          reason: confirmGroup.reason,
        }),
      });
      const pending = (r.results || []).some(
        (x: any) => x.status === "pending",
      );
      show(
        `${Number(r.updatedCount ?? (r.results || []).length)} young people ${pending ? "submitted for approval." : "updated."}`,
        pending ? "info" : "success",
      );
      window.dispatchEvent(new CustomEvent("yq-approval-changed"));
      void load();
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setConfirmGroup(null);
    }
  }

  async function penalty() {
    if (!pen.groupId && !pen.profileId) {
      show("Choose a group or young person before removing points.", "error");
      return;
    }
    if (!Number.isFinite(Number(pen.amount)) || Number(pen.amount) < 1) {
      show("Enter a points amount greater than zero.", "error");
      return;
    }
    if (!pen.reason.trim()) {
      show("Add a reason so the removal can be recorded.", "error");
      return;
    }
    try {
      const payload: any = { amount: pen.amount, reason: pen.reason };
      if (pen.groupId) payload.groupId = Number(pen.groupId);
      else payload.profileId = Number(pen.profileId);
      const r = await api<any>("/points/penalty/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      show(
        r.status === "bulk"
          ? `${Number(r.updatedCount ?? (r.results || []).length)} young people affected by this removal.`
          : `${r.gamertag}: ${r.newXp} XP after penalty`,
        "success",
      );
      void load();
    } catch (e) {
      show((e as Error).message, "error");
    }
  }

  async function review(
    requestId: number,
    decision: "approve" | "reject",
    reason = "",
  ) {
    try {
      await api("/points/awards/review/", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          decision,
          ...(decision === "reject" ? { reason } : {}),
        }),
      });
      setRejecting(null);
      setRejectReason("");
      window.dispatchEvent(new CustomEvent("yq-approval-changed"));
      void load();
      show(
        decision === "approve"
          ? "Points request approved."
          : "Points request rejected and the reason was sent to the youth worker.",
        "success",
      );
    } catch (e) {
      show((e as Error).message, "error");
    }
  }

  const pending = d.requests.filter((x: any) => x.status === "pending");

  return (
    <div className="page points-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">POINTS</span>
          <h2>
            {role === "admin"
              ? "Points approvals & awards"
              : "Award or remove XP"}
          </h2>
          <p>
            {role === "admin"
              ? "Review requests from youth workers and manage XP awards."
              : "Every points change is recorded. Requests above your limit stay here until an admin decides."}
          </p>
        </div>
        <PlusCircle size={34} />
      </div>

      <PublicPointRequests />

      {role === "worker" && (
        <CollapsibleCard
          title="My pending requests"
          description="Points above your worker limit are waiting for an admin."
          summary={`${pending.length} pending`}
          icon={Clock3}
          className="worker-points-requests-card tone-sun"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">ADMIN REVIEW</span>
              <h3>
                {pending.length
                  ? `${pending.length} request${pending.length === 1 ? "" : "s"} still pending`
                  : "Nothing waiting"}
              </h3>
              <p className="muted">
                You can continue working while these are reviewed.
              </p>
            </div>
            <Pill>{pending.length} pending</Pill>
          </div>
          <div className="points-request-list">
            {pending.length ? (
              pending.map((x: any) => (
                <div className={`points-request-row pending`} key={x.id}>
                  <div>
                    <strong>
                      {x.gamertag} · +{x.amount} XP
                    </strong>
                    <small>
                      {x.reason} · submitted{" "}
                      {new Date(x.createdAt).toLocaleString()}
                    </small>
                  </div>
                  <Pill icon={Clock3}>Pending</Pill>
                </div>
              ))
            ) : (
              <p className="muted">No pending points requests.</p>
            )}
          </div>
        </CollapsibleCard>
      )}

      {role === "admin" && (
        <CollapsibleCard
          title="Point approvals"
          description="Awards above the configured worker limit."
          summary={`${pending.length} pending`}
          icon={CheckCircle2}
          className="admin-approval-card tone-mint"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">APPROVAL QUEUE</span>
              <h3>Requests waiting for your decision</h3>
              <p className="muted">
                Rejecting a request requires a reason, which is shown to the
                youth worker in a popup.
              </p>
            </div>
            <Pill>{pending.length} pending</Pill>
          </div>
          <div className="points-request-list">
            {pending.length ? (
              pending.map((x: any) => (
                <div className="points-request-row pending" key={x.id}>
                  <div>
                    <strong>
                      {x.gamertag} · +{x.amount} XP
                    </strong>
                    <small>
                      {x.reason} · requested by {x.requestedBy}
                    </small>
                  </div>
                  <div className="top-actions">
                    <Button
                      icon={CheckCircle2}
                      onClick={() => void review(x.id, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      icon={XCircle}
                      onClick={() => {
                        setRejecting(x);
                        setRejectReason("");
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No point awards are waiting for approval.</p>
            )}
          </div>
        </CollapsibleCard>
      )}

      <div className="points-action-grid">
        <CollapsibleCard
          title="Award points"
          description="Add XP to a young person's account."
          icon={PlusCircle}
        >
          {token && f.profileId && (
            <div className="qr-target-banner">
              <strong>QR player identified:</strong>{" "}
              {d.participants.find(
                (x: any) => String(x.id) === String(f.profileId),
              )?.gamertag || "Young person"}
            </div>
          )}
          <div className="grid-2">
            <div>
              <SearchSelect
                label="Group"
                value={awardGroupId}
                onChange={(v) => {
                  if (v) {
                    setAwardGroupId(v);
                    setF({ ...f, profileIds: [], profileId: "" });
                  } else setAwardGroupId("");
                }}
                placeholder="Choose an entire group"
                searchPlaceholder="Search groups…"
                options={d.groups.map((x: any) => ({
                  value: x.id,
                  label: x.name,
                }))}
              />
              <MultiSearchSelect
                label="Young people"
                values={f.profileIds}
                onChange={(v) => {
                  setAwardGroupId("");
                  setF({
                    ...f,
                    profileIds: v,
                    profileId: v.length === 1 ? v[0] : "",
                  });
                }}
                placeholder="Choose players"
                searchPlaceholder="Search young people…"
                options={(Array.isArray(d.participants)
                  ? d.participants
                  : []
                ).map((x: any) => ({
                  value: x.id,
                  label: x.gamertag,
                  meta: `${x.xp} XP`,
                }))}
              />
              <label>
                Points
                <input
                  type="number"
                  min="1"
                  value={f.amount}
                  onChange={(e) =>
                    setF({ ...f, amount: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Reason
                <input
                  value={f.reason}
                  onChange={(e) => setF({ ...f, reason: e.target.value })}
                />
              </label>
              <Button icon={PlusCircle} onClick={award}>
                Award points
              </Button>
            </div>
          </div>
        </CollapsibleCard>
        <CollapsibleCard
          title="Remove points"
          description="Subtract XP when a correction or penalty is required."
          icon={MinusCircle}
        >
          <div className="grid-2">
            <div>
              <SearchSelect
                label="Group (optional)"
                value={pen.groupId}
                onChange={(v) => setPen({ ...pen, groupId: v, profileId: "" })}
                placeholder="Choose group"
                searchPlaceholder="Search groups…"
                options={d.groups.map((x: any) => ({
                  value: x.id,
                  label: x.name,
                }))}
              />
              <SearchSelect
                label="Young person"
                value={pen.profileId}
                onChange={(v) => setPen({ ...pen, profileId: v, groupId: "" })}
                placeholder="Choose"
                searchPlaceholder="Search young person…"
                options={(Array.isArray(d.participants)
                  ? d.participants
                  : []
                ).map((x: any) => ({
                  value: x.id,
                  label: x.gamertag,
                  meta: `${x.xp} XP`,
                }))}
              />
              <label>
                Remove points
                <input
                  type="number"
                  min="1"
                  value={pen.amount}
                  onChange={(e) =>
                    setPen({ ...pen, amount: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Reason
                <input
                  value={pen.reason}
                  onChange={(e) => setPen({ ...pen, reason: e.target.value })}
                />
              </label>
              <Button variant="secondary" icon={MinusCircle} onClick={penalty}>
                Remove points
              </Button>
            </div>
          </div>
        </CollapsibleCard>
      </div>

      <ConfirmDialog
        open={confirmGroup != null}
        title="Award points to entire group?"
        body={
          confirmGroup
            ? `${confirmGroup.count ?? "All"} young people in this group will receive +${confirmGroup.amount} XP. This action is applied to each active member individually.`
            : ""
        }
        confirmLabel="Award to group"
        onConfirm={executeGroup}
        onCancel={() => setConfirmGroup(null)}
      />

      {rejecting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <Card className="deletion-reason-modal">
            <div className="section-head">
              <div>
                <span className="eyebrow">POINTS REQUEST</span>
                <h3>Why are you rejecting this request?</h3>
                <p className="muted">
                  {rejecting.gamertag} will see this reason in a popup.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setRejecting(null)}>
                Close
              </Button>
            </div>
            <label>
              Reason
              <textarea
                autoFocus
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain what needs to change before they request again…"
              />
            </label>
            <div className="top-actions">
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                disabled={!rejectReason.trim()}
                onClick={() =>
                  void review(rejecting.id, "reject", rejectReason.trim())
                }
              >
                Reject request
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
