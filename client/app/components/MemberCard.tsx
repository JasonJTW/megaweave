"use client";
import React, { useState, useRef } from "react";
import { teamMembers } from "../teamMembers";
import { useRouter } from "next/navigation";

// 獨立的成員卡片組件
const MemberCard = ({ member, router }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const handleMouseEnter = () => {
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div
      key={member.id}
      className="relative hover:cursor-pointer"
      onClick={() => {
        router.push(`/members/${member.id}`);
      }}
    >
      <div
        ref={containerRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        <img
          src={member.avatar}
          alt={member.name}
          className="w-full h-100 object-cover bg-gray-200 rounded-xl"
        />

        {/* Tooltip - 只在這個卡片 hover 時顯示 */}
        {showTooltip && (
          <div
            className="absolute z-10 bg-black text-white px-4 py-2 rounded-lg pointer-events-none transition-opacity duration-200"
            style={{
              left: mousePosition.x + 10,
              top: mousePosition.y - 40,
              transform: "translate(-50%)",
            }}
          >
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              <span>View Detail</span>
            </div>
          </div>
        )}
      </div>

      <div className="absolute top-4 left-4 bg-black text-white px-4 py-2 text-md rounded-full">
        {member.title}
      </div>
      <p className="text-2xl text-secondary mt-4 mb-20">{member.name}</p>
    </div>
  );
};

const TeamInfoPage = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-primary-75 overflow-hidden">
      <div className="px-10 md:px-20">
        {/* Header */}
        <div className="pt-20 pb-20">
          <div className="max-w-full mx-auto text-center">
            <h1 className="text-[123px] sm:text-[120px] md:text-[180px] lg:text-[240px] xl:text-[260px]  leading-none text-secondary font-extrabold break-words font-ddin">
              MEGAWEAVING
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="pb-20">
          <div className="max-w-full mx-auto ">
            <div className=" mb-20 md:mb-60 grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-20">
              {/* Left Column - Description */}
              <div>
                <h2 className="text-4xl md:text-5xl text-secondary-75 leading-relaxed  mb-4 -mt-4">
                  Weaving Commons of Shared Resources.
                </h2>
              </div>

              {/* Right Column - Company Info */}
              <div>
                <div className="space-y-6">
                  <div className="text-secondary text-xl">
                    <p className="pb-10">
                      This project aims to transform &quot;MEGAWEAVING&quot;, a
                      resource-sharing initiative that began as a Facebook group
                      and now has over 10,000 members, into a searchable,
                      database-driven online platform that connects idle or free
                      resources globally and facilitates transparent circulation
                      and usage of these resources between individuals and
                      communities.
                    </p>
                    <p>
                      This platform supports the free circulation of various
                      resources, with the ultimate goal of establishing an
                      inclusive infrastructure for resource mutual aid and
                      sharing, promoting environmental sustainability and social
                      equity, especially assisting those who cannot obtain basic
                      resources due to economic conditions.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner Section */}
            <div className="mt-2 md:mt-20">
              <h2 className="text-4xl text-secondary mb-2 pb-10 pt-6 border-t border-megaweave-stone relative">
                Member{" "}
                <sup className="absolute text-xl top-6 ml-3">
                  {teamMembers.length < 10
                    ? String(teamMembers.length).padStart(2, "0")
                    : teamMembers.length}
                </sup>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 mt-8">
                {teamMembers
                  .filter((member) => member.department === "Member")
                  .map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      router={router}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamInfoPage;
