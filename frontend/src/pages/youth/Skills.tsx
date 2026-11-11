import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyCard } from "../../components/EmptyCard";
import { Card, Progress, Pill, Button } from "../../components/ui";
import { CheckCircle2, Target, ExternalLink, Save } from "lucide-react";
export function Skills() {
  const [d, setD] = useState<any[]>([]);
  const [values, setValues] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const load = () =>
    api<{ items: any[] }>("/skills/")
      .then((x) => {
        setD(x.items || []);
        setValues(
          Object.fromEntries(
            (x.items || []).map((s: any) => [s.id, Number(s.progress || 0)]),
          ),
        );
      })
      .catch(() => setD([]));
  useEffect(() => {
    void load();
  }, []);
  async function save(s: any) {
    setBusy(s.id);
    setMsg((m) => ({ ...m, [s.id]: "" }));
    try {
      const r = await api<any>("/skills/progress/", {
        method: "POST",
        body: JSON.stringify({
          skillId: s.id,
          progress: Number(values[s.id] || 0),
        }),
      });
      setMsg((m) => ({
        ...m,
        [s.id]: (r.awarded || []).length
          ? `Progress saved — ${(r.awarded || []).map((x: any) => `${x.name}: +${x.xp} XP`).join(", ")}`
          : "Progress saved for your youth worker to review.",
      }));
      await load();
    } catch (e) {
      setMsg((m) => ({
        ...m,
        [s.id]: (e as Error).message || "Could not save progress",
      }));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">GROW</span>
          <h2>Skill trail</h2>
          <p>
            Build skills that travel with you. Update your progress as you go.
          </p>
        </div>
      </div>
      <div className="skill-map">
        {d.length === 0 ? (
          <EmptyCard
            icon={Target}
            title="Your skill trail is ready to grow"
            body="Skills will appear here when your programme assigns them to you."
          />
        ) : (
          d.map((s, i) => (
            <Card key={s.id} className="skill-node">
              <div className="node-number">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="section-head">
                <div>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  {s.activity_url && (
                    <a
                      href={s.activity_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 8,
                      }}
                    >
                      Open activity <ExternalLink size={15} />
                    </a>
                  )}
                </div>
                {s.completed && <Pill icon={CheckCircle2}>Complete</Pill>}
              </div>
              <Progress
                value={s.progress || 0}
                label={`${s.progress || 0}% complete · ${s.xp_reward} XP base`}
              />
              <div className="skill-milestones">
                {(s.milestones || []).map((m: any, i: number) => (
                  <div
                    className={
                      (s.completedMilestones || []).includes(m.id)
                        ? "skill-milestone complete"
                        : "skill-milestone"
                    }
                    key={m.id || i}
                  >
                    <strong>{m.name}</strong>
                    <span>
                      {m.progress || 0}% · +{m.xp || 0} XP
                    </span>
                    {m.reward && <small>{m.reward}</small>}
                  </div>
                ))}
              </div>
              {!s.completed && (
                <div className="skill-progress-update">
                  <label>
                    My progress{" "}
                    <strong>{values[s.id] ?? s.progress ?? 0}%</strong>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={values[s.id] ?? s.progress ?? 0}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [s.id]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <Button
                    icon={Save}
                    disabled={busy === s.id}
                    onClick={() => save(s)}
                  >
                    {busy === s.id ? "Saving…" : "Update progress"}
                  </Button>
                  {msg[s.id] && (
                    <p className="muted" role="status">
                      {msg[s.id]}
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
