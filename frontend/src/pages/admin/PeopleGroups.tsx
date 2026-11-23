import { useState } from "react";
import { Users, UserRound, Layers3 } from "lucide-react";
import { Accounts } from "../staff/Accounts";
import { Groups } from "../worker/Groups";
import { Card } from "../../components/ui";

export function PeopleGroups() {
  const [tab, setTab] = useState<"people" | "groups">("people");
  return (
    <div className="page admin-people-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PEOPLE & GROUPS</span>
          <h2>Organise the programme</h2>
          <p>
            Search and manage people or groups without loading everything into
            one crowded dashboard.
          </p>
        </div>
        <Users size={34} />
      </div>
      <Card className="people-groups-switcher">
        <button
          className={tab === "people" ? "active" : ""}
          onClick={() => setTab("people")}
        >
          <UserRound size={18} />
          <span>People</span>
        </button>
        <button
          className={tab === "groups" ? "active" : ""}
          onClick={() => setTab("groups")}
        >
          <Layers3 size={18} />
          <span>Groups</span>
        </button>
      </Card>
      {tab === "people" ? <Accounts role="admin" /> : <Groups embedded />}
    </div>
  );
}
