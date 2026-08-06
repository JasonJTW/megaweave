"use client";
//* Member Detail Page

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamMember } from "@/app/teamMembers";
import { useTeam } from "@/app/contexts/TeamContext";
import Image from "next/image";
import { getImageUrl } from "@/utils/imageUtils";
import { motion, AnimatePresence } from "framer-motion";

const MemberPage = () => {
  const router = useRouter();
  const params = useParams();
  const routeMemberId = parseInt(params.id as string);

  const {
    teamMembers,
    loading: teamLoading,
    error: teamError,
    getMemberById,
    getMemberIndex,
    getNextMember,
    getPrevMember,
  } = useTeam();

  // 當前顯示的成員 ID 與切換方向
  const [currentId, setCurrentId] = useState<number>(routeMemberId);
  const [direction, setDirection] = useState<number>(0);

  const [member, setMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 控制按鈕顯示/隱藏的狀態
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // 當網址 id 變更時同步內部 currentId
  useEffect(() => {
    if (routeMemberId && !isNaN(routeMemberId)) {
      setCurrentId(routeMemberId);
    }
  }, [routeMemberId]);

  // 滾動偵測
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsNavVisible(false);
      } else if (currentScrollY < lastScrollY) {
        setIsNavVisible(true);
      }

      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [lastScrollY]);

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

    if (!currentId || isNaN(currentId)) {
      setError("Invalid member ID");
      setLoading(false);
      return;
    }

    const foundMember = getMemberById(currentId);
    if (!foundMember) {
      setError("Member not found");
      setLoading(false);
      return;
    }

    setMember(foundMember);
    setError(null);
    setLoading(false);
  }, [
    currentId,
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
    const prevMember = getPrevMember(currentId);
    if (prevMember) {
      setDirection(-1);
      setCurrentId(prevMember.user_id);
      window.history.replaceState(null, "", `/members/${prevMember.user_id}`);
    }
  };

  const handleNext = () => {
    const nextMember = getNextMember(currentId);
    if (nextMember) {
      setDirection(1);
      setCurrentId(nextMember.user_id);
      window.history.replaceState(null, "", `/members/${nextMember.user_id}`);
    }
  };

  const canGoPrevious = !!getPrevMember(currentId);
  const canGoNext = !!getNextMember(currentId);

  // 滑動動畫設定
  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "15%" : dir < 0 ? "-15%" : 0,
      opacity: 0,
      filter: "blur(8px)",
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: "blur(0px)",
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-15%" : dir < 0 ? "15%" : 0,
      opacity: 0,
      filter: "blur(8px)",
    }),
  };

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-primary-5"></div>
        <div className="flex min-h-screen items-center justify-center bg-primary-75">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-secondary"></div>
            <p className="text-[#222222]">Loading member data...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !member) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-primary-5"></div>
        <div className="flex min-h-screen items-center justify-center bg-primary-5">
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-[#222222]">
              {error || "Member not found"}
            </h2>
            <Button
              onClick={() => router.push("/about")}
              className="rounded-full bg-black px-6 py-2 text-white hover:bg-gray-800"
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
      <div className="fixed inset-0 -z-10 bg-primary-5"></div>
      <div className="relative min-h-screen overflow-x-hidden bg-primary-5 font-ddin">
        {/* Navigation */}
        <div
          className={`fixed left-8 top-20 z-50 transition-all duration-300 ease-in-out ${
            isNavVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-20 opacity-0"
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            className={`mr-4 rounded-full px-6 py-2 transition-colors duration-200 ${
              canGoPrevious
                ? "bg-black text-white hover:bg-gray-800"
                : "cursor-not-allowed bg-gray-400 text-gray-600 opacity-50"
            }`}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Prev
          </Button>
        </div>

        <div
          className={`fixed right-8 top-20 z-50 flex gap-4 transition-all duration-300 ease-in-out ${
            isNavVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-20 opacity-0"
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext}
            className={`rounded-full px-6 py-2 transition-colors duration-200 ${
              canGoNext
                ? "bg-black text-white hover:bg-gray-800"
                : "cursor-not-allowed bg-gray-400 text-gray-600 opacity-50"
            }`}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="rounded-full bg-black p-2 text-white hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-full px-10 md:px-20">
          <div className="type-h2-mobile mb-16 mt-20 flex border-b-[1px] border-[#AAA] py-3 font-ddin text-[#222222]">
            megaweaving Team
          </div>

          <div className="relative w-full overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={member.user_id}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: 0.28,
                  ease: [0.25, 1, 0.5, 1],
                  // 高質感經典 easeOut 曲線 (Snappy & Smooth)
                }}
                className="w-full"
              >
                {/* Main Content Grid */}
                <div className="grid grid-cols-1 gap-12 pb-20 lg:gap-20">
                  <div className="space-y-8">
                    {/* Member Image */}
                    <div className="relative mx-auto min-w-[300px] max-w-[400px] px-10 md:px-0">
                      <div className="relative aspect-[3/4] w-full">
                        <Image
                          src={getImageUrl(member.avatar_key)}
                          alt={member.member_name}
                          fill
                          priority
                          className="rounded-[50px] bg-gray-200 object-cover shadow-lg"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                      </div>
                    </div>
                    {/* Header with Member Location */}
                    <div className="mx-auto pb-2">
                      <div className="flex items-center justify-center">
                        {member.location && (
                          <div className="rounded-full bg-black px-4 py-2 text-sm text-white">
                            {member.location}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Member Name and Department */}
                    <div>
                      <h1 className="type-h4 mb-2 text-center text-[#222222] md:text-5xl">
                        {member.member_name}
                      </h1>
                      <p className="mb-4 text-xl text-[#222222]">
                        {member.title}
                      </p>
                    </div>

                    {/* Contact Information */}
                    {member.email && (
                      <div className="mb-3">
                        <p className="mb-1 text-sm uppercase tracking-wide text-[#222222]">
                          Email
                        </p>
                        <p className="text-[#222222]">{member.email}</p>
                      </div>
                    )}

                    {member.websites && member.websites?.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 text-sm uppercase tracking-wide text-[#222222]">
                          Website
                        </p>
                        {member.websites.map((website, index) => (
                          <a
                            key={index}
                            href={website.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-[#222222] transition-colors duration-150 hover:text-[#222222]"
                          >
                            {website.url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-12">
                    {/* Profile Section */}
                    {member.member_bio && (
                      <div>
                        <h2 className="mb-6 border-b border-megaweave-stone pb-4 text-2xl text-[#222222]">
                          Profile
                        </h2>
                        <p className="text-lg leading-relaxed text-[#222222]">
                          {member.member_bio}
                        </p>
                      </div>
                    )}

                    {/* Experience Section */}
                    {member.experience && member.experience.length > 0 && (
                      <div>
                        <h2 className="mb-6 border-b border-megaweave-stone pb-4 text-2xl text-[#222222]">
                          Experience
                        </h2>
                        <div className="space-y-6">
                          {member.experience.map((exp, index) => (
                            <div key={index} className="space-y-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h3 className="text-lg font-semibold text-[#222222]">
                                    {exp.position}
                                  </h3>
                                  <p className="-75 mb-2 text-[#222222]">
                                    {exp.company}
                                  </p>
                                  <p className="leading-relaxed text-[#222222]">
                                    {exp.description}
                                  </p>
                                </div>
                                <div className="-75 ml-4 flex-shrink-0 text-sm text-[#222222]">
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
                        <h2 className="mb-6 border-b border-megaweave-stone pb-4 text-2xl text-[#222222]">
                          Skills & Expertise
                        </h2>
                        <div className="flex flex-wrap gap-3">
                          {member.skills.map((skill, index) => (
                            <span
                              key={index}
                              className="bg-secondary-75 rounded-full px-4 py-2 text-sm text-white"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
};

export default MemberPage;
