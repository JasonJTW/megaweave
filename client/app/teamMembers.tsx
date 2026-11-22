import dotenv from "dotenv";
import { api } from "@/lib/api";
dotenv.config();

export interface Experience {
  position: string;
  company: string;
  description: string;
  year: string;
}

export interface Website {
  url: string;
  type?: string;
}

export interface TeamMember {
  index: number;
  user_id: number;
  member_name: string;
  avatar_url: string;
  avatar_key: string;
  user_role: string;
  location?: string;
  title?: string;
  member_bio?: string;
  websites?: Website[];
  email?: string;
  experience?: Experience[];
  skills?: string[];
  sort_order: number;
}

export function parseMemberWebsites(websites: unknown): Website[] {
  if (!websites) return [];
  if (Array.isArray(websites)) return websites as Website[];
  if (typeof websites === "string") {
    try {
      const parsed = JSON.parse(websites);
      return Array.isArray(parsed) ? (parsed as Website[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeTeamMember(
  member: TeamMember & { websites?: unknown },
): TeamMember {
  return {
    ...member,
    websites: parseMemberWebsites(member.websites),
  };
}

export type MemberFormVisibility = {
  titleVisible: boolean;
  locationVisible: boolean;
  websiteVisible: boolean;
  emailVisible: boolean;
};

export function memberToFormValues(member: TeamMember) {
  return {
    title: member.title || "",
    location: member.location || "",
    website: member.websites?.[0]?.url || "",
    email: member.email || "",
  };
}

export async function getTeamMembers() {
  try {
    const data = await api<TeamMember[]>("/api/member/all");
    return data.map(normalizeTeamMember);
  } catch (error) {
    console.error("Error fetching team members:", error);
    return [];
  }
}
