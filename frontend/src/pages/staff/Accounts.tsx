import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Button, Card, ConfirmDialog, Pill } from "../../components/ui";
import {
  UserPlus,
  Users,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { avatarOptions } from "../../components/AvatarPicker";
import { avatarAsset } from "../../components/QuestArt";
import { useToast } from "../../components/ToastProvider";
import { t } from "../../i18n";

type Account = {
  userId: number;
  profileId: number;
  username: string;
  gamertag: string;
  role: string;
  avatar?: string;
  isActive: boolean;
};
const roleLabel = (role: string) =>
  role === "youth" ? "Player" : role === "worker" ? "Youth worker" : "Admin";

export function Accounts({ role }: { role: "worker" | "admin" }) {
  const [items, setItems] = useState<Account[]>([]),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState(role === "admin" ? "youth" : "youth"),
    [meta, setMeta] = useState<any>({
      total: 0,
      page: 1,
      limit: 40,
      hasMore: false,
    });
  const [f, setF] = useState({
    username: "",
    password: "",
    gamertag: "",
    role: "youth",
    avatar: "alex",
  });
  const [confirm, setConfirm] = useState<any>(null);
  const { show } = useToast();
  const load = () =>
    api<any>(
      `/staff/accounts/?role=${encodeURIComponent(tab)}&q=${encodeURIComponent(query)}&page=1&limit=40`,
    )
      .then((r) => {
        setItems(
          (r.items || []).filter(
            (x: any) =>
              !String(x.username || "").startsWith("deleted_") &&
              x.gamertag !== "Deleted account",
          ),
        );
        setMeta(r);
      })
      .catch((e) =>
        show(
          e instanceof Error ? e.message : "Unable to load accounts",
          "error",
        ),
      );
  useEffect(() => {
    const id = window.setTimeout(load, 180);
    return () => window.clearTimeout(id);
  }, [tab, query]);
  const tabs =
    role === "admin"
      ? [
          ["youth", "Player"],
          ["worker", "Youth worker"],
          ["admin", "Admin"],
        ]
      : [["youth", "Player"]];
  const filtered = useMemo(
    () => items.filter((x) => x.role === tab),
    [items, tab],
  );
  async function create() {
    try {
      await api("/staff/accounts/", {
        method: "POST",
        body: JSON.stringify({ ...f, role: tab }),
      });
      setF({ ...f, username: "", password: "", gamertag: "", avatar: "alex" });
      show(`${roleLabel(tab)} account created`, "success");
      await load();
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Unable to create account",
        "error",
      );
    }
  }
  async function accountAction(body: any, message: string) {
    try {
      await api("/staff/accounts/", {
        method: "POST",
        body: JSON.stringify(body),
      });
      show(message, "success");
      await load();
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Unable to update account",
        "error",
      );
    }
  }
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{t("accountsEyebrow")}</span>
          <h2>{t("manageAccounts")}</h2>
          <p>{t("accountsHelpDetailed")}</p>
        </div>
        <Users size={34} />
      </div>
      <div className="segmented-tabs account-role-tabs">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => {
              setTab(k);
              setF({ ...f, role: k });
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Card className="account-create-card">
          <h3>Create {roleLabel(tab).toLowerCase()}</h3>
          <label>
            {t("username")}
            <input
              value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
            />
          </label>
          <label>
            {t("gamertag")}
            <input
              value={f.gamertag}
              onChange={(e) => setF({ ...f, gamertag: e.target.value })}
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
            />
          </label>
          {tab === "youth" && (
            <div>
              <span className="eyebrow">{t("profilePicture")}</span>
              <div className="account-create-avatar">
                <img src={avatarAsset(f.avatar)} alt="" />
                <select
                  value={f.avatar}
                  onChange={(e) => setF({ ...f, avatar: e.target.value })}
                >
                  {avatarOptions.map((a, i) => (
                    <option key={a} value={a}>
                      Avatar {String(i + 1).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
              <small className="muted">{t("playerCanChangeLater")}</small>
            </div>
          )}
          <Button icon={UserPlus} onClick={create}>
            {t("createAccount")}
          </Button>
        </Card>
        <Card>
          <div className="section-head">
            <div>
              <h3>{roleLabel(tab)} accounts</h3>
              <p className="muted">
                {meta.total || filtered.length} accounts ·{" "}
                {filtered.filter((x) => x.isActive).length} active on this page
              </p>
            </div>
          </div>
          <div className="account-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchAccounts")}
            />
          </div>
          <div className="activity-list account-list">
            {!filtered.length && query.trim() && (
              <div className="account-search-empty">
                <Search size={24} />
                <strong>{t("noMatchingAccounts")}</strong>
                <span>{t("tryAccountSearch")}</span>
              </div>
            )}
            {filtered.map((x) => (
              <details
                className={`account-card ${x.isActive ? "" : "is-disabled"}`}
                key={x.userId}
              >
                <summary className="account-card-summary">
                  <div className="account-card-identity">
                    <span className="account-avatar">
                      {x.gamertag?.slice(0, 1)?.toUpperCase() || "?"}
                    </span>
                    <span>
                      <strong>{x.gamertag}</strong>
                      <small>{x.username}</small>
                    </span>
                  </div>
                  <Pill>{x.isActive ? "Active" : "Access revoked"}</Pill>
                  <span className="account-card-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </summary>
                <div className="account-card-body">
                  <div className="account-card-meta">
                    <span>
                      <b>Role</b>
                      {roleLabel(x.role)}
                    </span>
                    <span>
                      <b>Status</b>
                      {x.isActive ? "Sign-in enabled" : "Sign-in disabled"}
                    </span>
                  </div>
                  {x.role === "youth" && (
                    <label className="account-avatar-control">
                      Profile picture
                      <select
                        value={x.avatar || "alex"}
                        disabled={!x.isActive}
                        onChange={async (e) => {
                          try {
                            await api("/worker/avatar/", {
                              method: "POST",
                              body: JSON.stringify({
                                profileId: x.profileId,
                                avatar: e.target.value,
                              }),
                            });
                            setItems((v) =>
                              v.map((y) =>
                                y.profileId === x.profileId
                                  ? { ...y, avatar: e.target.value }
                                  : y,
                              ),
                            );
                            show("Avatar updated", "success");
                          } catch (err) {
                            show(
                              err instanceof Error
                                ? err.message
                                : "Unable to update avatar",
                              "error",
                            );
                          }
                        }}
                      >
                        {avatarOptions.map((a, i) => (
                          <option key={a} value={a}>
                            Avatar {String(i + 1).padStart(2, "0")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="account-actions">
                    <Button
                      variant="secondary"
                      icon={x.isActive ? ShieldOff : ShieldCheck}
                      onClick={() =>
                        setConfirm({
                          kind: "access",
                          id: x.userId,
                          active: x.isActive,
                          name: x.gamertag,
                        })
                      }
                    >
                      {x.isActive ? "Revoke access" : "Restore access"}
                    </Button>
                    {x.userId !== undefined && (
                      <Button
                        variant="ghost"
                        icon={Trash2}
                        className="delete-action"
                        onClick={() =>
                          setConfirm({
                            kind: "delete",
                            id: x.userId,
                            name: x.gamertag,
                          })
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            ))}
            {!filtered.length && !query.trim() && (
              <div className="account-search-empty">
                <Users size={24} />
                <strong>{t("noPlayerAccounts")}</strong>
                <span>{t("accountsAppearHere")}</span>
              </div>
            )}
          </div>
          {(meta.hasMore || meta.page > 1) && (
            <div className="top-actions account-pagination">
              <Button
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={async () => {
                  const r = await api<any>(
                    `/staff/accounts/?role=${encodeURIComponent(tab)}&q=${encodeURIComponent(query)}&page=${meta.page - 1}&limit=40`,
                  );
                  setItems(r.items || []);
                  setMeta(r);
                }}
              >
                {t("previous")}
              </Button>
              <span className="muted">Page {meta.page}</span>
              <Button
                variant="secondary"
                onClick={async () => {
                  const r = await api<any>(
                    `/staff/accounts/?role=${encodeURIComponent(tab)}&q=${encodeURIComponent(query)}&page=${meta.page + 1}&limit=40`,
                  );
                  setItems(r.items || []);
                  setMeta(r);
                }}
              >
                {t("next")}
              </Button>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === "delete"
            ? "Delete account?"
            : confirm?.active
              ? "Revoke account access?"
              : "Restore account access?"
        }
        body={
          confirm?.kind === "delete"
            ? `This permanently removes sign-in access for ${confirm?.name}. Youth Quest will preserve their historical records and audit history.`
            : `${confirm?.active ? "They will no longer be able to sign in until access is restored." : "They will be able to sign in again."}`
        }
        confirmLabel={
          confirm?.kind === "delete"
            ? "Delete account"
            : confirm?.active
              ? "Revoke access"
              : "Restore access"
        }
        danger={confirm?.kind === "delete" || confirm?.active}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await accountAction(
            c.kind === "delete"
              ? { action: "delete", userId: c.id }
              : { action: "set_access", userId: c.id, active: !c.active },
            c.kind === "delete"
              ? "Account deleted"
              : c.active
                ? "Access revoked"
                : "Access restored",
          );
        }}
      />
    </div>
  );
}
