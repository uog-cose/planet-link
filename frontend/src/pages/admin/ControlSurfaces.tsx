import {
  ArrowRight,
  Building2,
  Gamepad2,
  MapPinned,
  Palette,
  SlidersHorizontal,
  Users,
  ExternalLink,
  Gift,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
const surfaces = [
  [
    "/admin/config",
    "programmeXp",
    "programmeXpHelp",
    SlidersHorizontal,
    "tile1",
  ],
  ["/admin/theme", "themeStudio", "themeStudioHelp", Palette, "tile3"],
  [
    "/admin/games",
    "gamesAssignments",
    "gamesAssignmentsHelp",
    Gamepad2,
    "tile2",
  ],
  ["/admin/map-event", "eventsMap", "eventsMapHelp", MapPinned, "tile4"],
  ["/admin/people", "peopleGroups", "peopleGroupsHelp", Users, "tile1"],
  ["/admin/scratch-cards", "scratchCards", "scratchCardsHelp", Gift, "tile3"],
  [
    "/admin/skills",
    "skillsMilestones",
    "skillsMilestonesHelp",
    Target,
    "tile2",
  ],
  [
    "/admin/instances",
    "programmeInstances",
    "programmeInstancesHelp",
    Building2,
    "tile2",
  ],
  ["/public", "publicDisplay", "publicDisplayHelp", ExternalLink, "tile4"],
] as const;
export function ControlSurfaces() {
  return (
    <div className="page control-surfaces-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">{t("admin")}</span>
          <h2>{t("controlSurfaces")}</h2>
          <p>{t("controlSurfacesHelp")}</p>
        </div>
        <SlidersHorizontal size={34} />
      </div>
      <div className="control-surface-grid">
        {surfaces.map(([href, title, body, Icon, tone]) => (
          <Link key={href} to={href} className={`control-surface-card ${tone}`}>
            <span className="control-surface-icon">
              <Icon size={21} />
            </span>
            <div>
              <strong>{t(title as any)}</strong>
              <p>{t(body as any)}</p>
            </div>
            <ArrowRight size={18} />
          </Link>
        ))}
      </div>
    </div>
  );
}
