import dotenv from "dotenv";
dotenv.config();

const hostName = process.env.NEXT_PUBLIC_HOSTNAME;

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
  user_role: string;
  location?: string;
  title?: string;
  member_bio?: string;
  websites?: Website[];
  email?: string;
  experience?: Experience[];
  skills?: string[];
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

export function memberToFormValues(
  member: TeamMember,
  visibility?: Partial<MemberFormVisibility>,
) {
  return {
    title: member.title || "",
    location: member.location || "",
    website: member.websites?.[0]?.url || "",
    email: member.email || "",
    titleVisible: visibility?.titleVisible ?? true,
    locationVisible: visibility?.locationVisible ?? true,
    websiteVisible: visibility?.websiteVisible ?? true,
    emailVisible: visibility?.emailVisible ?? false,
  };
}

export async function getTeamMembers() {
  try {
    const response = await fetch(`${hostName}/api/member/all`, {
      cache: "no-store",
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errorMessage || "Failed to fetch team members");
    }
    const data = await response.json();
    return (data as TeamMember[]).map(normalizeTeamMember);
  } catch (error) {
    console.error("Error fetching team members:", error);
    return [];
  }
}
