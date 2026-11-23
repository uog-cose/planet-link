import {
  ShieldCheck,
  LockKeyhole,
  UserCheck,
  Database,
  Clock3,
  MessageCircle,
} from "lucide-react";
import { Card } from "../components/ui";
import { t } from "../i18n";
export function Privacy() {
  const sections = [
    [ShieldCheck, "privacyDataTitle", "privacyDataBody"],
    [UserCheck, "privacyPurposeTitle", "privacyPurposeBody"],
    [Database, "privacySharingTitle", "privacySharingBody"],
    [Clock3, "privacyRetentionTitle", "privacyRetentionBody"],
    [MessageCircle, "privacyRightsTitle", "privacyRightsBody"],
    [LockKeyhole, "privacyContactTitle", "privacyContactBody"],
  ] as const;
  return (
    <div className="page legal-page">
      <div className="legal-hero">
        <span className="eyebrow">{t("privacy")}</span>
        <h2>{t("privacyTitle")}</h2>
        <p>{t("privacyIntro")}</p>
      </div>
      <div className="legal-grid">
        {sections.map(([Icon, title, body]) => (
          <Card key={title}>
            <div className="legal-icon">
              <Icon size={19} />
            </div>
            <h3>{t(title as any)}</h3>
            <p>{t(body as any)}</p>
          </Card>
        ))}
      </div>
      <div className="legal-note">{t("privacyNoticeNote")}</div>
    </div>
  );
}
