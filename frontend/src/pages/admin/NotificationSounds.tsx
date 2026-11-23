import { useEffect, useState } from "react";
import { api, apiForm } from "../../api";
import { Button, Card, Pill } from "../../components/ui";
import { Bell, Trash2, Upload } from "lucide-react";
export function NotificationSounds() {
  const [items, setItems] = useState<any[]>([]);
  const [category, setCategory] = useState("positive");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<any>("/notifications/sounds/")
      .then((r) => setItems(r.items || []))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const f = new FormData();
      f.append("file", file);
      f.append("category", category);
      f.append("name", name || file.name);
      await apiForm("/notifications/sounds/", f);
      setFile(null);
      setName("");
      setMsg("Sound uploaded.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    await api("/notifications/sounds/", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    load();
  }
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">NOTIFICATION AUDIO</span>
          <h2>Custom notification sounds</h2>
          <p>
            Default sounds stay available. Uploaded sounds are selected randomly
            within their category.
          </p>
        </div>
        <Bell size={34} />
      </div>
      <Card>
        <h3>Upload a sound</h3>
        <p className="muted">Maximum 1.5 MB. WAV, MP3, OGG or WebM.</p>
        <div className="grid-2">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bravo 1"
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="positive">Positive point</option>
              <option value="negative">Negative point</option>
              <option value="bravo">Bravo — games</option>
              <option value="motivation">Motivation — games</option>
            </select>
          </label>
          <label>
            Audio file
            <input
              type="file"
              accept="audio/wav,audio/x-wav,audio/mpeg,audio/ogg,audio/webm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>
        <Button icon={Upload} disabled={busy || !file} onClick={upload}>
          {busy ? "Uploading…" : "Upload sound"}
        </Button>
        {msg && (
          <p className="muted" role="status">
            {msg}
          </p>
        )}
      </Card>
      <Card>
        <h3>Your uploaded sounds</h3>
        {items.length ? (
          <div className="activity-list">
            {items.map((x) => (
              <div className="activity" key={x.id}>
                <div>
                  <strong>{x.name}</strong>
                  <span>{x.category}</span>
                </div>
                <Pill>{x.category}</Pill>
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Delete ${x.name}`}
                  onClick={() => remove(x.id)}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            No custom sounds yet. Youth Quest will use its bundled defaults.
          </p>
        )}
      </Card>
    </div>
  );
}
