import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Button, Card, Pill } from "../../components/ui";
import {
  Gamepad2,
  MapPinned,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  BarChart3,
  Users,
  Activity,
} from "lucide-react";
import { EventMap } from "../../components/EventMap";
import { Loading } from "../../components/feedback/Loading";
import { CollapsibleCard } from "../../components/CollapsibleCard";

export function Admin() {
  const [d, setD] = useState<any>();
  const [deletions, setDeletions] = useState<any[]>([]);
  const [rejecting, setRejecting] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const load = async () => {
    const [a, del] = await Promise.all([
      api<any>("/admin/overview/"),
      api<any>("/admin/account-deletions/"),
    ]);
    setD(a);
    setDeletions(del.items || []);
  };
  useEffect(() => {
    load();
  }, []);
  if (!d) return <Loading />;
  const event = d.currentEvent || d.nextEvent || d.lastEvent;
  const metrics = [
    {
      label: "Participants",
      value: Number(d.participants || 0).toLocaleString(),
      icon: Users,
    },
    {
      label: "Collective XP",
      value: Number(d.collectiveXp || 0).toLocaleString(),
      icon: Activity,
    },
    {
      label: "Active challenges",
      value: Number(d.activeChallenges || 0).toLocaleString(),
      icon: Gamepad2,
    },
    {
      label: "Attendance today",
      value: Number(d.attendanceToday || 0).toLocaleString(),
      icon: CheckCircle2,
    },
  ];
  return (
    <div className="page admin-dashboard-page">
      <section className="dashboard-command-hero admin-command-hero">
        <div>
          <span className="eyebrow">CONTROL ROOM</span>
          <h2>{d.programme?.name || "Programme overview"}</h2>
          <p className="muted">
            {d.programme?.location ||
              "Programme operations, approvals and configuration."}
          </p>
        </div>
        <div className="dashboard-command-actions">
          <Pill icon={ShieldCheck}>Audit ready</Pill>
          <Link className="button primary" to="/admin/stats">
            Open stats <BarChart3 size={17} />
          </Link>
        </div>
      </section>
      <section className="metric-grid dashboard-metric-grid">
        {metrics.map(({ label, value, icon: Icon }, i) => (
          <Card
            className={`dashboard-metric tone-${["mint", "sun", "lilac", "aqua"][i]} stats-metric-${i + 1}`}
            key={label}
          >
            <span className="metric-icon">
              <Icon size={20} />
            </span>
            <span className="eyebrow">{label}</span>
            <strong className="metric">{value}</strong>
          </Card>
        ))}
      </section>

      <CollapsibleCard
        title="What needs attention"
        description="Live work waiting for an admin decision"
        summary={`${(d.needsAttention?.deletionRequests || 0) + (d.needsAttention?.gamesEndingSoon || 0) + (d.needsAttention?.upcomingGames || 0)} items`}
        icon={AlertTriangle}
        className="admin-attention-panel tone-sun"
      >
        <div className="section-head">
          <div>
            <span className="eyebrow">OPERATIONS</span>
            <h3>What needs attention</h3>
            <p className="muted">
              A live view of work waiting for an admin decision.
            </p>
          </div>
          <AlertTriangle size={23} />
        </div>
        <div className="attention-grid">
          {[
            ["Deletion requests", d.needsAttention?.deletionRequests || 0],
            ["Games ending soon", d.needsAttention?.gamesEndingSoon || 0],
            ["Upcoming games", d.needsAttention?.upcomingGames || 0],
          ].map(([label, value]) => (
            <div className="admin-attention-tile" key={String(label)}>
              <strong>{Number(value).toLocaleString()}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      {(d.needsAttention?.players || []).length > 0 && (
        <CollapsibleCard
          title="People who may need a check-in"
          description="Attendance and recent-points flags"
          summary={`${d.needsAttention.players.length} people`}
          icon={Users}
          className="admin-followup-card tone-aqua"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">PLAYER FOLLOW-UP</span>
              <h3>People who may need a check-in</h3>
              <p className="muted">
                These flags come from the configured attendance and
                recent-points windows.
              </p>
            </div>
            <Users size={22} />
          </div>
          {(Array.isArray(d.needsAttention?.players)
            ? d.needsAttention.players
            : []
          ).map((x: any) => (
            <div className="worker-list-row" key={x.id}>
              <span className="worker-list-avatar">
                {x.gamertag?.[0] || "?"}
              </span>
              <div>
                <strong>{x.gamertag}</strong>
                <small>
                  {(Array.isArray(x.reasons) ? x.reasons : [])
                    .map((r: string) =>
                      r === "attendance"
                        ? "Attendance overdue"
                        : "No recent points",
                    )
                    .join(" · ")}
                </small>
              </div>
              <Pill>{x.streak || 0} day streak</Pill>
            </div>
          ))}
        </CollapsibleCard>
      )}

      <section className="admin-work-grid">
        {deletions.length > 0 && (
          <CollapsibleCard
            title="Deletion requests"
            description="Account removal decisions"
            summary={`${deletions.length} pending`}
            icon={Trash2}
            className="admin-deletion-card tone-lilac"
          >
            <div className="section-head">
              <div>
                <span className="eyebrow">ACCOUNT REQUESTS</span>
                <h3>Deletion requests</h3>
              </div>
              <Pill>{deletions.length} pending</Pill>
            </div>
            {deletions.map((x) => (
              <div className="admin-review-row" key={x.id}>
                <div>
                  <strong>{x.gamertag}</strong>
                  <small>{x.user__username}</small>
                </div>
                <div className="top-actions">
                  <Button
                    icon={Trash2}
                    className="delete-action"
                    onClick={async () => {
                      await api("/admin/account-deletions/", {
                        method: "POST",
                        body: JSON.stringify({
                          profileId: x.id,
                          action: "approve",
                        }),
                      });
                      window.dispatchEvent(
                        new CustomEvent("yq-approval-changed"),
                      );
                      load();
                    }}
                  >
                    Approve delete
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setRejecting(x);
                      setRejectReason("");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CollapsibleCard>
        )}
      </section>

      {event && (
        <CollapsibleCard
          title={event.title}
          description="Event space and map"
          summary={event.locationName || "Current event"}
          icon={MapPinned}
          className="admin-event-card admin-event-card-new tone-aqua"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">EVENT SPACE</span>
              <h3>{event.title}</h3>
              <p className="muted">Visible to signed-in staff.</p>
            </div>
            <MapPinned size={23} />
          </div>
          <EventMap
            value={event}
            events={d.events || []}
            onDirections={() =>
              event.directionsUrl &&
              window.open(event.directionsUrl, "_blank", "noopener,noreferrer")
            }
          />
        </CollapsibleCard>
      )}

      {rejecting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <Card className="deletion-reason-modal">
            <div className="section-head">
              <div>
                <span className="eyebrow">ACCOUNT REQUEST</span>
                <h3>Why are you rejecting this?</h3>
                <p className="muted">The young person will see this reason.</p>
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
                placeholder="Explain what they need to do next…"
              />
            </label>
            <div className="top-actions">
              <Button variant="secondary" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button
                disabled={!rejectReason.trim()}
                onClick={async () => {
                  await api("/admin/account-deletions/", {
                    method: "POST",
                    body: JSON.stringify({
                      profileId: rejecting.id,
                      action: "reject",
                      reason: rejectReason.trim(),
                    }),
                  });
                  setRejecting(null);
                  window.dispatchEvent(new CustomEvent("yq-approval-changed"));
                  load();
                }}
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
