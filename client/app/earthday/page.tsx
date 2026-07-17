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
      <div className="fixed inset-0 -z-10 bg-[#f4f5f3]"></div>
      <div
        className={`${mantouSans.variable} min-h-screen font-ddin text-[#263927] selection:bg-[#769074] selection:text-white`}
      >
        {/* Navigation */}
        <nav className="fixed top-0 z-50 flex w-full items-center justify-between bg-[#ebefe7]/80 px-8 py-6 backdrop-blur-md transition-all duration-300">
          <div className="flex items-center space-x-2">
            {/* Logo Icon */}
            <Link
              href={"/"}
              className="flex h-8 w-8 items-center justify-center transition-opacity hover:opacity-70"
            >
              <WeavingIcon className="text-primary" />
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden space-x-8 text-sm font-medium md:flex">
            <Link href="#about" className="transition-opacity hover:opacity-70">
              關於大量交織 | About megaweaving
            </Link>
            <Link
              href="#regenerative"
              className="transition-opacity hover:opacity-70"
            >
              再生設計 | Regenerative Design
            </Link>
            <Link
              href="#follow"
              className="transition-opacity hover:opacity-70"
            >
              追蹤我們 | Follow Us
            </Link>
          </div>
        </nav>

        {/* Mobile Toggle Button (Fixed outside nav to stay above overlay) */}
        <button
          className="fixed right-8 top-6 z-[75] flex h-8 w-8 flex-col items-center justify-center space-y-1.5 focus:outline-none md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle Menu"
        >
          <span
            className={`block h-0.5 w-6 bg-primary transition-all duration-300 ${isMenuOpen ? "translate-y-2 rotate-45 bg-[#446237]" : "bg-primary"}`}
          ></span>
          <span
            className={`block h-0.5 w-6 bg-primary transition-all duration-300 ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
          ></span>
          <span
            className={`block h-0.5 w-6 bg-primary transition-all duration-300 ${isMenuOpen ? "-translate-y-2 -rotate-45 bg-[#446237]" : "bg-primary"}`}
          ></span>
        </button>

        {/* Mobile Menu Overlay */}
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#ebefe7]/95 backdrop-blur-xl transition-all duration-500 ease-in-out ${isMenuOpen ? "visible opacity-100" : "invisible opacity-0"} md:hidden`}
        >
          <div className="mx-auto flex w-full max-w-xs flex-col space-y-12 px-8 text-center">
            <Link
              href="#about"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary transition-opacity group-hover:opacity-70">
                關於大量交織
              </span>
              <span className="mt-1 text-[13px] font-medium uppercase tracking-widest text-[#446237] text-primary/60">
                About megaweaving
              </span>
            </Link>
            <Link
              href="#regenerative"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary transition-opacity group-hover:opacity-70">
                再生設計
              </span>
              <span className="mt-1 text-[13px] font-medium uppercase tracking-widest text-[#446237] text-primary/60">
                Regenerative Design
              </span>
            </Link>
            <Link
              href="#follow"
              className="group flex flex-col items-center transition-transform active:scale-95"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-xl font-bold text-primary transition-opacity group-hover:opacity-70">
                追蹤我們
              </span>
              <span className="mt-1 text-[13px] font-medium uppercase tracking-widest text-[#446237] text-primary/60">
                Follow Us
              </span>
            </Link>
          </div>
        </div>

        <main className="mx-auto max-w-7xl px-7 pb-0 pt-5 sm:px-12">
          {/* Hero Title Section */}
          <section className="mb-4 mt-12 flex flex-col items-center md:mb-14">
            {/* English Titles Section */}
            <div className="mb-4 flex w-full max-w-full justify-center md:mb-14">
              <EarthdayTitleEn className="h-auto" />
            </div>
            {/* Chinese Titles Section */}
            <div className="flex w-full max-w-full justify-center">
              <EarthdayTitleZh className="h-auto" />
            </div>
          </section>

          {/* EarthdayBanner */}
          <div className="relative z-30 flex">
            <EarthdayBanner className="h-auto" />
          </div>
        </main>
        {/* About Section */}
        <div
          id="about"
          className="relative z-10 scroll-mt-24 font-ddin sm:-mt-[90px]"
        >
          <section className="relative -z-40 ml-0 mr-14 rounded-r-[150px] bg-secondary px-7 py-12 sm:rounded-r-full sm:px-12 md:p-20">
            <div className="max-w-[94%]">
              <h3 className="mb-2 text-[26px] font-bold text-primary-75 sm:mb-9 sm:text-[48px]">
                About megaweaving
              </h3>
              <p className="break-all text-justify text-[14px] !font-medium tracking-normal text-[#222222] sm:text-2xl">
                「大量交織」是在 Facebook 發起、現已有超過 12000
                名成員參與的社團，它就像一座橋，支持各類資源自由流通，橋的一端是「溢出」，一端是「需求」，有多餘資源的人與有需求的人，都能在社群中互相連結、互相幫助。
              </p>
              <p className="mb-8 mt-8 break-words text-justify text-[14px] !font-medium text-[#222222] sm:text-2xl">
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
        <div className="relative z-30 flex h-0 justify-end">
          <Cloud className="mr-4 w-[125px] -translate-y-2/3 sm:mr-0 sm:w-[275px] sm:-translate-y-2/3" />
        </div>
        {/* Regenerative Design Section */}
        <section className="relative z-20 -mt-[15px] scroll-mt-24 font-ddin sm:-mt-[40px]">
          {/* Background Layer: Starts further to the right */}
          <div className="absolute inset-y-0 left-1/2 right-0 -z-10 rounded-l-[140px] bg-[#D6E3D4] sm:rounded-l-full" />

          {/* Content Layer: Starts normally, so it bleeds out to the left */}
          <div className="mb-16 px-7 pb-10 sm:px-12 sm:pb-10 md:px-24 md:pt-32">
            <div className="max-w-[100%]">
              <div className="mb-9 flex justify-between pt-14 font-bold text-primary sm:pt-0">
                <h3 className="text-[24px] sm:text-[68px]">再生設計</h3>
                <h3 className="text-[26px] sm:text-[68px]">
                  Regenerative Design
                </h3>
              </div>
              <p className="break-all text-justify text-[14px] !font-medium tracking-normal text-[#222222] sm:text-2xl">
                為了讓這份共享精神走得更遠，「大量交織」開啟了「再生設計（Regenerative
                Design）」子計畫。我們想邀請對創作有熱忱的夥伴加入，透過創意賦予材質新生命，讓設計本身成為修復與再生生態系的力量，將資源轉化為更有意義的作品！
                同時，以今年的地球日作為契機，向大家介紹目前加入的幾位夥伴，以及分享他們近期的一些嚐試，也藉此機會，歡迎有興趣的朋友一起加入這個計畫！
              </p>
              <p className="mt-8 break-words text-justify text-[14px] !font-medium tracking-normal text-[#222222] sm:text-2xl">
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

        <div className="relative z-30 -mt-12 flex h-10 translate-y-1/3 justify-between sm:mx-[200px] md:h-auto">
          <DividerStart className="h-full text-secondary" />
          <DividerEnd className="h-full" />
        </div>
        <div
          className="relative z-20 mx-6 mt-0 flex max-w-[1160px] flex-col overflow-hidden bg-white px-8 pt-10 sm:mx-auto md:mt-0 md:pl-[60px] md:pr-[58px] md:pt-[80px]"
          id="regenerative"
        >
          {/* Content grid */}
          <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-16">
            {/* Left Column Area (Nancy Ma + Images) */}
            <div className="flex min-w-0 flex-col md:col-span-7 md:pr-4">
              {/* Left Header Part (Mobile Unified) */}
              <div className="mb-10 flex flex-col font-ddin md:hidden">
                <div className="flex items-center">
                  <h2 className="mr-3 whitespace-nowrap text-[22px] font-bold text-primary sm:mr-4 sm:text-2xl">
                    Nancy Ma
                  </h2>
                  <div className="relative z-10 mr-4 h-[1px] flex-grow bg-primary"></div>
                  <div className="text-right text-[26px] font-bold leading-[1.05] text-[#6e8568] sm:text-3xl">
                    100 Teapots
                  </div>
                </div>
                <h1 className="mt-1 text-right text-[26px] font-bold leading-[1.05] text-[#6e8568] sm:text-3xl">
                  in
                  <br />
                  100 Days
                </h1>
              </div>

              {/* Left Header Part (Desktop Only) */}
              <div className="mb-12 hidden h-[55px] items-center md:flex lg:h-[76px]">
                <h2 className="mr-6 whitespace-nowrap text-xl font-bold text-primary sm:text-2xl lg:text-[32px]">
                  Nancy Ma
                </h2>
                <div className="relative z-10 h-[1px] flex-grow bg-primary md:mr-[-64px]"></div>
              </div>

              {/* Images Content */}
              <div className="flex flex-col gap-10">
                <Image
                  src="/assets/nancyp1.png"
                  alt=""
                  width={659}
                  height={279}
                  className="h-auto w-full"
                />

                {/* Mobile Text Content (visible only on mobile, placed between images) */}
                <div className="mb-2 mt-2 flex flex-col font-ddin md:hidden">
                  <div className="mb-4 space-y-6 text-justify text-[13px] font-semibold !leading-[1.9] tracking-wide text-[#222222]">
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
                  <p className="mb-8 text-[10px] font-medium leading-relaxed text-gray-500">
                    *名稱受 Marino Gamper 在 2007出版「100 Chairs in 100 Days
                    and its 100 Ways」啟發。
                  </p>

                  <div className="mb-4 space-y-5 text-justify text-[13px] font-semibold !leading-[1.8] text-[#222222]">
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
                  <p className="mb-0 text-[10px] font-medium leading-relaxed text-gray-500">
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
                    className="h-auto w-full"
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
                    className="h-auto w-full"
                  />
                  <p className="text-[12px] font-bold text-[#263927]">
                    ▲ Sisyphos
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column Area (Title + Text Content) */}
            <div className="hidden min-w-0 flex-col font-ddin md:col-span-5 md:flex">
              {/* Right Header Part (100 Teapots) */}
              <div className="mb-8 flex h-[40px] items-center sm:mb-12 sm:h-[50px] md:h-[55px] lg:h-[76px]">
                <div className="w-full text-right text-3xl font-bold leading-[1.05] text-[#6e8568] sm:text-4xl md:text-[40px] lg:text-[54px] xl:text-[72px]">
                  100 Teapots
                </div>
              </div>

              {/* Title Part (in 100 Days) */}
              <h1 className="mb-12 w-full text-right text-3xl font-bold leading-[1.05] text-[#6e8568] sm:text-4xl md:text-[40px] lg:text-[54px] xl:text-[72px]">
                in
                <br />
                100 Days
              </h1>

              {/* Chinese Text */}
              <div className="mb-4 space-y-6 text-justify text-[13px] font-semibold !leading-[1.9] tracking-wide text-[#222222]">
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
              <p className="mb-4 text-[10px] font-medium leading-relaxed text-gray-500">
                *名稱受 Marino Gamper 在 2007出版「100 Chairs in 100 Days and
                its 100 Ways」啟發。
              </p>

              {/* Flexible spacer to align English footnote bottom with third image bottom */}
              <div className="hidden flex-grow md:block" />

              {/* English Text */}
              <div className="mb-4 space-y-5 text-justify text-[13px] font-semibold !leading-[1.8] text-[#222222]">
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
              <p className="mb-0 text-[10px] font-medium leading-relaxed text-gray-500">
                *The series title is inspired by Marino Gamper&apos;s 100 Chairs
                in 100 Days and Its 100 Ways (2007).
              </p>
            </div>
          </div>
          {/* Teapot Cosy Making Process Gallery Section */}
          <div className="mt-14 md:mt-24">
            <div className="flex flex-col-reverse items-stretch gap-2 md:flex-row md:gap-16">
              {/* Left Column: Icon at top, Caption at bottom */}
              <div className="flex flex-1 flex-col justify-between">
                <div className="-ml-4 hidden w-[120px] sm:block sm:w-[160px] md:-ml-[60px] md:w-[200px]">
                  <YellowMonkeyIcon className="h-auto w-full" />
                </div>

                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-2 flex items-center text-[12px] font-bold tracking-tight text-[#263927] md:mt-0 md:text-[14px]">
                  <span className="mr-1 text-[10px] md:text-[12px]">
                    <span className="md:hidden">▲</span>
                    <span className="hidden md:inline">▶</span>
                  </span>
                  <span className="whitespace-nowrap">
                    茶壺衣製作過程 | Teapot Cosy Making Process
                  </span>
                </div>
              </div>

              {/* Right Column: Image Placeholder */}
              <div className="w-full flex-1">
                <Image
                  src="/assets/nancyp4.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="h-auto w-full"
                />
              </div>
            </div>

            {/* Berlin - Mobile Layout */}
            <div className="mt-8 flex gap-4 md:hidden">
              {/* Left Image + Caption */}
              <div className="flex flex-1 flex-col">
                <Image
                  src="/assets/nancyp5.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="mb-2 h-auto w-full"
                />
                <div className="flex items-start text-[11px] font-bold tracking-tight text-[#263927]">
                  <span className="mr-1 text-[9px]">▲</span>
                  <span className="whitespace-nowrap">Sisyphos, Berlin</span>
                </div>
              </div>

              {/* Right Image + Caption */}
              <div className="flex flex-1 flex-col">
                <Image
                  src="/assets/nancyp6.jpg"
                  alt=""
                  width={659}
                  height={279}
                  className="mb-2 h-auto w-full"
                />
                <div className="flex items-start text-[11px] font-bold tracking-tight text-[#263927]">
                  <span className="mr-1 text-[9px]">▲</span>
                  <p className="leading-[1.4]">
                    Friedrichshain 附近的路橋下，時常有隨機的人聚集放音樂跳舞
                    <br />
                    <span className="mt-1 block text-[10px] font-normal leading-tight text-[#555]">
                      Beneath the overpasses near Friedrichshain, people often
                      gather spontaneously to play techno music and dance.
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Berlin - Desktop Layout */}
            <div className="mt-8 hidden flex-row items-stretch gap-16 md:flex">
              {/* Left Column: Icon at top, Caption at bottom */}
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex gap-4">
                  <Image
                    src="/assets/nancyp5.jpg"
                    alt=""
                    width={659}
                    height={279}
                    className="h-auto w-full"
                  />
                  <Image
                    src="/assets/nancyp6.jpg"
                    alt=""
                    width={659}
                    height={279}
                    className="h-auto w-full"
                  />
                </div>

                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-10 flex items-center text-[12px] font-bold tracking-tight text-[#263927] md:mt-0 md:text-[14px]">
                  <span className="text-[10px] md:text-[12px]">▲</span>
                  <span className="whitespace-nowrap">Sisyphos, Berlins</span>
                </div>
              </div>

              {/* Right Column: Image Placeholder */}
              <div className="w-full flex-1">
                {/* Gallery Caption (Bottom aligned with image) */}
                <div className="mt-10 flex items-start text-[12px] font-bold tracking-tight text-[#263927] md:mt-0 md:text-[14px]">
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
            <div className="flex flex-col font-ddin md:hidden">
              {/* Top: Name Header + Graphic */}
              <div className="mb-6 flex flex-col">
                <div className="relative z-10 -mb-1 -ml-5 w-[120px]">
                  <NancyIcon className="h-auto w-full" />
                </div>
                <h2 className="relative z-20 whitespace-nowrap text-[28px] font-bold text-megaweave-forest-dark">
                  Nancy Ma
                </h2>
              </div>

              {/* Middle: Chinese Bio */}
              <div className="mb-6 text-justify text-[15px] font-bold leading-[1.6] tracking-wide text-[#222222]">
                <p>
                  台灣建築設計師，現居倫敦。擅長從日常物件中發掘新的觀看方式，並透過她與物件獨特的互動，創造材料與形式的新可能。創作聚焦在環境保護與再生設計，嘗試以空間裝置與影像創作，為長期被忽視的人與非人發聲。
                </p>
              </div>

              {/* Bottom: English Bio */}
              <div className="text-justify text-[15px] font-medium leading-[1.6] text-[#222222]">
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
            <div className="hidden items-stretch gap-4 sm:gap-20 md:flex">
              {/* Left: Name Header + Circular Graphic */}
              <div className="flex flex-col justify-between">
                {/* Header row */}
                <div className="mb-10 flex w-full">
                  <h2 className="whitespace-nowrap text-xl font-bold text-megaweave-forest-dark sm:text-5xl lg:text-5xl">
                    Nancy Ma
                  </h2>
                </div>

                {/* Circular graphic placeholder */}
                <div className="absolute bottom-0 flex w-full">
                  <NancyIcon className="" />
                </div>
              </div>

              {/* Right: Bio Text */}
              <div className="flex flex-col font-ddin sm:-mt-4 md:col-span-7">
                {/* Chinese Bio */}
                <div className="mb-6 space-y-4 text-justify text-[16px] font-medium leading-[1.5] tracking-normal text-[#222222]">
                  <p>
                    台灣建築設計師，現居倫敦。擅長從日常物件中發掘新的觀看方式，並透過她與物件獨特的互動，創造材料與形式的新可能。創作聚焦在環境保護與再生設計，嘗試以空間裝置與影像創作，為長期被忽視的人與非人發聲。
                  </p>
                </div>
                {/* English Bio */}
                <div className="text-justify text-[16px] font-medium leading-[1.5] text-[#222222]">
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
        <div className="relative z-30 flex h-10 -translate-y-1/3 justify-between sm:mx-32 sm:h-auto">
          <DividerStart className="h-full text-secondary" />
          <DividerEnd className="h-full" />
        </div>

        {/* Starting with megaweaving Section */}
        <div
          className="relative z-20 mx-6 mt-0 flex max-w-[1160px] flex-col overflow-hidden bg-white px-8 pt-10 sm:mx-auto md:-mt-16 md:px-[120px] md:pt-[100px]"
          id="regenerative"
        >
          {/* Main Hero Header */}
          <div className="mb-10 flex w-full md:mb-16">
            <h1 className="text-2xl font-bold leading-none text-[#62775f] sm:text-5xl lg:text-[64px]">
              Starting with megaweaving
            </h1>
          </div>

          {/* Mobile Only: Practice WWMM Header & Image injected before text */}
          <div className="mb-8 flex w-full flex-col font-ddin md:hidden">
            <div className="-mt-2 mb-6 flex w-full items-center">
              <div className="mr-4 h-[1px] flex-grow bg-[#62775f]/50"></div>
              <h2 className="whitespace-nowrap text-right text-[20px] font-bold leading-none tracking-wide text-[#446237]">
                practice WWMM
              </h2>
            </div>
            <Image
              src="/assets/wwmmp1.jpg"
              alt=""
              width={659}
              height={900}
              className="h-auto w-full object-cover"
            />
          </div>

          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-12 md:gap-12">
            {/* Left: Text Content */}
            <div className="flex font-ddin md:col-span-6">
              <div className="ml-4 mr-8 hidden w-[2px] shrink-0 bg-primary-30 md:block" />
              <div className="flex flex-col py-4 md:pr-4">
                <div className="mb-8 space-y-6 text-justify text-[16px] font-medium leading-[1.5] tracking-wide text-[#222222]">
                  <p>
                    物品沒有統一的規格與特定的顏色。製作的過程像是不太準確的翻譯工作，將物件從過去帶往未來。
                    <br />
                    來源無法被控制的材料，透過三人的交織轉譯成為一種新的型態：泡泡紙成為透光的表皮，舊耳機線成為經緯，塑膠網與繩索相互交織。
                  </p>
                  <p>
                    材質間的碰撞產生更多想像。物件被丟棄之前是什麼?之後可能成為什麼?
                  </p>
                </div>

                <div className="space-y-5 break-all text-[16px] font-medium leading-[1.5] tracking-wide text-[#222222]">
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
            <div className="hidden justify-end md:col-span-6 md:flex">
              <Image
                src="/assets/wwmmp1.jpg"
                alt=""
                width={659}
                height={900}
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          {/* Practice section with 5 images */}
          <div className="mt-12 grid grid-cols-2 items-start gap-4 md:grid-cols-4">
            {/* Row 1: Title + 3 images (Title hidden on mobile as it's moved up) */}
            <div className="hidden flex-col py-4 font-ddin md:flex">
              <h2 className="mb-6 text-[20px] font-bold leading-tight text-[#446237] sm:text-2xl">
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
              className="col-span-2 aspect-[3/4] h-auto w-full object-cover md:col-span-1"
            />
            <Image
              src="/assets/wwmmp3.jpg"
              alt=""
              width={659}
              height={879}
              className="aspect-[3/4] h-auto w-full object-cover"
            />
            <Image
              src="/assets/wwmmp4.jpg"
              alt=""
              width={659}
              height={879}
              className="aspect-[3/4] h-auto w-full object-cover"
            />

            {/* Row 2: 2 images */}
            <Image
              src="/assets/wwmmp5.jpg"
              alt=""
              width={659}
              height={879}
              className="aspect-[3/4] h-auto w-full object-cover"
            />
            <Image
              src="/assets/wwmmp6.jpg"
              alt=""
              width={659}
              height={879}
              className="aspect-[3/4] h-auto w-full object-cover"
            />

            {/* Row 3: 1 large image spanning 2 cols, 1 normal image */}
            <Image
              src="/assets/wwmmp7.jpg"
              alt=""
              width={659}
              height={879}
              className="col-span-2 aspect-[4/3] h-auto w-full object-cover md:col-start-1 md:aspect-[1.6]"
            />
            <Image
              src="/assets/wwmmp8.jpg"
              alt=""
              width={659}
              height={879}
              className="col-span-2 aspect-[3/4] h-auto w-full object-cover md:col-span-1"
            />
          </div>
          {/* Nancy Ma (second artist) Bio Section */}

          <div className="mt-12 grid grid-cols-1 items-start gap-8 md:grid-cols-12">
            {/* Left: Name Header + Portrait placeholder */}
            <div className="flex flex-col items-start font-ddin md:col-span-4">
              <div className="mt-5 flex w-full items-center sm:mt-1">
                <h2 className="mr-6 hidden whitespace-nowrap text-[32px] font-bold leading-[1.1] text-[#446237] sm:block sm:text-4xl lg:text-5xl">
                  practice <br /> WWMM
                </h2>
                <h2 className="mr-6 whitespace-nowrap text-[32px] font-bold leading-[1.1] text-[#446237] sm:hidden sm:text-4xl lg:text-5xl">
                  practice WWMM
                </h2>
              </div>
            </div>

            {/* Right: Text */}
            <div className="flex flex-col font-ddin md:col-span-8">
              <div className="space-y-5 break-all pb-[100px] text-[16px] font-medium leading-[1.6] tracking-normal text-[#222222] sm:pb-[340px]">
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
          className="relative z-30 mx-auto -mt-72 mb-[120px] w-full px-4 font-ddin sm:px-8 md:mb-[320px]"
          id="follow"
        >
          {/* Main Background Oval Container */}
          <div className="relative mx-auto mt-56 flex w-full max-w-[1160px] flex-col items-center justify-start rounded-full bg-primary-15 pb-20 text-center md:justify-center md:pb-[180px] md:pt-40">
            {/* Top Right Eye */}
            <div className="absolute left-0 right-0 top-0 mx-auto h-10 w-fit sm:h-auto md:left-auto md:right-[20%] md:top-0 md:mx-0">
              <MochaIcon className="h-full" />
            </div>

            {/* Content text */}
            <div className="z-10 mt-12 flex w-fit flex-col items-center md:mt-0 md:items-start">
              <h2 className="mb-2 text-center text-[24px] font-bold leading-none tracking-tight text-[#324f2b] sm:text-[48px] md:mb-6 md:text-left md:text-[56px]">
                Weaving with us!
              </h2>
              <div className="space-y-2 text-center text-[14px] font-semibold text-[#222222] md:text-left md:text-[24px]">
                <p>
                  想成為我們的共創夥伴，
                  <br className="md:hidden" />
                  或是腦中有什麼再生設計的好點子嗎？
                </p>
                <p className="text-[12px] font-semibold md:text-[24px]">
                  Would you like to become a design partner?
                </p>
                <p className="text-[12px] font-semibold md:text-[24px]">
                  Or do you have ideas for regenerative design?
                </p>
              </div>
            </div>

            {/* Bottom Form White Bubble */}
            <div className="absolute -bottom-[220px] left-0 right-0 z-30 mx-auto flex w-[90%] max-w-[700px] flex-col items-center justify-center rounded-[100px] bg-white px-6 py-12 shadow-[0_10px_40px_rgba(0,0,0,0.04)] sm:px-20 sm:py-24 md:-bottom-[280px] md:w-full">
              <div className="flex w-full flex-col items-center md:w-fit md:items-start">
                <div className="mb-6 space-y-1 text-center text-[12px] font-semibold leading-[1.6] text-[#222222] md:mb-8 md:text-left md:text-[24px]">
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
                  className="flex w-full max-w-[400px] cursor-pointer gap-3 md:max-w-none"
                >
                  <input
                    readOnly
                    type="text"
                    placeholder="Email / Line ID / Instagram"
                    className="min-w-0 flex-1 cursor-pointer rounded-full border border-[#e5e5e5] bg-transparent px-5 py-3 text-[10px] text-[#555] outline-none placeholder:text-[#9ca693] md:text-[14px]"
                    onFocus={(e) => e.target.blur()}
                  />
                  <button className="shrink-0 cursor-pointer rounded-full bg-[#9ca693] px-6 py-3 font-ddin text-[13px] font-bold text-white transition-colors hover:bg-[#838e78] md:text-[15px]">
                    Enter
                  </button>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* SPONSOR Section */}
        <div className="mx-auto flex w-full justify-center pt-24">
          <SponsorBanner />
        </div>
      </div>
    </>
  );
}
