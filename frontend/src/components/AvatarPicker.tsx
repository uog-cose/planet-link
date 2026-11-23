import { t } from "../i18n";
import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { api } from "../api";
import { avatarAsset } from "./QuestArt";
import { useToast } from "./ToastProvider";
const avatarOptions = [
  "alex",
  "ben",
  "charlie",
  "daniel",
  "ethan",
  "finley",
  "george",
  "henry",
  "jack",
  "logan",
  "ava",
  "bella",
  "chloe",
  "daisy",
  "ella",
  "freya",
  "grace",
  "holly",
  "isabella",
  "sophie",
];
export function AvatarPicker({
  value,
  onSaved,
  compact = false,
}: {
  value: string;
  tier?: string;
  color?: string;
  onSaved: (x: any) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const { show } = useToast();
  async function choose(avatar: string) {
    setBusy(true);
    try {
      const r = await api<any>("/profile/avatar/", {
        method: "POST",
        body: JSON.stringify({ avatar }),
      });
      onSaved(r);
      setOpen(false);
    } catch (e) {
      show(
        e instanceof Error ? e.message : "Avatar could not be selected",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="avatar-picker-youth avatar-picker-compact">
      <div className="avatar-current-row">
        <img src={avatarAsset(value || "alex")} alt="" width={64} height={64} />
        <div>
          <strong>{t("profilePictureTitle")}</strong>
          <small>{t("profilePictureHelp")}</small>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setOpen(true)}
        >
          {t("changeAvatar")}
        </button>
      </div>
      {open &&
        createPortal(
          <div
            className="modal-backdrop avatar-picker-backdrop"
            onMouseDown={(e) => {
              if (e.currentTarget === e.target && !busy) setOpen(false);
            }}
          >
            <div
              className="modal avatar-picker-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="modal-heading">
                <div>
                  <span className="eyebrow">{t("profilePicture")}</span>
                  <h3>{t("chooseAvatarTitle")}</h3>
                  <p>{t("chooseAvatarHelp")}</p>
                </div>
                <button
                  className="icon-btn modal-close"
                  type="button"
                  aria-label={t("closeAvatarPicker")}
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="avatar-choice-grid">
                {avatarOptions.map((name) => (
                  <button
                    type="button"
                    key={name}
                    className={`avatar-choice ${value === name ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() => choose(name)}
                    title={`Avatar ${String(avatarOptions.indexOf(name) + 1).padStart(2, "0")}`}
                  >
                    <img
                      src={avatarAsset(name)}
                      alt=""
                      width={58}
                      height={58}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
export { avatarOptions };
