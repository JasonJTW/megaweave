import Link from "next/link";
import { FC } from "react";
import WeavingIcon from "./icons/WeavingIcon";

const Footer: FC = () => {
  return (
    <footer className=" overflow-hidden  bg-[#f4f5f3] text-[#14321f] font-ddin max-w-full">
      {/* 頂端細線（幾乎不可見） */}

      {/* 主要內容區（置於 logo 之上） */}
      <div className="max-w-full px-[30px] pt-[50px] pb-[11px]  border-t-[1px] border-primary/30">
        {/* Top: logo + nav */}
        <div className="flex flex-row items-start md:items-center md:w-full md:justify-between ">
          <div className="flex flex-row items-center">
            <WeavingIcon className="w-[50px] h-[50px] mr-12 md:mr-7" />
            {/* Desktop Megaweaving logo*/}
            <div className="hidden md:text-center md:mb-[8px] md:block ">
              <span
                aria-hidden
                className="pointer-events-none select-none block  text-[clamp(50px,15vw,400px)] md:text-[clamp(20px,5vw,400px)] font-extrabold leading-none text-primary/30 tracking-normal"
              >
                megaweaving
              </span>
            </div>
          </div>

          {/* 導航：兩欄布局 */}
          <div className="flex-1 md:flex-none md:mr-[45px]">
            <div className="grid grid-cols-2 md:flex md:flex-row md:gap-[100px] text-[12px] md:text-[16pt] font-ddin font-medium">
              <div>
                <ul className="space-y-[2px] ">
                  <li>
                    <Link
                      href="/about"
                      className="inline-block  hover:underline transition-all duration-200"
                    >
                      About Us
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/about#our-team"
                      className="inline-block  hover:underline transition-all duration-200"
                    >
                      megaweaving Team
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <ul className="space-y-[2px] ">
                  <li>
                    <Link
                      href="https://www.facebook.com/groups/1596603907320118"
                      className="inline-block hover:underline transition-all duration-200"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Facebook
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://www.instagram.com/studio_megaweaving?igsh=cTBxdHphMThldzg0"
                      className="inline-block hover:underline transition-all duration-200"
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
          <div className="text-center mb-[8px] w-full md:hidden">
            <span
              aria-hidden
              className="pointer-events-none select-none block  text-[clamp(50px,15vw,400px)] font-extrabold leading-none text-primary/30 tracking-normal"
            >
              megaweaving
            </span>
          </div>

          {/* 分隔線（在 logo 下方） */}
          <hr className="border-t-[0.5px] border-primary/25 mb-[8px]" />

          {/* Tablet & Desktop: 三欄布局 */}
          <div className="w-full text-[8px] md:text-[14pt] font-medium">
            <div className="grid grid-cols-3 text-center md:flex md:items-center md:justify-between">
              <div className="text-left">© megaweaving 2025</div>

              <Link
                href="#"
                className="hover:underline transition-all duration-200 md:ml-auto md:mr-6"
              >
                Privacy Policy
              </Link>
              <Link
                href="#"
                className="text-right hover:underline transition-all duration-200"
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
