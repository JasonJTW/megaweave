// client/earthday/app.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EarthIllustration = () => (
  <div className="relative w-full max-w-[400px] aspect-square mx-auto my-12 flex items-center justify-center">
    {/* Background Decorative Blob */}
    <div className="absolute inset-0 bg-[#dde3d9] rounded-full blur-3xl opacity-50 -z-10 animate-pulse" />

    {/* Main Earth Sphere */}
    <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-sm">
      <defs>
        <clipPath id="earth-clip">
          <circle cx="200" cy="200" r="160" />
        </clipPath>
      </defs>

      {/* Ocean */}
      <circle cx="200" cy="200" r="160" fill="#b4dad4" />

      {/* Landmasses (Abstract random shapes as per screenshot) */}
      <g clipPath="url(#earth-clip)" fill="#ffffff">
        <path d="M120,100 Q150,80 180,110 T240,90 Q280,110 260,150 T200,180 Q160,200 130,170 T120,100 Z" />
        <path d="M280,220 Q310,200 330,230 T310,280 Q280,310 240,290 T220,240 Q240,210 280,220 Z" />
        <path d="M100,250 Q130,230 150,260 T130,310 Q100,340 60,320 T70,270 Q80,240 100,250 Z" />
        <circle cx="200" cy="320" r="25" />
        <circle cx="240" cy="60" r="15" />
        <circle cx="80" cy="180" r="20" />
      </g>
    </svg>

    {/* Brown Blob with '8' */}
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute left-[-20px] bottom-[30%] w-24 h-24 bg-[#a75a2d] rounded-[40%_60%_70%_30%] flex items-center justify-center shadow-lg"
    >
      <span className="text-white text-4xl font-bold font-serif">8</span>
    </motion.div>

    {/* Yellow Blob with Eye */}
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute right-[-10px] bottom-[10%] w-28 h-20 bg-[#f4b11c] rounded-[60%_40%_30%_70%] flex items-center justify-center shadow-lg overflow-hidden"
    >
      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
        <div className="w-5 h-5 bg-black rounded-full" />
      </div>
    </motion.div>

    {/* Dark Seed Shape (Top Right) */}
    <div className="absolute right-[10%] top-[10%] w-16 h-12 bg-[#3a2e28] rounded-[50%_50%_50%_50%] rotate-12" />
  </div>
);

const SectionHeader = ({
  zh,
  en,
  className = "",
}: {
  zh: string;
  en: string;
  className?: string;
}) => (
  <div className={`flex items-baseline space-x-4 ${className}`}>
    <h2 className="text-4xl font-bold text-[#263927]">{zh}</h2>
    <h3 className="text-3xl font-medium text-[#263927] opacity-80">{en}</h3>
  </div>
);

const EarthDayApp = () => {
  return (
    <div className="min-h-screen bg-[#ebefe7] text-[#263927] font-sans selection:bg-[#769074] selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center bg-[#ebefe7]/80 backdrop-blur-md">
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

      <main className="pt-32 pb-24 px-6 md:px-12 max-w-6xl mx-auto">
        {/* Hero Title Section */}
        <section className="text-center mb-16 px-4">
          <div className="flex flex-col items-center justify-center space-y-2">
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-[#263927]">
              megaweaving
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-4xl md:text-6xl font-light text-[#769074]">
                ✕
              </span>
              <h2 className="text-4xl md:text-6xl font-medium text-[#769074]">
                Regenerative Design
              </h2>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center space-x-6 text-5xl md:text-7xl font-black">
            <span className="text-[#263927]">大量交織</span>
            <span className="font-light text-[#769074]">✕</span>
            <span className="text-[#263927]">再生設計</span>
          </div>
        </section>

        {/* Illustration */}
        <EarthIllustration />

        {/* About Section Wrapper with distinctive shape */}
        <div className="relative mt-24">
          <div className="absolute inset-0 bg-[#e0e6db] rounded-[100px] -z-10 translate-y-12 scale-105 opacity-40" />

          <section className="bg-white/30 backdrop-blur-sm rounded-[60px] p-12 md:p-20 shadow-sm border border-white/20">
            <div className="max-w-3xl">
              <h3 className="text-2xl font-bold mb-6 text-[#769074]">
                About megaweaving
              </h3>
              <p className="text-lg leading-relaxed mb-8 opacity-90">
                From a 10,000+ member facebook group to a global database,
                megaweaving connects idle resources with those in need. We
                foster a transparent, sustainable, and inclusive network for
                mutual aid and resource sharing.
              </p>
              <p className="text-xl font-bold leading-relaxed">
                從臉書萬人社群進化為全球資源資料庫，megaweaving
                連結閒置資源與需求。我們致
                力於建構透明、永續且包容的互助網路，讓資源共享更簡單。
              </p>
            </div>
          </section>
        </div>

        {/* Regenerative Design Section */}
        <section className="mt-20 px-8 md:px-16">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-12">
            <div className="flex-1">
              <SectionHeader
                zh="再生設計"
                en="Regenerative Design"
                className="mb-10"
              />

              <div className="space-y-6 max-w-2xl">
                <p className="text-lg leading-relaxed opacity-90">
                  From a 10,000+ member group to a global database, megaweaving
                  connects idle resources with those in need. We foster a
                  transparent, sustainable, and inclusive network for mutual aid
                  and resource sharing.
                </p>
                <p className="text-xl font-bold leading-relaxed">
                  從萬人社群進化為全球資源資料庫，megaweaving
                  連結閒置資源與需求。我們致力於
                  建構透明、永續且包容的互助網路，讓資源共享更簡單。
                </p>
              </div>
            </div>

            {/* Visual Decoration (White cloud-like shape) */}
            <div className="hidden lg:block relative w-48 h-48">
              <div className="absolute inset-0 border-[16px] border-white/60 rounded-full border-dashed animate-[spin_20s_linear_infinite]" />
              <div className="absolute inset-4 bg-white/40 rounded-full" />
            </div>
          </div>
        </section>
      </main>

      {/* Decorative Blobs in corners */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#b4dad4] rounded-full blur-[120px] opacity-20 -z-50" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-[#f4b11c] rounded-full blur-[100px] opacity-10 -z-50" />
    </div>
  );
};

export default EarthDayApp;
