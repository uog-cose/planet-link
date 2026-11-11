import { useEffect, useState } from "react";
import { Check, MessageSquare, Star, X, Inbox } from "lucide-react";
import { api } from "../../api";
import { Button } from "../../components/ui";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { useToast } from "../../components/ToastProvider";

export function PublicPointRequests() {
  const [items, setItems] = useState<any[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const { show } = useToast();
  const load = () =>
    api<any>("/points/public-requests/")
      .then((r) => setItems(r.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  async function review(id: number, decision: "approve" | "reject") {
    const amount = amounts[id] || "";
    if (
      decision === "approve" &&
      (!/^\d+$/.test(amount) || Number(amount) < 1)
    ) {
      show("Enter the number of points to award.", "error");
      return;
    }
    setBusy(id);
    try {
      await api("/points/public-requests/review/", {
        method: "POST",
        body: JSON.stringify({
          requestId: id,
          decision,
          amount: decision === "approve" ? Number(amount) : undefined,
        }),
      });
      show(
        decision === "approve"
          ? "Public points awarded."
          : "Public feedback rejected.",
        "success",
      );
      window.dispatchEvent(new CustomEvent("yq-approval-changed"));
      load();
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Unable to review public feedback.",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }
  const pending = items.filter((x) => x.status === "pending");
  return (
    <CollapsibleCard
      title="PUBLIC POINTS"
      description="Feedback awaiting review"
      summary={pending.length ? `${pending.length} pending` : ""}
      icon={MessageSquare}
      className="public-points-queue"
    >
      <div className="section-head">
        <div>
          <span className="eyebrow">PUBLIC POINTS</span>
          <h3>Feedback awaiting review</h3>
          <p className="muted">
            Public submissions never award XP automatically. Choose the points
            after considering the rating and feedback.
          </p>
        </div>
        <MessageSquare size={22} />
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : pending.length === 0 ? (
        <div className="public-points-empty">
          <Inbox size={28} />
          <strong>No public feedback waiting</strong>
          <span className="muted">
            New public points submissions will appear here when someone sends
            feedback.
          </span>
        </div>
      ) : (
        <div className="public-request-list">
          {pending.map((x) => (
            <div className="public-request" key={x.id}>
              <div className="public-request-main">
                <div className="public-request-head">
                  <strong>{x.gamertag}</strong>
                  <span className="public-rating">
                    <Star size={15} /> {x.rating}/5
                  </span>
                </div>
                <span>
                  <b>{x.name}</b>
                  {x.organisation ? ` · ${x.organisation}` : ""}
                </span>
                {x.comment && <p>“{x.comment}”</p>}
                <small className="muted">
                  {new Date(x.createdAt).toLocaleString()}
                </small>
              </div>
              <div className="public-request-actions">
                <label>
                  <span>Points to award</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={amounts[x.id] || ""}
                    onChange={(e) =>
                      setAmounts({
                        ...amounts,
                        [x.id]: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    placeholder="e.g. 10"
                  />
                </label>
                <div className="public-request-buttons">
                  <Button
                    icon={Check}
                    disabled={busy === x.id}
                    onClick={() => review(x.id, "approve")}
                  >
                    Award
                  </Button>
                  <Button
                    variant="secondary"
                    icon={X}
                    disabled={busy === x.id}
                    onClick={() => review(x.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
