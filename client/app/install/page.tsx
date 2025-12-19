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
    <div className=" bg-primary-5 flex flex-col items-center justify-between pt-40 px-6 pb-4 font-ddin">
      {/* 上半部：品牌與 Icon */}
      <div className="flex flex-col items-center animate-fade-in">
        <div className="h-[130px] w-[130px] overflow-hidden rounded-[22%] border bg-white border-primary-30">
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

      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mx-10 flex flex-col items-end">
          <div className="flex mt-10 mb-1 relative bg-primary-15 rounded-2xl px-2 py-6 text-center ">
            <p className="text-gray-700 font-semibold text-[16px] leading-relaxed">
              Tap the{" "}
              <span className="inline-block align-baseline px-1">
                <ShareLinkIcon className="text-primary ml-1" />
              </span>{" "}
              /{" "}
              <span className="inline-block align-baseline px-1">
                <MoreIcon className="text-primary mr-1" />
              </span>{" "}
              icon and select &quot;...Share&quot; and then &quot;Add to Home
              Screen&quot; to add a shortcut.
            </p>
          </div>
          <div className="bg-primary-15 w-[18px] h-[18px] rounded-full mb-1"></div>
          <div className="bg-primary-15 w-[10px] h-[10px] rounded-full"></div>
        </div>
        <InstallGroup className="mt-6" />
      </div>
    </div>
  );
}
