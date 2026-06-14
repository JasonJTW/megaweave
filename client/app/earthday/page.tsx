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
import WeavingIcon from "../components/icons/WeavingIcon";
import NancyIcon from "../components/icons/NancyIcon";
import YellowMonkeyIcon from "../components/icons/YellowMonkeyIcon";
import MochaIcon from "../components/icons/MochaIcon";
import SponsorBanner from "../components/icons/Sponsor";
// import { useUser } from "../contexts/UserContext";

const mantouSans = localFont({
  src: "../../public/fonts/MantouSans-Regular.ttf",
  variable: "--font-mantou",
});

export default function EarthDayPage() {
  // const { user } = useUser();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  // Lock body scroll when mobile menu is open
  React.useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen]);

  return (
    <>
      <div className="fixed inset-0 bg-[#f4f5f3] -z-10"></div>
      <div
        className={`${mantouSans.variable} min-h-screen text-[#263927] font-ddin selection:bg-[#769074] selection:text-white`}
      >
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center bg-[#ebefe7]/80 backdrop-blur-md transition-all duration-300">
          <div className="flex items-center space-x-2">
            {/* Logo Icon */}
            <Link
              href={"/"}
              className="w-8 h-8 flex items-center justify-center hover:opacity-70 transition-opacity"
            >
              <WeavingIcon className="text-primary" />
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-8 text-sm font-medium">
            <Link href="#about" className="hover:opacity-70 transition-opacity">
              關於大量交織 | About megaweaving
            </Link>
            <Link
              href="#regenerative"
              className="hover:opacity-70 transition-opacity"
            >
              再生設計 | Regenerative Design
            </Link>
            <Link
              href="#follow"
              className="hover:opacity-70 transition-opacity"
            >
              追蹤我們 | Follow Us
            </Link>
          </div>
        </nav>

        {/* Mobile Toggle Button (Fixed outside nav to stay above overlay) */}
        <button
          className="md:hidden fixed top-6 right-8 w-8 h-8 flex flex-col justify-center items-center space-y-1.5 focus:outline-none z-[75]"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle Menu"
        >
          <span
            className={`block w-6 h-0.5 bg-primary transition-all duration-300 ${isMenuOpen ? "rotate-45 translate-y-2 bg-[#446237]" : "bg-primary"}`}
          ></span>
          <span
            className={`block w-6 h-0.5 bg-primary transition-all duration-300 ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
          ></span>
          <span
            className={`block w-6 h-0.5 bg-primary transition-all duration-300 ${isMenuOpen ? "-rotate-45 -translate-y-2 bg-[#446237]" : "bg-primary"}`}
          ></span>
        </button>

        {/* Mobile Menu Overlay */}
        <div
          className={`fixed inset-0 z-[60] bg-[#ebefe7]/95 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500 ease-in-out ${isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"} md:hidden`}
        >
          <div className="flex flex-col space-y-12 text-center px-8 w-full max-w-xs mx-auto">
            <Link
              href="#about"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary group-hover:opacity-70 transition-opacity">
                關於大量交織
              </span>
              <span className="text-[13px] font-medium text-primary/60 mt-1 uppercase tracking-widest text-[#446237]">
                About megaweaving
              </span>
            </Link>
            <Link
              href="#regenerative"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary group-hover:opacity-70 transition-opacity">
                再生設計
              </span>
              <span className="text-[13px] font-medium text-primary/60 mt-1 uppercase tracking-widest text-[#446237]">
                Regenerative Design
              </span>
            </Link>
            <Link
              href="#follow"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary group-hover:opacity-70 transition-opacity">
                追蹤我們
              </span>
              <span className="text-[13px] font-medium text-primary/60 mt-1 uppercase tracking-widest text-[#446237]">
                Follow Us
              </span>
            </Link>
          </div>
        </div>

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
        <div
          id="about"
          className="font-ddin sm:-mt-[90px] relative z-10 scroll-mt-24"
        >
          <section className="relative bg-secondary rounded-r-[150px] sm:rounded-r-full ml-0 mr-14 px-7 sm:px-12 py-12 md:p-20 -z-40">
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
        <div className="relative z-30 h-0 flex justify-end">
          <Cloud className="w-[125px] sm:w-[275px] -translate-y-2/3 sm:-translate-y-2/3 mr-4 sm:mr-0" />
        </div>
        {/* Regenerative Design Section */}
        <section className="font-ddin relative -mt-[15px] sm:-mt-[40px] z-20 scroll-mt-24">
          {/* Background Layer: Starts further to the right */}
          <div className="absolute inset-y-0 right-0 left-1/2 bg-[#D6E3D4] rounded-l-[140px] sm:rounded-l-full -z-10" />

          {/* Content Layer: Starts normally, so it bleeds out to the left */}
          <div className="px-7 sm:px-12 md:px-24 md:pt-32 mb-16 pb-10 sm:pb-10">
            <div className="max-w-[100%]">
              <div className="flex justify-between pt-14 sm:pt-0 font-bold mb-9 text-primary">
                <h3 className=" text-[24px] sm:text-[68px]">再生設計</h3>
                <h3 className=" text-[26px] sm:text-[68px]">
                  Regenerative Design
                </h3>
              </div>
              <p className="text-[14px] sm:text-2xl !font-medium tracking-normal text-[#222222] text-justify break-all">
                為了讓這份共享精神走得更遠，「大量交織」開啟了「再生設計（Regenerative
                Design）」子計畫。我們想邀請對創作有熱忱的夥伴加入，透過創意賦予材質新生命，讓設計本身成為修復與再生生態系的力量，將資源轉化為更有意義的作品！
                同時，以今年的地球日作為契機，向大家介紹目前加入的幾位夥伴，以及分享他們近期的一些嚐試，也藉此機會，歡迎有興趣的朋友一起加入這個計畫！
              </p>
              <p className="mt-8 text-[14px] sm:text-2xl !font-medium tracking-normal text-[#222222] text-justify break-words">
                To take this spirit of sharing further, &quot;megaweaving&quot;
                has launched the &quot;Regenerative Design&quot; initiative. We
                invite partners passionate about creation to join us in giving
                materials new life through creativity, allowing design itself to
                become a force for restoring and regenerating the ecosystem, and
                transforming resources into more meaningful works!
                <br /> Taking this Earth Day as an opportunity, we would like to
                introduce the partners who have joined us and share some of
                their recent experiments. We also welcome interested friends to
                join this project!
              </p>
            </div>
          </div>
        </section>

        <div className="h-10 md:h-auto -mt-12 sm:mx-[200px] relative flex justify-between translate-y-1/3 z-30">
          <DividerStart className="text-secondary h-full" />
          <DividerEnd className="h-full" />
        </div>
        <div
          className="bg-white flex flex-col mt-0 md:mt-0 mx-6 sm:mx-auto max-w-[1160px] px-8 pt-10 md:pl-[60px] md:pr-[58px] md:pt-[80px] relative z-20 overflow-hidden "
          id="regenerative"
        >
          {/* Content grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
            {/* Left Column Area (Nancy Ma + Images) */}
            <div className="md:col-span-7 flex flex-col md:pr-4 min-w-0">
              {/* Left Header Part (Mobile Unified) */}
              <div className="md:hidden flex flex-col mb-10 font-ddin">
                <div className="flex items-center">
                  <h2 className="text-[22px] sm:text-2xl font-bold whitespace-nowrap mr-3 sm:mr-4 text-primary">
                    Nancy Ma
                  </h2>
                  <div className="h-[1px] bg-primary flex-grow mr-4 relative z-10"></div>
                  <div className="text-[26px] sm:text-3xl font-bold text-right leading-[1.05] text-[#6e8568]">
                    100 Teapots
                  </div>
                </div>
                <h1 className="text-[26px] sm:text-3xl font-bold text-right leading-[1.05] mt-1 text-[#6e8568]">
                  in
                  <br />
                  100 Days
                </h1>
              </div>

              {/* Left Header Part (Desktop Only) */}
              <div className="hidden md:flex items-center h-[55px] lg:h-[76px] mb-12">
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

                {/* Mobile Text Content (visible only on mobile, placed between images) */}
                <div className="md:hidden flex flex-col font-ddin mt-2 mb-2">
                  <div className="text-[13px] text-justify space-y-6 mb-4 font-semibold tracking-wide !leading-[1.9] text-[#222222]">
                    <p>
                      《100 Teapots in 100
                      Days*》是持續發展中的系列，萃取自一批英國 Liberty
                      百貨回收再利用的零碼印花布中。創作一開始以 3D
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
                  <p className="text-[10px] text-gray-500 mb-8 leading-relaxed font-medium">
                    *名稱受 Marino Gamper 在 2007出版「100 Chairs in 100 Days
                    and its 100 Ways」啟發。
                  </p>

                  <div className="text-[13px] text-justify space-y-5 mb-4 font-semibold !leading-[1.8] text-[#222222]">
                    <p>
                      &quot;100 Teapots in 100 Days*&quot; is an ongoing series
                      brewed from reclaimed Liberty printed fabric samples. The
                      project began by translating the curved surfaces of a
                      teapot from 3D models into simplified 2D patterns,
                      resulting in elegantly tailored and functional teapot
                      cozies.
                    </p>
                    <p>
                      A trip to Berlin reframed the direction of the work. The
                      city&apos;s tension between rational order and cultivated
                      decay inspired the piece &quot;Sisyphos,&quot; which uses
                      elastic bands that expand and contract along set paths to
                      form an insulating structure that reimagines the
                      traditional teapot cozy.
                    </p>
                    <p>
                      The title &quot;Sisyphos&quot; references a well-known
                      Berlin club and reflects a local attitude toward life:
                      despite high taxes, secure housing reduces the emphasis on
                      ownership, allowing space for freedom and everyday
                      enjoyment — echoing Sisyphus, who, before his eternal
                      labour, still revelled in the freedom and pleasures of
                      life.
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-0 leading-relaxed font-medium">
                    *The series title is inspired by Marino Gamper&apos;s 100
                    Chairs in 100 Days and Its 100 Ways (2007).
                  </p>
                </div>

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
            <div className="hidden md:flex md:col-span-5 flex-col font-ddin min-w-0">
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
          {/* Teapot Cosy Making Process Gallery Section */}
          <div className="mt-14 md:mt-24">
            <div className="flex flex-col-reverse md:flex-row gap-2 md:gap-16 items-stretch">
              {/* Left Column: Icon at top, Caption at bottom */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="hidden sm:block w-[120px] sm:w-[160px] md:w-[200px] -ml-4 md:-ml-[60px]">
                  <YellowMonkeyIcon className="w-full h-auto" />
                </div>

                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-2 md:mt-0 flex items-center text-[12px] md:text-[14px] font-bold text-[#263927] tracking-tight">
                  <span className="text-[10px] md:text-[12px] mr-1">
                    <span className="md:hidden">▲</span>
                    <span className="hidden md:inline">▶</span>
                  </span>
                  <span className="whitespace-nowrap">
                    茶壺衣製作過程 | Teapot Cosy Making Process
                  </span>
                </div>
              </div>

              {/* Right Column: Image Placeholder */}
              <div className="flex-1 w-full">
                <Image
                  src="/assets/nancyp4.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="w-full h-auto"
                />
              </div>
            </div>

            {/* Berlin - Mobile Layout */}
            <div className="mt-8 flex gap-4 md:hidden">
              {/* Left Image + Caption */}
              <div className="flex-1 flex flex-col">
                <Image
                  src="/assets/nancyp5.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="w-full h-auto mb-2"
                />
                <div className="flex items-start text-[11px] font-bold text-[#263927] tracking-tight">
                  <span className="text-[9px] mr-1">▲</span>
                  <span className="whitespace-nowrap">Sisyphos, Berlin</span>
                </div>
              </div>

              {/* Right Image + Caption */}
              <div className="flex-1 flex flex-col">
                <Image
                  src="/assets/nancyp6.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="w-full h-auto mb-2"
                />
                <div className="flex items-start text-[11px] font-bold text-[#263927] tracking-tight">
                  <span className="text-[9px] mr-1">▲</span>
                  <p className="leading-[1.4]">
                    Friedrichshain 附近的路橋下，時常有隨機的人聚集放音樂跳舞
                    <br />
                    <span className="font-normal text-[10px] text-[#555] leading-tight block mt-1">
                      Beneath the overpasses near Friedrichshain, people often
                      gather spontaneously to play techno music and dance.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Berlin - Desktop Layout */}
            <div className="mt-8 hidden md:flex flex-row gap-16 items-stretch">
              {/* Left Column: Icon at top, Caption at bottom */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="flex gap-4">
                  <Image
                    src="/assets/nancyp5.jpg"
                    alt=""
                    width={659}
                    height={279}
                    className="w-full h-auto"
                  />
                  <Image
                    src="/assets/nancyp6.jpg"
                    alt=""
                    width={659}
                    height={279}
                    className="w-full h-auto"
                  />
                </div>

                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-10 md:mt-0 flex items-center text-[12px] md:text-[14px] font-bold text-[#263927] tracking-tight">
                  <span className="text-[10px] md:text-[12px]">▲</span>
                  <span className="whitespace-nowrap">Sisyphos, Berlins</span>
                </div>
              </div>

              {/* Right Column: Image Placeholder */}
              <div className="flex-1 w-full">
                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-10 md:mt-0 flex items-start text-[12px] md:text-[14px] font-bold text-[#263927] tracking-tight">
                  <span className="text-[10px] md:text-[12px]">▶</span>
                  <p className="">
                    Friedrichshain 附近的路橋下，時常有隨機的人聚集放音樂跳舞
                    Beneath the overpasses near Friedrichshain, people often
                    gather spontaneously to play techno music and dance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Nancy Ma Bio Section */}
          <div className="mx-auto mt-16 pb-10 md:pb-16 lg:pb-16">
            {/* Mobile Layout */}
            <div className="md:hidden flex flex-col font-ddin">
              {/* Top: Name Header + Graphic */}
              <div className="flex flex-col mb-6">
                <div className="w-[120px] -ml-5 -mb-1 relative z-10">
                  <NancyIcon className="w-full h-auto" />
                </div>
                <h2 className="text-[28px] font-bold whitespace-nowrap text-megaweave-forest-dark relative z-20">
                  Nancy Ma
                </h2>
              </div>

              {/* Middle: Chinese Bio */}
              <div className="text-[15px] text-justify font-bold tracking-wide leading-[1.6] text-[#222222] mb-6">
                <p>
                  台灣建築設計師，現居倫敦。擅長從日常物件中發掘新的觀看方式，並透過她與物件獨特的互動，創造材料與形式的新可能。創作聚焦在環境保護與再生設計，嘗試以空間裝置與影像創作，為長期被忽視的人與非人發聲。
                </p>
              </div>

              {/* Bottom: English Bio */}
              <div className="text-[15px] text-justify font-medium leading-[1.6] text-[#222222]">
                <p>
                  Nancy Ma is a Taiwanese architectural designer based in
                  London. She explores new ways of seeing through ordinary
                  objects, extending the possibilities of materials and forms
                  through sculptural and material exploration, with a sensitive
                  and intuitive approach to physical relationships. Her work
                  focuses on ecological care and regenerative design, using
                  spatial installations and essay films to give voice to
                  overlooked human and non-humans.
                </p>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex gap-4 sm:gap-20 items-stretch">
              {/* Left: Name Header + Circular Graphic */}
              <div className="flex flex-col justify-between">
                {/* Header row */}
                <div className="flex w-full mb-10">
                  <h2 className="text-xl sm:text-5xl lg:text-5xl font-bold whitespace-nowrap text-megaweave-forest-dark">
                    Nancy Ma
                  </h2>
                </div>

                {/* Circular graphic placeholder */}
                <div className="absolute bottom-0 w-full flex ">
                  <NancyIcon className="" />
                </div>
              </div>

              {/* Right: Bio Text */}
              <div className="md:col-span-7 flex flex-col font-ddin sm:-mt-4">
                {/* Chinese Bio */}
                <div className="text-[16px] text-justify space-y-4 mb-6 font-medium tracking-normal leading-[1.5] text-[#222222]">
                  <p>
                    台灣建築設計師，現居倫敦。擅長從日常物件中發掘新的觀看方式，並透過她與物件獨特的互動，創造材料與形式的新可能。創作聚焦在環境保護與再生設計，嘗試以空間裝置與影像創作，為長期被忽視的人與非人發聲。
                  </p>
                </div>
                {/* English Bio */}
                <div className="text-[16px] text-justify font-medium leading-[1.5] text-[#222222]">
                  <p>
                    Nancy Ma is a Taiwanese architectural designer based in
                    London. She explores new ways of seeing through ordinary
                    objects, extending the possibilities of materials and forms
                    through sculptural and material exploration, with a
                    sensitive and intuitive approach to physical relationships.
                    Her work focuses on ecological care and regenerative design,
                    using spatial installations and essay films to give voice to
                    overlooked human and non-humans.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="sm:mx-32 relative flex justify-between  z-30 -translate-y-1/3 h-10 sm:h-auto">
          <DividerStart className="text-secondary h-full" />
          <DividerEnd className="h-full" />
        </div>

        {/* Starting with megaweaving Section */}
        <div
          className="bg-white flex flex-col mt-0 md:-mt-16 mx-6 sm:mx-auto max-w-[1160px] px-8 pt-10 md:px-[120px] md:pt-[100px] relative z-20 overflow-hidden "
          id="regenerative"
        >
          {/* Main Hero Header */}
          <div className="flex w-full mb-10 md:mb-16">
            <h1 className="text-2xl sm:text-5xl lg:text-[64px] font-bold text-[#62775f] leading-none">
              Starting with megaweaving
            </h1>
          </div>

          {/* Mobile Only: Practice WWMM Header & Image injected before text */}
          <div className="md:hidden flex flex-col w-full mb-8 font-ddin">
            <div className="flex items-center mb-6 w-full -mt-2">
              <div className="h-[1px] bg-[#62775f]/50 flex-grow mr-4"></div>
              <h2 className="text-[20px] font-bold text-[#446237] leading-none text-right whitespace-nowrap tracking-wide">
                practice WWMM
              </h2>
            </div>
            <Image
              src="/assets/wwmmp1.jpg"
              alt=""
              width={659}
              height={900}
              className="w-full h-auto object-cover"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
            {/* Left: Text Content */}
            <div className="md:col-span-6 flex font-ddin">
              <div className="w-[2px] bg-primary-30 shrink-0 ml-4 mr-8 hidden md:block" />
              <div className="flex flex-col py-4 md:pr-4">
                <div className="text-[16px] text-justify space-y-6 mb-8 font-medium tracking-wide leading-[1.5] text-[#222222]">
                  <p>
                    物品沒有統一的規格與特定的顏色。製作的過程像是不太準確的翻譯工作，將物件從過去帶往未來。
                    <br />
                    來源無法被控制的材料，透過三人的交織轉譯成為一種新的型態：泡泡紙成為透光的表皮，舊耳機線成為經緯，塑膠網與繩索相互交織。
                  </p>
                  <p>
                    材質間的碰撞產生更多想像。物件被丟棄之前是什麼?之後可能成為什麼?
                  </p>
                </div>

                <div className="text-[16px] tracking-wide space-y-5 font-medium leading-[1.5] text-[#222222] break-all">
                  <p>
                    Objects have no standard forms or fixed colors. Creating
                    this work is like a &quot;loose translation&quot; — a way to
                    move things from the past into the future.
                    <br />
                    Since we cannot control where the materials come from, the
                    three of us transform them into new forms: bubble wrap
                    becomes a glowing skin; old earphone wires become the warp
                    and weft; plastic nets and ropes tie it all together.
                  </p>
                  <p>
                    When different materials meet, new ideas grow. What were
                    these objects before they were thrown away? And what can
                    they become next?
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Large Vertical Image (Hidden on mobile as it's moved up) */}
            <div className="hidden md:flex md:col-span-6 justify-end">
              <Image
                src="/assets/wwmmp1.jpg"
                alt=""
                width={659}
                height={900}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>

          {/* Practice section with 5 images */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start mt-12">
            {/* Row 1: Title + 3 images (Title hidden on mobile as it's moved up) */}
            <div className="hidden md:flex flex-col font-ddin py-4">
              <h2 className="text-[20px] sm:text-2xl font-bold text-[#446237] leading-tight mb-6">
                practice
                <br />
                WWMM
              </h2>
            </div>

            <Image
              src="/assets/wwmmp2.jpg"
              alt=""
              width={659}
              height={879}
              className="col-span-2 md:col-span-1 w-full h-auto object-cover aspect-[3/4]"
            />
            <Image
              src="/assets/wwmmp3.jpg"
              alt=""
              width={659}
              height={879}
              className="w-full h-auto object-cover aspect-[3/4]"
            />
            <Image
              src="/assets/wwmmp4.jpg"
              alt=""
              width={659}
              height={879}
              className="w-full h-auto object-cover aspect-[3/4]"
            />

            {/* Row 2: 2 images */}
            <Image
              src="/assets/wwmmp5.jpg"
              alt=""
              width={659}
              height={879}
              className="w-full h-auto object-cover aspect-[3/4]"
            />
            <Image
              src="/assets/wwmmp6.jpg"
              alt=""
              width={659}
              height={879}
              className="w-full h-auto object-cover aspect-[3/4]"
            />

            {/* Row 3: 1 large image spanning 2 cols, 1 normal image */}
            <Image
              src="/assets/wwmmp7.jpg"
              alt=""
              width={659}
              height={879}
              className="col-span-2 md:col-start-1 w-full h-auto object-cover aspect-[4/3] md:aspect-[1.6]"
            />
            <Image
              src="/assets/wwmmp8.jpg"
              alt=""
              width={659}
              height={879}
              className="col-span-2 md:col-span-1 w-full h-auto object-cover aspect-[3/4]"
            />
          </div>
          {/* Nancy Ma (second artist) Bio Section */}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start mt-12">
            {/* Left: Name Header + Portrait placeholder */}
            <div className="md:col-span-4 flex flex-col items-start font-ddin">
              <div className="flex items-center w-full mt-5 sm:mt-1">
                <h2 className="text-[32px] hidden sm:block sm:text-4xl lg:text-5xl font-bold whitespace-nowrap mr-6 text-[#446237] leading-[1.1]">
                  practice <br /> WWMM
                </h2>
                <h2 className="text-[32px] sm:hidden sm:text-4xl lg:text-5xl font-bold whitespace-nowrap mr-6 text-[#446237] leading-[1.1]">
                  practice WWMM
                </h2>
              </div>
            </div>

            {/* Right: Text */}
            <div className="md:col-span-8 flex flex-col font-ddin">
              <div className="text-[16px] tracking-normal space-y-5 font-medium pb-[100px] sm:pb-[340px] break-all leading-[1.6] text-[#222222]">
                <p>
                  團隊三人畢業於建築系，因「再生設計」計畫而組成 practice
                  WWMM。創作從空間、材料與構造思考出發，關注廢棄物、剩餘材料與既有物件的再生潛力，透過設計重新編排其形式、功能與使用關係。
                  <br />
                  以再生作為方法，而非單純材料替換，探討物件如何在循環過程中生成新的空間感知與生活介面，並試圖從設計實踐中回應資源、環境與日常使用之間的關係。
                </p>
                <p>
                  Founded by three architecture graduates, _practice WWMM_ was
                  formed through the project &quot;Regenerative Design.&quot;
                  Our team thinks through space, material, and structure. We
                  focus on the regenerative potential of waste, surplus
                  materials, and existing objects—reconfiguring their form,
                  function, and usage through design. Using regeneration as a
                  method rather than simple material replacement, we explore how
                  objects generate new spatial perceptions and living interfaces
                  during the circulation process. We strive to respond to the
                  relationship between resources, the environment, and daily use
                  through design practice.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Weaving with us Section */}
        <div
          className="relative z-30 mx-auto w-full px-4 sm:px-8 font-ddin -mt-72 mb-[120px] md:mb-[320px]"
          id="follow"
        >
          {/* Main Background Oval Container */}
          <div className="relative w-full max-w-[1160px] mx-auto bg-primary-15 rounded-full mt-56 pb-20 md:pt-40 md:pb-[180px] flex flex-col items-center justify-start md:justify-center text-center">
            {/* Top Right Eye */}
            <div className="absolute top-0 md:top-0 left-0 right-0 h-10 sm:h-auto md:left-auto md:right-[20%] w-fit mx-auto md:mx-0">
              <MochaIcon className="h-full" />
            </div>

            {/* Content text */}
            <div className="flex flex-col items-center md:items-start z-10 w-fit mt-12 md:mt-0">
              <h2 className="text-[#324f2b] text-[24px] sm:text-[48px] md:text-[56px] font-bold mb-2 md:mb-6 tracking-tight leading-none text-center md:text-left">
                Weaving with us!
              </h2>
              <div className="text-[14px] md:text-[24px] text-[#222222] font-semibold space-y-2 text-center md:text-left">
                <p>
                  想成為我們的共創夥伴，
                  <br className="md:hidden" />
                  或是腦中有什麼再生設計的好點子嗎？
                </p>
                <p className="font-semibold text-[12px] md:text-[24px]">
                  Would you like to become a design partner?
                </p>
                <p className="font-semibold text-[12px] md:text-[24px]">
                  Or do you have ideas for regenerative design?
                </p>
              </div>
            </div>

            {/* Bottom Form White Bubble */}
            <div className="absolute -bottom-[220px] md:-bottom-[280px] left-0 right-0 mx-auto bg-white rounded-[100px] px-6 py-12 sm:px-20 sm:py-24 flex flex-col items-center justify-center w-[90%] md:w-full max-w-[700px] z-30 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col items-center md:items-start w-full md:w-fit">
                <div className="text-[#222222] font-semibold text-[12px] md:text-[24px] space-y-1 text-center md:text-left mb-6 md:mb-8 leading-[1.6]">
                  <p>
                    邀請你一起加入我們
                    <span className="md:hidden">
                      <br />
                    </span>
                    <span className="hidden md:inline">，</span>請留下聯絡資訊
                  </p>
                  <p>We warmly invite you to join us</p>
                  <p>
                    <span className="hidden md:inline">— p</span>
                    <span className="md:hidden">P</span>lease leave your contact
                    information.
                  </p>
                </div>
                <a
                  href="https://forms.gle/WJSbNKscFQ4DLtnD9"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full max-w-[400px] md:max-w-none gap-3 cursor-pointer"
                >
                  <input
                    readOnly
                    type="text"
                    placeholder="Email / Line ID / Instagram"
                    className="flex-1 min-w-0 border border-[#e5e5e5] bg-transparent rounded-full px-5 py-3 text-[10px] md:text-[14px] outline-none text-[#555] placeholder:text-[#9ca693] cursor-pointer"
                    onFocus={(e) => e.target.blur()}
                  />
                  <button className="bg-[#9ca693] hover:bg-[#838e78] transition-colors text-white font-ddin font-bold rounded-full px-6 py-3 text-[13px] md:text-[15px] shrink-0 cursor-pointer">
                    Enter
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* SPONSOR Section */}
        <div className="flex w-full mx-auto justify-center pt-24">
          <SponsorBanner />
        </div>
      </div>
    </>
  );
}
