"use client";

import Link from "next/link";
import { FC } from "react";
import WeavingIcon from "./icons/WeavingIcon";
// import { useNavbar } from "../contexts/NavBarContext";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const Footer: FC = () => {
  // const { isNavbarVisible } = useNavbar();
  const pathname = usePathname();
  if (pathname.startsWith("/messages") || pathname.startsWith("/tinder")) {
    return null;
  }
  return (
    <footer
      className={cn(
        "z-40 max-w-full overflow-hidden bg-[#f4f5f3] font-ddin text-[#14321f] transition-transform duration-300 ease-in-out",
        // isNavbarVisible ? "translate-y-0" : "translate-y-full",
      )}
    >
      {/* 頂端細線（幾乎不可見） */}

      {/* 主要內容區（置於 logo 之上） */}
      <div className="max-w-full border-t-[1px] border-primary/30 px-[30px] pb-[11px] pt-[50px]">
        {/* Top: logo + nav */}
        <div className="flex flex-row items-start sm:w-full sm:items-center sm:justify-between">
          <div className="flex flex-row items-center">
            <WeavingIcon className="mr-12 h-[50px] w-[50px] text-megaweave-forest sm:mr-7 sm:h-[80px] sm:w-[80px]" />
            {/* Desktop Megaweaving logo*/}
            {/* <div className="hidden sm:text-center sm:mb-[8px] sm:block ">
              <span
                aria-hidden
                className="pointer-events-none select-none block  text-[clamp(50px,15vw,400px)] sm:text-[clamp(20px,5vw,400px)] font-extrabold leading-none text-primary/30 tracking-normal"
              >
                megaweaving
              </span>
            </div> */}
          </div>

          {/* 導航：兩欄布局 */}
          <div className="flex-1 sm:mr-[45px] sm:flex-none">
            <div className="grid grid-cols-2 font-ddin text-[12px] font-medium sm:type-button-b2 sm:flex sm:flex-row sm:gap-[100px]">
              <div>
                <ul className="space-y-[2px] sm:space-y-4">
                  <li>
                    <Link
                      href="/about"
                      className="inline-block transition-all duration-200 hover:underline"
                    >
                      About Us
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/about#our-team"
                      className="inline-block transition-all duration-200 hover:underline"
                    >
                      megaweaving Team
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <ul className="space-y-[2px] sm:space-y-4">
                  <li>
                    <Link
                      href="https://www.facebook.com/groups/1596603907320118"
                      className="inline-block transition-all duration-200 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Facebook
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://www.instagram.com/studio_megaweaving?igsh=cTBxdHphMThldzg0"
                      className="inline-block transition-all duration-200 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Instagram
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* logo 區域 - 為了讓 logo 完整顯示，不被覆蓋 */}
        <div className="mt-9">
          {/* Mobile Megaweaving logo*/}
          <div className="mb-[8px] w-full text-center sm:hidden">
            {/* <span
              aria-hidden
              className="pointer-events-none select-none block  text-[clamp(50px,15vw,400px)] font-extrabold leading-none text-primary/30 tracking-normal"
            >
              megaweaving
            </span> */}
          </div>

          {/* 分隔線（在 logo 下方） */}
          <hr className="mb-[8px] border-t-[0.5px] border-primary/25" />

          {/* Tablet & Desktop: 三欄布局 */}
          <div className="w-full text-[8px] font-medium sm:type-body-t5">
            <div className="grid grid-cols-3 text-center sm:flex sm:items-center sm:justify-between">
              <div className="text-left">© megaweaving 2025</div>

              <Link
                href="#"
                className="transition-all duration-200 hover:underline sm:ml-auto sm:mr-6"
              >
                Privacy Policy
              </Link>
              <Link
                href="#"
                className="text-right transition-all duration-200 hover:underline"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
