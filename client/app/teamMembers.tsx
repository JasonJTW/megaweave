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
    bio: "Creator, curator, and Associate Professor in the Department of Architecture at Shih Chien University, and Adjunct Associate Professor in the Graduate Institute of New Media Art at Taipei National University of the Arts. He is the initiator of the MEGAWEAVING (大量交織) commons movement and moderator of its namesake Facebook group https://www.facebook.com/groups/1596603907320118/?locale=zh_TW, with a long-term commitment to integrating social design, resource systems, and mutually supportive public infrastructure. He also serves as a board member of the Taiwan Watch Institute (社團法人看守台灣協會). ",
    contact: {
      email: "yu-chih@example.com",
      website: "https://yuchih-hsiao.net/",
    },
  },
  {
    id: 2,
    name: "Jyun-Hao Jhang",
    avatar: "https://picsum.photos/seed/jyun/600/400?grayscale&blur=3",
    department: "Member",
    title: "Developer",
    location: "Taipei, Taiwan",
    bio: "A multidisciplinary multimedia creator with a background in architectural design. Since 2019, he has participated in multiple art and exhibition projects, including multimedia video installations for Section A-A’, landscape installations for the C-Lab Light Art Festival, and multimedia installations for the Yuejin Lantern Festival",
  },
  {
    id: 3,
    name: "Yu-Huan Chang",
    avatar: "https://picsum.photos/seed/3/600/400?grayscale&blur=3",
    department: "Member",
    title: "Designer",
    location: "Taipei, Taiwan",
    bio: "An illustrator and mixed-media artist with a background in architectural design. She's been drawing her entire life and actively manages her own illustration social media account, where you can find her work at https://www.instagram.com/yhuan.c/. Her artistic approach often involves transforming daily observations into abstract visual language. Her diverse portfolio includes naturalistic illustrations, abstract art, and spatial representations. Beyond her personal creations, Yu-Huan also collaborates with various companies, seamlessly integrating her illustrations with graphic design. Additionally, she shares her expertise as a creative course instructor at Lento Art Studio",
    contact: {
      website: "https://www.instagram.com/yhuan.c/",
    },
  },
  {
    id: 4,
    name: "Cyrus Chen",
    avatar: "https://picsum.photos/seed/5/600/400?grayscale&blur=3",
    department: "Member",
    title: "Project Manager",
    location: "Taipei, Taiwan",
    bio: "Loves art, tech, and good storytelling. With over 4 years of experience in project management for interactive design, public art, and multimedia installations, she enjoys helping creative ideas take shape and run smoothly. She loves working with artists, engineers, and cultural teams to bring meaningful experiences to life",
  },
  {
    id: 5,
    name: "Tzu-I Yang",
    avatar: "https://picsum.photos/seed/6/600/400?grayscale&blur=3",
    department: "Member",
    title: "Advisor",
    location: "Taipei, Taiwan",
    bio: "Tzu-I Yang has background in electrical engineering and computer science and previously worked as a machine learning engineer. He has participated in various interdisciplinary art collaborations, offering new perspectives and possibilities for artistic expression through the lenses of body, social issues, and technology. Beginning his artistic exploration through literature and dance, he later collaborated with multiple artists, leveraging his technical expertise to translate artistic concepts and abstract theories into game engines, programming, and interactive installations. He has participated in multiple projects for Taipei Fine Arts Museum and other places.",
  },
];

export const getTeamMemberById = (id: number): TeamMember | undefined => {
  return teamMembers.find((member) => member.id === id);
};
