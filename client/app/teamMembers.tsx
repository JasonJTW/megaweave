export interface TeamMember {
  id: number;
  name: string;
  avatar: string;
  department: string;
  title: string; // Optional title field
  location?: string;
  bio?: string;
  experience?: Array<{
    year: string;
    position: string;
    company: string;
    description: string;
  }>;
  projects?: Array<{
    name: string;
    description: string;
    image?: string;
  }>;
  skills?: string[];
  contact?: {
    email?: string;
    website?: string;
    linkedin?: string;
  };
}

export const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: "Yu-Chih Hsiao",
    avatar: "https://picsum.photos/seed/1/600/400?grayscale&blur=3",
    department: "Member",
    title: "Proposer",
    location: "Taipei, Taiwan",
    bio: "Experienced proposer with a passion for innovative solutions and team collaboration.",
    contact: {
      email: "yu-chih@example.com",
      website: "https://yu-chih-portfolio.com",
    },
  },
  {
    id: 2,
    name: "Jyun-Hao Jhang",
    avatar: "https://picsum.photos/seed/jyun/600/400?grayscale&blur=3",
    department: "Member",
    title: "Developer",
    location: "Taipei, Taiwan",
    bio: "Passionate full-stack developer with expertise in modern web technologies.",
  },
  {
    id: 3,
    name: "Yu-Huan Chang",
    avatar: "https://picsum.photos/seed/3/600/400?grayscale&blur=3",
    department: "Member",
    title: "Designer",
    location: "Taipei, Taiwan",
    bio: "Creative UI/UX designer focused on creating intuitive and beautiful user experiences.",
  },
  {
    id: 4,
    name: "Cyrus Chen",
    avatar: "https://picsum.photos/seed/5/600/400?grayscale&blur=3",
    department: "Member",
    title: "Project Manager",
    location: "Taipei, Taiwan",
    bio: "Results-driven project manager with a track record of delivering projects on time and within budget.",
  },
  {
    id: 5,
    name: "Tzu-I Yang",
    avatar: "https://picsum.photos/seed/6/600/400?grayscale&blur=3",
    department: "Member",
    title: "Advisor",
    location: "Taipei, Taiwan",
    bio: "Seasoned advisor providing strategic guidance and industry insights.",
  },
];

export const getTeamMemberById = (id: number): TeamMember | undefined => {
  return teamMembers.find((member) => member.id === id);
};
