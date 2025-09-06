//* TeamContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { TeamMember, getTeamMembers } from "@/app/teamMembers";

interface TeamContextType {
  teamMembers: TeamMember[];
  loading: boolean;
  error: string | null;
  refetchTeamMembers: () => Promise<void>;
  getMemberById: (id: number) => TeamMember | null;
  getMemberIndex: (id: number) => number;
  getNextMember: (currentId: number) => TeamMember | null;
  getPrevMember: (currentId: number) => TeamMember | null;
}

const TeamContext = createContext<TeamContextType | null>(null);

interface TeamProviderProps {
  children: ReactNode;
}

export const TeamProvider: React.FC<TeamProviderProps> = ({ children }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamMembers = async () => {
    try {
      setLoading(true);
      setError(null);
      const members = await getTeamMembers();
      setTeamMembers(members);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch team members"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const getMemberById = (user_id: number): TeamMember | null => {
    return teamMembers.find((member) => member.user_id === user_id) || null;
  };

  const getMemberIndex = (user_id: number): number => {
    return teamMembers.findIndex((member) => member.user_id === user_id);
  };

  const getNextMember = (currentId: number): TeamMember | null => {
    const currentIndex = getMemberIndex(currentId);
    if (currentIndex === -1 || currentIndex >= teamMembers.length - 1) {
      return null;
    }
    return teamMembers[currentIndex + 1];
  };

  const getPrevMember = (currentId: number): TeamMember | null => {
    const currentIndex = getMemberIndex(currentId);
    if (currentIndex <= 0) {
      return null;
    }
    return teamMembers[currentIndex - 1];
  };

  const refetchTeamMembers = async () => {
    await fetchTeamMembers();
  };

  const value: TeamContextType = {
    teamMembers,
    loading,
    error,
    refetchTeamMembers,
    getMemberById,
    getMemberIndex,
    getNextMember,
    getPrevMember,
  };

  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

export const useTeam = (): TeamContextType => {
  const context = useContext(TeamContext);
  if (!context) {
    throw new Error("useTeam must be used within a TeamProvider");
  }
  return context;
};
