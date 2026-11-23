import { useEffect, useState } from "react";
import { api } from "../../api";
import { Card } from "../../components/ui";
import { EmptyCard } from "../../components/EmptyCard";
import { Loading } from "../../components/feedback/Loading";
import {
  ListChecks,
  CalendarCheck,
  Gift,
  Target,
  Users,
  Gamepad2,
} from "lucide-react";

type ActivityTab = {
  key: string;
  label: string;
  icon: typeof ListChecks;
  rows: any[];
};

export function Activity() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState("xp");
  useEffect(() => {
    api<any>("/dashboard/")
      .then(setData)
      .catch(() => setData({}));
  }, []);
  if (!data) return <Loading />;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const withinWeek = (row: any) => {
    const raw = row?.created_at || row?.completed_at || row?.attended_at;
    return !raw || new Date(raw).getTime() >= weekAgo;
  };
  const tabs: ActivityTab[] = [
    {
      key: "xp",
      label: "Recent XP",
      icon: ListChecks,
      rows: (data.recentXp || []).filter(withinWeek),
    },
    {
      key: "games",
      label: "Games",
      icon: Gamepad2,
      rows: (data.activityTabs?.games || []).filter(withinWeek),
    },
    {
      key: "attendance",
      label: "Attendance",
      icon: CalendarCheck,
      rows: (data.activityTabs?.attendance || []).filter(withinWeek),
    },
    {
      key: "scratch",
      label: "Scratch cards",
      icon: Gift,
      rows: (data.activityTabs?.scratch || []).filter(withinWeek),
    },
    {
      key: "points",
      label: "Points assigned",
      icon: Target,
      rows: (data.activityTabs?.pointsAssigned || []).filter(withinWeek),
    },
    {
      key: "public",
      label: "Public points",
      icon: Users,
      rows: (data.activityTabs?.publicPoints || []).filter(withinWeek),
    },
  ];
  const current = tabs.find((x) => x.key === tab) || tabs[0];
  const Icon = current.icon;
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">ACTIVITY</span>
          <h2>Recent activity</h2>
          <p>Your Youth Quest history in one place.</p>
        </div>
        <ListChecks size={34} />
      </div>
      <Card className="activity-page-card">
        <div
          className="activity-tabs activity-tabs-dashboard"
          role="tablist"
          aria-label="Activity categories"
        >
          {tabs.map((x) => {
            const TabIcon = x.icon;
            return (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={tab === x.key}
                className={tab === x.key ? "active" : ""}
                onClick={() => setTab(x.key)}
              >
                <TabIcon size={16} />
                {x.label}
              </button>
            );
          })}
        </div>
        <div className="activity-table activity-page-table">
          {current.rows.length ? (
            current.rows.map((x: any, i: number) => (
              <div className="activity" key={`${current.key}-${i}`}>
                <div className="achievement-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <strong>
                    {current.key === "attendance"
                      ? "Attendance recorded"
                      : current.key === "scratch"
                        ? x.award_name
                        : current.key === "games"
                          ? x.game__title
                          : x.reason || current.label}
                  </strong>
                  <span>
                    {new Date(
                      x.created_at ||
                        x.attended_at ||
                        x.claimed_at ||
                        x.completed_at,
                    ).toLocaleString()}
                  </span>
                </div>
                {current.key === "attendance" ? (
                  <b>Checked in</b>
                ) : current.key === "games" ? (
                  <b>+{Number(x.xp_awarded || 0)} XP</b>
                ) : (
                  x.amount !== undefined && (
                    <b>
                      {Number(x.amount) > 0 ? "+" : ""}
                      {x.amount} XP
                    </b>
                  )
                )}
              </div>
            ))
          ) : (
            <EmptyCard
              icon={Icon}
              title="Nothing here yet"
              body={`There is no ${current.label.toLowerCase()} to show right now. Complete an activity and it will appear here.`}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
