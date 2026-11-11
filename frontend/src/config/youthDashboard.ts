import {
  Gamepad2,
  MapPinned,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
export type QuestFeature = {
  tone: "mint" | "sun" | "lilac" | "aqua";
  icon: LucideIcon;
  titleKey: "playGames" | "exploreMaps" | "earnPoints" | "bePartCommunity";
  bodyKey:
    | "playGamesBody"
    | "exploreMapsBody"
    | "earnPointsBody"
    | "bePartCommunityBody";
  href: string;
  art: string;
};
export const QUEST_FEATURES: QuestFeature[] = [
  {
    tone: "mint",
    icon: Gamepad2,
    titleKey: "playGames",
    bodyKey: "playGamesBody",
    href: "/games",
    art: "games",
  },
  {
    tone: "sun",
    icon: MapPinned,
    titleKey: "exploreMaps",
    bodyKey: "exploreMapsBody",
    href: "/profile",
    art: "map",
  },
  {
    tone: "lilac",
    icon: Trophy,
    titleKey: "earnPoints",
    bodyKey: "earnPointsBody",
    href: "/rewards",
    art: "points",
  },
  {
    tone: "aqua",
    icon: Users,
    titleKey: "bePartCommunity",
    bodyKey: "bePartCommunityBody",
    href: "/profile",
    art: "community",
  },
];
