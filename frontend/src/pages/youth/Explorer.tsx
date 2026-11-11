import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Bell, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, setClientAuthenticated } from "../../api";
import { AvatarPicker } from "../../components/AvatarPicker";
import { Loading } from "../../components/feedback/Loading";

export function Explorer() {
  const [data, setData] = useState<any>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api<any>("/dashboard/")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <Loading />;

  return (
    <>
      {createPortal(
        <div
          className="profile-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) nav(-1);
          }}
        >
          <div className="profile-modal">
            <div className="profile-modal-head">
              <div>
                <span className="eyebrow">PROFILE</span>
                <h2>Your profile</h2>
                <p>Manage your picture and account preferences.</p>
              </div>
              <button
                className="icon-btn"
                aria-label="Close profile"
                onClick={() => nav(-1)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="profile-modal-content">
              <div className="profile-actions">
                <Link className="btn btn-secondary" to="/profile/notifications">
                  <Bell size={17} /> Notification settings
                </Link>
                <button
                  className="btn btn-secondary btn-danger"
                  type="button"
                  onClick={() => setRemoveOpen((v) => !v)}
                  aria-expanded={removeOpen}
                >
                  <Trash2 size={17} /> Remove account
                </button>
              </div>
              {removeOpen && (
                <div className="account-removal-layover" role="alert">
                  <div>
                    <strong>Remove your account?</strong>
                    <p>
                      This submits an account removal request and signs you out.
                      Your programme administrator will handle the request.
                    </p>
                  </div>
                  <div className="top-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={removing}
                      onClick={() => setRemoveOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-danger"
                      type="button"
                      disabled={removing}
                      onClick={async () => {
                        setRemoving(true);
                        try {
                          await api("/profile/delete/", { method: "POST" });
                        } catch {}
                        setClientAuthenticated(false);
                        nav("/login", {
                          replace: true,
                          state: { accountRemovalRequested: true },
                        });
                      }}
                    >
                      {removing ? "Submitting…" : "Remove account"}
                    </button>
                  </div>
                </div>
              )}
              <AvatarPicker
                value={data.profile.avatar}
                tier={data.profile.milestoneTier}
                color={data.profile.milestoneColor}
                onSaved={(r: any) =>
                  setData((prev: any) =>
                    prev
                      ? {
                          ...prev,
                          profile: {
                            ...prev.profile,
                            avatar: r.avatar || prev.profile.avatar,
                            avatarImageUrl:
                              r.avatarImageUrl || prev.profile.avatarImageUrl,
                            milestoneTier:
                              r.milestoneTier || prev.profile.milestoneTier,
                            milestoneColor:
                              r.milestoneColor || prev.profile.milestoneColor,
                          },
                        }
                      : prev,
                  )
                }
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
