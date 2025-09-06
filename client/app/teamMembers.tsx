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
  title: string;
  location?: string;
  department?: string;
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
    console.log("teamMembers data: ", data);
    return data as TeamMember[];
  } catch (error) {
    console.error("Error fetching team members:", error);
    return [];
  }
}

//Fix: Update be api to get member by id
// export const getTeamMemberById = (id: number): TeamMember | undefined => {
//   return teamMembers.find((member) => member.id === id);
// };
