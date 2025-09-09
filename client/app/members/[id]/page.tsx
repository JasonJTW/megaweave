"use client";
//* Member Detail Page

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamMember } from "@/app/teamMembers";
import { useTeam } from "@/app/contexts/TeamContext";
import Image from "next/image";

const MemberPage = () => {
  const router = useRouter();
  const params = useParams();
  const memberId = parseInt(params.id as string);

  const {
    teamMembers,
    loading: teamLoading,
    error: teamError,
    getMemberById,
    getMemberIndex,
    getNextMember,
    getPrevMember,
  } = useTeam();

  const [member, setMember] = useState<TeamMember | null>(null);
  // const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamLoading) {
      setLoading(true);
      return;
    }

    if (teamError) {
      setError(teamError);
      setLoading(false);
      return;
    }

    if (!memberId || isNaN(memberId)) {
      setError("Invalid member ID");
      setLoading(false);
      return;
    }

    // 從 context 中獲取成員數據
    const foundMember = getMemberById(memberId);
    if (!foundMember) {
      setError("Member not found");
      setLoading(false);
      return;
    }

    setMember(foundMember);
    // setCurrentIndex(getMemberIndex(memberId));
    setError(null);
    setLoading(false);
  }, [
    memberId,
    teamMembers,
    teamLoading,
    teamError,
    getMemberById,
    getMemberIndex,
  ]);

  const handleClose = () => {
    router.push("/about");
  };

  const handlePrevious = () => {
    const prevMember = getPrevMember(memberId);
    if (prevMember) {
      router.push(`/members/${prevMember.user_id}`);
    }
  };

  const handleNext = () => {
    const nextMember = getNextMember(memberId);
    if (nextMember) {
      router.push(`/members/${nextMember.user_id}`);
    }
  };

  // 檢查是否可以導航
  const canGoPrevious = !!getPrevMember(memberId);
  const canGoNext = !!getNextMember(memberId);

  // Loading 狀態
  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-primary-75 -z-10"></div>
        <div className="min-h-screen bg-primary-75 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary mx-auto mb-4"></div>
            <p className="text-secondary">Loading member data...</p>
          </div>
        </div>
      </>
    );
  }

  // Error 狀態
  if (error || !member) {
    return (
      <>
        <div className="fixed inset-0 bg-primary-75 -z-10"></div>
        <div className="min-h-screen bg-primary-75 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-secondary mb-4">
              {error || "Member not found"}
            </h2>
            <Button
              onClick={() => router.push("/about")}
              className="bg-black text-white px-6 py-2 rounded-full hover:bg-gray-800"
            >
              Back to About
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-primary-75 -z-10"></div>
      <div className="min-h-screen bg-primary-75 overflow-hidden relative">
        {/* Navigation Controls */}
        <div className="fixed top-8 left-8 z-50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            className={`rounded-full px-6 py-2 mr-4 transition-colors duration-200 ${
              canGoPrevious
                ? "bg-black text-white hover:bg-gray-800"
                : "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
            }`}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Prev
          </Button>
        </div>

        <div className="fixed top-8 right-8 z-50 flex gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext}
            className={`rounded-full px-6 py-2 transition-colors duration-200 ${
              canGoNext
                ? "bg-black text-white hover:bg-gray-800"
                : "bg-gray-400 text-gray-600 cursor-not-allowed opacity-50"
            }`}
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="bg-black text-white hover:bg-gray-800 rounded-full p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-10 md:px-20">
          {/* Header with Member Location */}
          <div className="pt-20 pb-10">
            <div className="flex items-center justify-between">
              {member.location && (
                <div className="bg-black text-white px-4 py-2 text-sm rounded-full">
                  {member.location}
                </div>
              )}
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20 pb-20">
            {/* Left Column - Member Image and Basic Info */}
            <div className="space-y-8">
              {/* Member Image */}
              <div className="relative">
                {/* <img
                src={member.avatar_url}
                alt={member.member_name}
                className="w-full aspect-[3/4] object-cover bg-gray-200 rounded-xl shadow-lg"
              /> */}
                <div className="relative w-full aspect-[3/4]">
                  <Image
                    src={member.avatar_url}
                    alt={member.member_name}
                    fill
                    priority
                    className="object-cover bg-gray-200 rounded-xl shadow-lg "
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
                <div className="absolute top-4 left-4 bg-black text-white px-4 py-2 text-sm rounded-full">
                  {member.title}
                </div>
              </div>

              {/* Member Name and Department */}
              <div>
                <h1 className="text-4xl md:text-5xl text-secondary font-bold mb-2">
                  {member.member_name}
                </h1>
                <p className="text-xl text-secondary/75 mb-4">
                  {member.department}
                </p>
              </div>

              {/* Contact Information */}

              {member.email && (
                <div className="mb-3">
                  <p className="text-sm text-secondary/75 uppercase tracking-wide mb-1">
                    Email
                  </p>
                  <p className="text-secondary">{member.email}</p>
                </div>
              )}

              {member.websites && member.websites?.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm text-secondary/75 uppercase tracking-wide mb-1">
                    Website
                  </p>
                  {member.websites.map((website, index) => (
                    <a
                      key={index}
                      href={website.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-secondary hover:text-secondary/75 transition-colors duration-150 flex items-center gap-2"
                    >
                      {website.url}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column - Detailed Information */}
            <div className="space-y-12">
              {/* Profile Section */}
              {member.member_bio && (
                <div>
                  <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                    Profile
                  </h2>
                  <p className="text-lg text-secondary leading-relaxed">
                    {member.member_bio}
                  </p>
                </div>
              )}

              {/* Experience Section */}
              {member.experience && member.experience.length > 0 && (
                <div>
                  <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                    Experience
                  </h2>
                  <div className="space-y-6">
                    {member.experience.map((exp, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-secondary">
                              {exp.position}
                            </h3>
                            <p className="text-secondary-75 mb-2">
                              {exp.company}
                            </p>
                            <p className="text-secondary leading-relaxed">
                              {exp.description}
                            </p>
                          </div>
                          <div className="text-sm text-secondary-75 ml-4 flex-shrink-0">
                            {exp.year}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills Section */}
              {member.skills && member.skills.length > 0 && (
                <div>
                  <h2 className="text-2xl text-secondary mb-6 pb-4 border-b border-megaweave-stone">
                    Skills & Expertise
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {member.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="bg-secondary-75 text-white px-4 py-2 rounded-full text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MemberPage;
