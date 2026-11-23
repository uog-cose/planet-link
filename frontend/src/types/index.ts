export type Role = "youth" | "worker" | "admin";
export type User = {
  username: string;
  role: Role;
  gamertag: string;
  mustChangePassword?: boolean;
};
export type Avatar = "orbit" | "comet" | "rocket" | "star" | "moon" | "wave";
export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  created_at: string;
  url?: string;
};
export type SkillMilestone = {
  id: number;
  name: string;
  progress: number;
  xp: number;
  rewardId: number | null;
  reward: string;
};
export type Skill = {
  id: number;
  name: string;
  description: string;
  xp_reward: number;
  progress?: number;
  completed?: boolean;
  completedMilestones?: number[];
  milestones: SkillMilestone[];
};
export type DashboardProfile = {
  gamertag: string;
  avatar: Avatar;
  avatarImageUrl?: string | null;
  milestoneTier: string;
  milestoneColor: string;
  currentXp: number;
  lifetimeXp: number;
  level: number;
  streak: number;
};
export type DashboardData = {
  profile: DashboardProfile;
  skills: Skill[];
  notifications: NotificationItem[];
  challenges: any[];
  drawings: any[];
  programme: any;
  groups: any[];
  badges: any[];
  recentXp: any[];
  activityTabs: any;
  currentEvent?: any;
  nextEvent?: any;
  lastEvent?: any;
};
