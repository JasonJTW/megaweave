// client/app/earthday/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import localFont from "next/font/local";
import EarthdayBanner from "../components/ui/EarthdayBanner";
import EarthdayTitleEn from "../components/ui/EarthdayTitleEn";
import EarthdayTitleZh from "../components/ui/EarthdayTitleZh";
import Cloud from "../components/ui/Cloud";
import DividerStart from "../components/ui/DividerStart";
import DividerEnd from "../components/ui/DividerEnd";
import Image from "next/image";

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
              <p className="text-[14px] sm:text-2xl !font-medium tracking-normal text-[#222222] text-justify break-all">
                「大量交織」是在 Facebook 發起、現已有超過 12000
                名成員參與的社團，它就像一座橋，支持各類資源自由流通，橋的一端是「溢出」，一端是「需求」，有多餘資源的人與有需求的人，都能在社群中互相連結、互相幫助。
              </p>
              <p className=" mt-8 text-[14px] sm:text-2xl !font-medium mb-8 text-[#222222] text-justify break-words">
                “megaweaving” began as a Facebook group and now boasts over
                12,000 members. It acts like a bridge that supports the free
                flow of resources. On one end is “surplus,” and on the other is
                “need.” Those who have excess resources and those who are
                seeking them can connect, exchange, and support one another
                within the community.
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

        <div className=" sm:mx-[200px] relative flex justify-between translate-y-1/2 z-30">
          <DividerStart />
          <DividerEnd />
        </div>
        <div className="bg-white flex flex-col mt-10 md:mt-0 mx-auto xl:mx-[141px] px-8 py-10 md:pl-[60px] md:pr-[58px] md:py-[80px] mb-20 relative z-20 overflow-hidden">
          {/* Content grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
            {/* Left Column Area (Nancy Ma + Images) */}
            <div className="md:col-span-7 flex flex-col md:pr-4 min-w-0">
              {/* Left Header Part */}
              <div className="flex items-center h-[40px] sm:h-[50px] md:h-[55px] lg:h-[76px] mb-8 sm:mb-12">
                <h2 className="text-xl sm:text-2xl lg:text-[32px] font-bold whitespace-nowrap mr-6 text-primary">
                  Nancy Ma
                </h2>
                <div className="h-[1px] bg-primary flex-grow md:mr-[-64px] relative z-10"></div>
              </div>

              {/* Images Content */}
              <div className="flex flex-col gap-10">
                <Image
                  src="/assets/nancyp1.png"
                  alt=""
                  width={659}
                  height={279}
                  className="w-full h-auto"
                />

                <div className="flex flex-col gap-3">
                  <Image
                    src="/assets/nancyp2.png"
                    alt=""
                    width={659}
                    height={279}
                    className="w-full h-auto"
                  />
                  <p className="text-[12px] font-bold text-[#263927]">
                    ▲ 茶壺衣二號 | Teapot Cosy No. 2
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <Image
                    src="/assets/nancyp3.png"
                    alt=""
                    width={659}
                    height={279}
                    className="w-full h-auto"
                  />
                  <p className="text-[12px] font-bold text-[#263927]">
                    ▲ Sisyphos
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column Area (Title + Text Content) */}
            <div className="md:col-span-5 flex flex-col font-ddin min-w-0">
              {/* Right Header Part (100 Teapots) */}
              <div className="flex items-center h-[40px] sm:h-[50px] md:h-[55px] lg:h-[76px] mb-8 sm:mb-12">
                <div className="text-3xl sm:text-4xl md:text-[40px] lg:text-[54px] xl:text-[72px] font-bold text-right leading-[1.05] text-[#6e8568] w-full">
                  100 Teapots
                </div>
              </div>

              {/* Title Part (in 100 Days) */}
              <h1 className="text-3xl sm:text-4xl md:text-[40px] lg:text-[54px] xl:text-[72px] font-bold text-right leading-[1.05] mb-12 text-[#6e8568] w-full">
                in
                <br />
                100 Days
              </h1>

              {/* Chinese Text */}
              <div className="text-[13px] text-justify space-y-6 mb-4 font-semibold tracking-wide !leading-[1.9] text-[#222222]">
                <p>
                  《100 Teapots in 100 Days*》是持續發展中的系列，萃取自一批英國
                  Liberty 百貨回收再利用的零碼印花布中。創作一開始以 3D
                  建模分割茶壺的弧型曲面，轉成 2D
                  版型；再進一步簡化，最終形成一件剪裁優雅、可愛又保暖的茶壺衣。
                </p>
                <p>
                  系列發展過程中，因為一趟柏林之行帶來新的轉折。這座城市的矛盾氣質，以及理性秩序中刻意保留的頹廢感，促成了作品「Sisyphos」的誕生。作品以四道連續的鬆緊帶沿設定路徑自由伸縮，構成保暖的功能性，卻超越人們對傳統茶壺保溫罩的印象。
                </p>
                <p>
                  Sisyphos 之名取自柏林年輕人間具代表性的
                  club。當地大學生談到他們生活現況時提到：雖然稅負高，但政府保障每個人都有住所，因此多數人不以「有房有車」為人生目標。他們在日復一日完成自己的工作之間，也像薛西弗斯在永恆勞動之前，仍盡情享受人世生命的自由與歡愉。
                </p>
              </div>
              <p className="text-[10px] text-gray-500 mb-4 leading-relaxed font-medium">
                *名稱受 Marino Gamper 在 2007出版「100 Chairs in 100 Days and
                its 100 Ways」啟發。
              </p>

              {/* Flexible spacer to align English footnote bottom with third image bottom */}
              <div className="hidden md:block flex-grow" />

              {/* English Text */}
              <div className="text-[13px] text-justify space-y-5 mb-4 font-semibold !leading-[1.8] text-[#222222]">
                <p>
                  &quot;100 Teapots in 100 Days*&quot; is an ongoing series
                  brewed from reclaimed Liberty printed fabric samples. The
                  project began by translating the curved surfaces of a teapot
                  from 3D models into simplified 2D patterns, resulting in
                  elegantly tailored and functional teapot cozies.
                </p>
                <p>
                  A trip to Berlin reframed the direction of the work. The
                  city&apos;s tension between rational order and cultivated
                  decay inspired the piece &quot;Sisyphos,&quot; which uses
                  elastic bands that expand and contract along set paths to form
                  an insulating structure that reimagines the traditional teapot
                  cozy.
                </p>
                <p>
                  The title &quot;Sisyphos&quot; references a well-known Berlin
                  club and reflects a local attitude toward life: despite high
                  taxes, secure housing reduces the emphasis on ownership,
                  allowing space for freedom and everyday enjoyment — echoing
                  Sisyphus, who, before his eternal labour, still revelled in
                  the freedom and pleasures of life.
                </p>
              </div>
              <p className="text-[10px] text-gray-500 mb-0 leading-relaxed font-medium">
                *The series title is inspired by Marino Gamper&apos;s 100 Chairs
                in 100 Days and Its 100 Ways (2007).
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
