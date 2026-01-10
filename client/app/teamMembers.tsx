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
    return data as TeamMember[];
  } catch (error) {
    console.error("Error fetching team members:", error);
    return [];
  }
}
