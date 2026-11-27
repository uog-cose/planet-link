import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { t } from "../../i18n";
import { Button, Card, ConfirmDialog, Pill } from "../../components/ui";
import { SearchSelect } from "../../components/SearchSelect";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { Toast } from "../../components/Toast";
import {
  Archive,
  Building2,
  Check,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

type Instance = {
  id: number;
  name: string;
  location: string;
  active: boolean;
  status: string;
  publicEnabled: boolean;
  current: boolean;
};

type ConfirmAction = {
  kind: "create" | "hide" | "unhide" | "archive" | "delete";
  id?: number;
} | null;

export function ProgrammeInstances() {
  const [items, setItems] = useState<Instance[]>([]);
  const [newInstance, setNewInstance] = useState({
    name: "",
    location: "",
    cloneFromId: "",
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<ConfirmAction>(null);

  const load = async () => {
    setError("");
    try {
      const response = await api<any>("/admin/instances/");
      setItems(Array.isArray(response.items) ? response.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.name} ${item.location}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const cloneOptions = useMemo(
    () =>
      items
        .filter((item) => item.active && item.status === "active")
        .map((item) => ({
          value: String(item.id),
          label: `${item.name} · ${item.location}`,
        })),
    [items],
  );

  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await api<any>("/admin/instances/", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          ...newInstance,
          cloneFromId: newInstance.cloneFromId || null,
        }),
      });
      setNewInstance({ name: "", location: "", cloneFromId: "" });
      await load();
      setMessage(`${t("instanceCreated")}: ${response.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function select(id: number) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/instances/", {
        method: "POST",
        body: JSON.stringify({ action: "switch", programmeId: id }),
      });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
      setBusy(false);
    }
  }

  async function setVisibility(id: number, visible: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/instances/", {
        method: "POST",
        body: JSON.stringify({
          action: visible ? "unhide" : "hide",
          programmeId: id,
        }),
      });
      await load();
      setMessage(visible ? t("instanceUnhidden") : t("instanceHidden"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function archive(id: number) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/instances/", {
        method: "POST",
        body: JSON.stringify({ action: "archive", programmeId: id }),
      });
      await load();
      setMessage(t("instanceArchived"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError("");
    try {
      await api("/admin/instances/", {
        method: "POST",
        body: JSON.stringify({ action: "delete", programmeId: id }),
      });
      await load();
      setMessage(t("instanceDeleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorBody"));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const confirmed = confirm?.id
    ? items.find((item) => item.id === confirm.id)
    : undefined;
  const confirmTitle =
    confirm?.kind === "create"
      ? t("createInstance")
      : confirm?.kind === "archive"
        ? t("archiveInstance")
        : confirm?.kind === "delete"
          ? t("deleteInstance")
          : confirm?.kind === "hide"
            ? t("hideInstance")
            : t("unhideInstance");
  const confirmBody =
    confirm?.kind === "create"
      ? t("confirmCreateInstance")
      : confirm?.kind === "archive"
        ? t("archiveInstanceBody")
        : confirm?.kind === "delete"
          ? t("confirmDeleteInstance")
          : confirm?.kind === "hide"
            ? t("confirmHideInstance")
            : t("confirmUnhideInstance");
  const confirmLabel =
    confirm?.kind === "create"
      ? t("createInstance")
      : confirm?.kind === "archive"
        ? t("archive")
        : confirm?.kind === "delete"
          ? t("delete")
          : confirm?.kind === "hide"
            ? t("hide")
            : t("unhide");

  return (
    <div className="page programme-instances-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">
            {t("programmeInstances").toUpperCase()}
          </span>
          <h2>{t("manageProgrammeInstances")}</h2>
          <p>{t("programmeInstancesHelp")}</p>
        </div>
        <Building2 size={34} />
      </div>

      <CollapsibleCard
        title={t("createInstance")}
        description={t("createInstanceHelp")}
        icon={Plus}
        className="instance-create-card"
      >
        <div className="section-head">
          <div>
            <h3>{t("createInstance")}</h3>
            <p className="muted">{t("createInstanceHelp")}</p>
          </div>
          <Plus />
        </div>
        <div className="grid-2">
          <label>
            {t("instanceName")}
            <input
              maxLength={120}
              value={newInstance.name}
              onChange={(e) =>
                setNewInstance({ ...newInstance, name: e.target.value })
              }
            />
          </label>
          <label>
            {t("location")}
            <input
              maxLength={120}
              value={newInstance.location}
              onChange={(e) =>
                setNewInstance({ ...newInstance, location: e.target.value })
              }
            />
          </label>
        </div>
        <SearchSelect
          label={t("copyConfigurationFrom")}
          value={newInstance.cloneFromId}
          onChange={(value) =>
            setNewInstance({ ...newInstance, cloneFromId: value })
          }
          placeholder={t("startWithDefaults")}
          searchPlaceholder={t("searchInstances")}
          options={cloneOptions}
        />
        <div className="instance-create-actions">
          <Button
            icon={Copy}
            disabled={
              busy || !newInstance.name.trim() || !newInstance.location.trim()
            }
            onClick={() => setConfirm({ kind: "create" })}
          >
            {t("createInstance")}
          </Button>
        </div>
      </CollapsibleCard>

      <Card className="instances-list-card">
        <div className="section-head">
          <div>
            <h3>{t("availableInstances")}</h3>
          </div>
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {t("refresh")}
          </Button>
        </div>
        <div className="instance-management-search">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchInstances")}
            aria-label={t("searchInstances")}
          />
        </div>
        {error && (
          <div className="field-error instance-page-error" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <div className="loading-skeleton">
            <span className="skeleton-line" />
            <div className="skeleton-card" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Building2 />
            <strong>{t("noInstances")}</strong>
            <span>{query ? t("noMatches") : t("createInstanceHelp")}</span>
          </div>
        ) : (
          <div className="instance-management-list">
            {filtered.map((item) => (
              <div
                className={`instance-management-row ${item.current ? "current" : ""}`}
                key={item.id}
              >
                <div className="instance-row-copy">
                  <div className="instance-title">
                    <strong>{item.name}</strong>
                    {item.current && <Pill icon={Check}>{t("current")}</Pill>}
                  </div>
                  <span>{item.location}</span>
                  <small>
                    {item.status === "archived"
                      ? t("archive")
                      : item.publicEnabled
                        ? t("public")
                        : t("hidden")}
                  </small>
                </div>
                <div className="instance-row-actions">
                  {!item.current && item.active && item.status === "active" && (
                    <Button
                      variant="secondary"
                      icon={Building2}
                      disabled={busy}
                      onClick={() => void select(item.id)}
                    >
                      {t("select")}
                    </Button>
                  )}
                  {item.active && item.status === "active" && (
                    <Button
                      variant="ghost"
                      icon={item.publicEnabled ? EyeOff : Eye}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          kind: item.publicEnabled ? "hide" : "unhide",
                          id: item.id,
                        })
                      }
                    >
                      {item.publicEnabled ? t("hide") : t("unhide")}
                    </Button>
                  )}
                  {!item.current && item.active && item.status === "active" && (
                    <Button
                      variant="ghost"
                      icon={Archive}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ kind: "archive", id: item.id })
                      }
                    >
                      {t("archive")}
                    </Button>
                  )}
                  {!item.current && (
                    <Button
                      variant="ghost"
                      icon={Trash2}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({ kind: "delete", id: item.id })
                      }
                    >
                      {t("delete")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm?.kind === "create"}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirmLabel}
        onConfirm={() => void create()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "hide" || confirm?.kind === "unhide"}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirmLabel}
        onConfirm={() =>
          confirmed &&
          void setVisibility(confirmed.id, confirm?.kind === "unhide")
        }
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "archive"}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirmLabel}
        danger
        onConfirm={() => confirmed && void archive(confirmed.id)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title={confirmTitle}
        body={confirmBody}
        confirmLabel={confirmLabel}
        danger
        onConfirm={() => confirmed && void remove(confirmed.id)}
        onCancel={() => setConfirm(null)}
      />
      <Toast
        message={message}
        tone="success"
        onDismiss={() => setMessage("")}
      />
    </div>
  );
}
