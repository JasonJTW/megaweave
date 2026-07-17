// /app/install/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ShareLinkIcon from "../components/icons/ShareLinkIcon";
import InstallGroup from "../components/icons/InstallGroup";
import MoreIcon from "../components/icons/MoreIcon";
import Image from "next/image";
declare global {
  interface Navigator {
    standalone?: boolean;
  }
}
export default function InstallPage() {
  const router = useRouter();

  useEffect(() => {
    // 偵測是否已經是 standalone 模式 (已安裝)
    const isStandalone =
      window.navigator.standalone ||
      window.matchMedia("(display-mode: standalone)").matches;

    if (isStandalone) {
      // 如果已經安裝，直接導向首頁，不讓使用者待在安裝頁
      router.push("/");
    }
  }, [router]);

  return (
    <>
      <div className="fixed inset-0 -z-10 bg-[#F4F5F3]"></div>
      <div className="flex flex-col items-center justify-between bg-primary-5 px-6 pb-4 pt-40 font-ddin">
        {/* 上半部：品牌與 Icon */}
        <div className="animate-fade-in flex flex-col items-center">
          <div className="h-[130px] w-[130px] overflow-hidden rounded-[22%] border border-primary-30 bg-white">
            <Image
              src="/apple-touch-icon.png"
              alt="Logo"
              className="h-full w-full"
              width={128}
              height={128}
            />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-gray-800">
            Add to Home Screen?
          </h1>
        </div>

        <div className="flex w-full max-w-sm flex-col items-center">
          <div className="mx-10 flex flex-col items-end">
            <div className="relative mb-1 mt-10 flex rounded-2xl bg-primary-15 px-2 py-6 text-center">
              <p className="text-[16px] font-semibold leading-relaxed text-gray-700">
                Tap the{" "}
                <span className="inline-block px-1 align-baseline">
                  <ShareLinkIcon className="ml-1 text-primary" />
                </span>{" "}
                /{" "}
                <span className="inline-block px-1 align-baseline">
                  <MoreIcon className="mr-1 text-primary" />
                </span>{" "}
                icon and select &quot;...More&quot; and then &quot;Add to Home
                Screen&quot; to add a shortcut.
              </p>
            </div>
            <div className="mb-1 h-[18px] w-[18px] rounded-full bg-primary-15"></div>
            <div className="h-[10px] w-[10px] rounded-full bg-primary-15"></div>
          </div>
          <InstallGroup className="mt-6" />
        </div>
      </div>
    </>
  );
}
