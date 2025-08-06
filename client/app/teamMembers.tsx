export interface TeamMember {
  id: number;
  name: string;
  avatar: string;
  department: string;
  title: string; // Optional title field
}

export const teamMembers: TeamMember[] = [
  {
    id: 1,
    name: "Yu-Chih Hsiao",
    avatar: "https://picsum.photos/seed/1/600/400?grayscale&blur=3",
    department: "Member",
    title: "Proposer",
  },
  {
    id: 2,
    name: "Jyun-Hao Jhang",
    avatar: "https://picsum.photos/seed/jyun/600/400?grayscale&blur=3",
    department: "Member",
    title: "Developer",
  },
  {
    id: 3,
    name: "Yu-Huan Chang",
    avatar: "https://picsum.photos/seed/3/600/400?grayscale&blur=3",
    department: "Member",
    title: "Designer",
  },
  {
    id: 4,
    name: "Cyrus Chen",
    avatar: "https://picsum.photos/seed/5/600/400?grayscale&blur=3",
    department: "Member",
    title: "Project Manager",
  },
  {
    id: 5,
    name: "Tzu-I Yang",
    avatar: "https://picsum.photos/seed/6/600/400?grayscale&blur=3",
    department: "Member",
    title: "Advisor",
  },
];
