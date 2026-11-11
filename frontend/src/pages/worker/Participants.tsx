import { useEffect, useRef, useState } from "react";
import { api, apiForm } from "../../api";
import { t } from "../../i18n";
import { Card } from "../../components/ui";
import { MilestoneAvatar } from "../../components/MilestoneAvatar";
import { Users, Upload } from "lucide-react";
const avatars = ["orbit", "comet", "rocket", "star", "moon", "wave"];
export function Participants() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [fileBusy, setFileBusy] = useState<number | null>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  useEffect(() => {
    api<any>("/worker/participants/")
      .then((r) => setItems(r.items || []))
      .catch(() => {});
  }, []);
  async function save(id: number, avatar: string) {
    setBusy(id);
    try {
      const r = await api<any>("/worker/avatar/", {
        method: "POST",
        body: JSON.stringify({ profileId: id, avatar }),
      });
      setItems((x) =>
        x.map((p) =>
          p.id === id
            ? {
                ...p,
                avatar: r.avatar,
                avatarImageUrl: null,
                milestoneTier: r.milestoneTier,
                milestoneColor: r.milestoneColor,
              }
            : p,
        ),
      );
    } finally {
      setBusy(null);
    }
  }
  async function upload(id: number, file?: File) {
    if (!file) return;
    setMessage("");
    setFileBusy(id);
    try {
      const f = new FormData();
      f.append("profileId", String(id));
      f.append("avatar", file);
      const r = await apiForm<any>("/worker/avatar-upload/", f);
      setItems((x) =>
        x.map((p) =>
          p.id === id
            ? {
                ...p,
                avatarImageUrl: r.avatarImageUrl,
                milestoneTier: r.milestoneTier,
                milestoneColor: r.milestoneColor,
              }
            : p,
        ),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setFileBusy(null);
    }
  }
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PEOPLE</span>
          <h2>{t("assignAvatar")}</h2>
          <p>{t("chooseAvatar")}</p>
        </div>
        <Users size={34} />
      </div>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <p className="muted avatar-validation-note">
        {t("avatarUploadValidation")}
      </p>
      <div className="participant-grid">
        {items.map((p) => (
          <Card className="participant-card avatar-picker-card" key={p.id}>
            <div className="participant-avatar-head">
              <MilestoneAvatar
                avatar={p.avatar}
                imageUrl={p.avatarImageUrl}
                tier={p.milestoneTier}
                color={p.milestoneColor}
                size="md"
              />
              <strong>{p.gamertag}</strong>
              <div className="muted">
                {p.xp} XP · {t(p.milestoneTier as any)}
              </div>
            </div>
            <div className="avatar-choice-grid">
              {avatars.map((a) => (
                <button
                  type="button"
                  className={`avatar-choice ${p.avatar === a && !p.avatarImageUrl ? "selected" : ""}`}
                  key={a}
                  onClick={() => save(p.id, a)}
                  disabled={busy === p.id || fileBusy === p.id}
                >
                  <MilestoneAvatar
                    avatar={a}
                    tier={p.milestoneTier}
                    color={p.milestoneColor}
                    size="sm"
                  />
                  <span>{a}</span>
                </button>
              ))}
              <button
                type="button"
                className="avatar-choice upload-avatar-button"
                onClick={() => inputRefs.current[p.id]?.click()}
                disabled={fileBusy === p.id || busy === p.id}
              >
                <Upload size={18} />
                <span>{fileBusy === p.id ? "Uploading…" : "Upload"}</span>
              </button>
              <input
                ref={(el) => {
                  inputRefs.current[p.id] = el;
                }}
                hidden
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  upload(p.id, f);
                }}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
