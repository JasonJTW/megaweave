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
import EmailIcon from "@/app/components/icons/EmailIcon";
import { useNavbar } from "@/app/contexts/NavBarContext";
import WebsiteIcon from "@/app/components/icons/WebsiteIcon";
import TitleBadgeIcon1 from "@/app/components/icons/TitleBadge1";
import TitleBadgeIcon2 from "@/app/components/icons/TitleBadge2";
import TitleBadgeIcon3 from "@/app/components/icons/TitleBadge3";
import TitleBadgeIcon4 from "@/app/components/icons/TitleBadge4";
import TitleBadgeIcon5 from "@/app/components/icons/TitleBadge5";
import TitleBadgeIcon6 from "@/app/components/icons/TitleBadge6";
import { RefractiveDiv } from "@/app/components/Refractive";
import BgCloud from "@/app/components/icons/BgCloud";

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

  const { isNavbarVisible, hasUserScrolled } = useNavbar();

  // 進入頁面時按鈕預設顯示；使用者開始滑動後才跟隨 Navbar 動態顯示/隱藏
  const isNavButtonsVisible = !hasUserScrolled || isNavbarVisible;

  // 當網址 id 變更時同步內部 currentId
  useEffect(() => {
    if (routeMemberId && !isNaN(routeMemberId)) {
      setCurrentId(routeMemberId);
    }
  }, [routeMemberId]);

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

  const titleLocation = [
    "right-0 top-12",
    "-left-2 top-10",
    "-left-4 bottom-12",
    "-right-4 top-12",
    "-right-6 bottom-12",
    "-left-6 top-10",
  ];

  const titleBadges = [
    TitleBadgeIcon1,
    TitleBadgeIcon2,
    TitleBadgeIcon3,
    TitleBadgeIcon4,
    TitleBadgeIcon5,
    TitleBadgeIcon6,
  ];

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 -z-10 bg-primary-5"></div>
        <div className="flex min-h-screen items-center justify-center bg-primary-5">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-secondary"></div>
            <p className="font-ddin text-[#222222]">Loading member data...</p>
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
              className="rounded-full bg-black px-6 py-2 text-white md:hover:bg-gray-400"
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
      <div className="relative mx-auto min-h-screen max-w-3xl overflow-x-hidden bg-primary-5 font-ddin">
        {/* Navigation */}
        <div
          className={`fixed left-8 top-1/2 z-50 transition-all duration-300 ease-in-out ${
            isNavButtonsVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-20 opacity-0"
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            className={`rounded-full px-2 py-2 transition-colors duration-200 ${
              canGoPrevious
                ? "text-[#222222] md:hover:bg-gray-400"
                : "text-white opacity-0"
            }`}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
        </div>

        <div
          className={`fixed right-8 top-1/2 z-50 flex gap-4 transition-all duration-300 ease-in-out ${
            isNavButtonsVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-20 opacity-0"
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={!canGoNext}
            className={`rounded-full px-2 py-2 transition-colors duration-200 ${
              canGoNext
                ? "text-[#222222] md:hover:bg-gray-400"
                : "cursor-not-allowed text-white opacity-0"
            }`}
          >
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="fixed right-4 top-40 z-20">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="h-6 min-h-0 w-6 min-w-0 rounded-full bg-black p-0 text-white hover:bg-gray-800 [&_svg]:!size-3"
          >
            <X />
          </Button>
        </div>

        <div className="w-full px-10 md:px-20">
          <div className="type-h2-mobile mb-14 mt-0 flex justify-center border-b-[1px] border-[#AAA] py-3 text-center font-ddin tracking-wide text-[#222222]">
            megaweaving Team
          </div>

          <div className="relative w-full">
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
                <div className="grid grid-cols-1 pb-10 md:gap-10">
                  <div className="">
                    {/* Member Image */}
                    <div className="relative mx-auto min-w-[300px] max-w-[400px] px-10 md:px-0">
                      <div className="relative aspect-[3/4] w-full select-none">
                        <Image
                          src={getImageUrl(member.avatar_key)}
                          alt={member.member_name}
                          fill
                          priority
                          draggable={false}
                          onContextMenu={(e) => e.preventDefault()}
                          className="pointer-events-none select-none rounded-[45px] bg-gray-200 object-cover shadow-lg brightness-90"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        <div
                          className={`absolute ${titleLocation[member.index % titleLocation.length]} z-50 flex flex-col items-center justify-center`}
                        >
                          {(() => {
                            const BadgeIcon =
                              titleBadges[member.index % titleBadges.length];
                            return (
                              <BadgeIcon className="absolute w-[62px] sm:w-[80px]" />
                            );
                          })()}
                          <div className="relative z-[60] w-[47px] text-center text-[9px] leading-tight text-white sm:w-[70px] sm:text-[13px]">
                            {member.title}
                          </div>
                        </div>
                        <div className="absolute -left-40 top-4 -z-10 w-60">
                          <BgCloud className="" />
                        </div>
                      </div>
                    </div>

                    <div className="mx-auto -mt-6 flex items-center justify-center">
                      {member.location && (
                        <RefractiveDiv
                          className="rounded-full bg-primary-75/20 px-4 py-2 mix-blend-lighten"
                          refraction={{
                            radius: 20,
                            blur: 2,
                            glassThickness: 80,
                            bezelWidth: 10,
                            specularOpacity: 0.5,
                            specularAngle: 20,
                          }}
                        >
                          <span className="text-white mix-blend-lighten">
                            {member.location}
                          </span>
                        </RefractiveDiv>
                      )}
                    </div>
                    {/* Member Name and Department */}
                    <div className="mb-2 mt-8 md:mb-28 md:mt-12">
                      <h1 className="type-h4 text-center text-[#222222] md:text-5xl">
                        {member.member_name}
                      </h1>
                    </div>

                    {/* Contact Information */}
                    {member.email && (
                      <div className="flex items-center justify-start gap-3 text-[18px]">
                        <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                          <EmailIcon className="mt-0.5" />
                        </div>
                        {member.email}
                      </div>
                    )}

                    {member.websites && member.websites?.length > 0 && (
                      <div className="flex items-center justify-start gap-3 text-[18px]">
                        <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                          <WebsiteIcon className="mt-0.5" />
                        </div>
                        {member.websites.map((website, index) => (
                          <a
                            key={index}
                            href={website.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate break-all text-[#222222] hover:underline"
                          >
                            {website.url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="">
                    {/* Profile Section */}
                    {member.member_bio && (
                      <div className="mt-10">
                        <p className="text-justify text-[20px] font-medium leading-relaxed text-[#222222]">
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
