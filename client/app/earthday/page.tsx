// client/app/earthday/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import localFont from "next/font/local";
import EarthdayBanner from "../components/ui/EarthdayBanner";
import EarthdayTitleEn from "../components/ui/EarthdayTitleEn";
import EarthdayTitleZh from "../components/ui/EarthdayTitleZh";
import Cloud from "../components/ui/Cloud";

const mantouSans = localFont({
  src: "../../public/fonts/MantouSans-Regular.ttf",
  variable: "--font-mantou",
});

export default function EarthDayPage() {
  return (
    <>
      <div className="fixed inset-0 bg-[#f4f5f3] -z-10"></div>
      <div
        className={`${mantouSans.variable} min-h-screen text-[#263927] font-ddin selection:bg-[#769074] selection:text-white`}
      >
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-10 px-8 py-6 flex justify-between items-center bg-[#ebefe7]/80 backdrop-blur-md">
          <div className="flex items-center space-x-2">
            {/* Logo Icon */}
            <div className="w-8 h-8 bg-[#263927] rounded-sm transform rotate-45 flex items-center justify-center">
              <div className="w-3 h-3 bg-[#ebefe7] rounded-full" />
            </div>
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            <Link href="#" className="hover:opacity-70 transition-opacity">
              關於大量交織 | About megaweaving
            </Link>
            <Link href="#" className="hover:opacity-70 transition-opacity">
              再生設計 | Regenerative Design
            </Link>
            <Link href="#" className="hover:opacity-70 transition-opacity">
              電子報 | Newsletter
            </Link>
          </div>
        </nav>

        <main className=" pt-5 pb-0 px-7 sm:px-12 max-w-7xl mx-auto">
          {/* Hero Title Section */}
          <section className="mt-12 flex flex-col items-center mb-4 md:mb-14">
            {/* English Titles Section */}
            <div className="w-full max-w-full flex justify-center mb-4 md:mb-14">
              <EarthdayTitleEn className="h-auto" />
            </div>
            {/* Chinese Titles Section */}
            <div className="w-full max-w-full flex justify-center">
              <EarthdayTitleZh className="h-auto" />
            </div>
          </section>

          {/* EarthdayBanner */}
          <div className="flex relative z-30">
            <EarthdayBanner className="h-auto" />
          </div>
        </main>
        {/* About Section */}
        <div className="font-ddin sm:-mt-[90px] relative z-20">
          <section className="bg-secondary rounded-r-[150px] sm:rounded-r-full ml-0 mr-14 px-7 sm:px-12 py-12 md:p-20">
            <div className="max-w-[94%]">
              <h3 className="text-[26px] sm:text-[48px] font-bold mb-2 sm:mb-9 text-primary-75">
                About megaweaving
              </h3>
              <p className="text-[14px] sm:type-h3  !font-semibold mb-8 text-[#222222] text-justify break-words">
                From a 10,000+ member facebook group to a global database,
                megaweaving connects idle resources with those in need. We
                foster a transparent, sustainable, and inclusive network for
                mutual aid and resource sharing.
              </p>
              <p className="text-[14px] sm:type-h3 !font-semibold tracking-normal text-[#222222] text-justify break-all">
                從臉書萬人社群進化為全球資源資料庫，megaweaving連結閒置資源與需求。我們致力於建構透明、永續且包容的互助網路，讓資源共享更簡單。
              </p>
            </div>
          </section>
        </div>

        {/* Cloud positioned on the boundary */}
        <div className="relative z-50 h-0 flex justify-end">
          <Cloud className="w-[125px] sm:w-[275px] -translate-y-2/3 sm:-translate-y-1/2 mr-4 sm:mr-0" />
        </div>
        {/* Regenerative Design Section */}
        <section className="font-ddin relative isolate -mt-[15px] sm:-mt-[40px] z-10">
          {/* Background Layer: Starts further to the right */}
          <div className="absolute inset-y-0 right-0 left-1/4 bg-[#D6E3D4] rounded-l-[140px] sm:rounded-l-full -z-10" />

          {/* Content Layer: Starts normally, so it bleeds out to the left */}
          <div className="px-7 sm:px-12 md:px-24 md:p-20">
            <div className="max-w-[100%]">
              <div className="flex justify-between pt-14 sm:pt-0 font-bold mb-9 text-primary">
                <h3 className=" text-[24px] sm:text-[68px]">再生設計</h3>
                <h3 className=" text-[26px] sm:text-[68px]">
                  Regenerative Design
                </h3>
              </div>
              <p className="text-[14px] sm:type-h3 !font-semibold mb-8 text-[#222222] text-justify break-words">
                From a 10,000+ member facebook group to a global database,
                megaweaving connects idle resources with those in need. We
                foster a transparent, sustainable, and inclusive network for
                mutual aid and resource sharing.
              </p>
              <p className="pb-14 sm:pb-0 text-[14px] sm:type-h3 !font-semibold tracking-normal text-[#222222] text-justify break-all">
                從臉書萬人社群進化為全球資源資料庫，megaweaving連結閒置資源與需求。我們致力於建構透明、永續且包容的互助網路，讓資源共享更簡單。
              </p>
            </div>
          </div>
        </section>
        {/* Decorative Blobs in corners */}
      </div>
    </>
  );
}
