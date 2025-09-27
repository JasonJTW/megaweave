import Image from "next/image";
import Link from "next/link";
import { FC } from "react";

const Footer: FC = () => {
  return (
    <footer className="relative overflow-hidden  bg-[#f5f6f4] text-[#14321f] font-ddin max-w-full">
      {/* 頂端細線（幾乎不可見） */}

      {/* 主要內容區（置於 watermark 之上） */}
      <div className="max-w-full relative px-[30px] pt-[30px] pb-[11px]  border-t-[1px] border-primary/30">
        {/* Top: logo + nav */}
        <div className="flex flex-row  items-start md:items-center ">
          <div className="">
            <Image
              src="/favicon.ico"
              alt="megaweaving logo"
              width={43}
              height={43}
              className="object-cover mr-12"
              priority
            />
          </div>

          {/* 導航：兩欄布局 */}
          <div className="flex-1">
            <div className="grid grid-cols-2 ">
              <div>
                <ul className="space-y-[2px] text-[8px]">
                  <li>
                    <Link
                      href="/about"
                      className="inline-block font-medium hover:underline transition-all duration-200"
                    >
                      About Us
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="#"
                      className="inline-block font-medium hover:underline transition-all duration-200"
                    >
                      megaweaving Team
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="#"
                      className="inline-block font-medium hover:underline transition-all duration-200"
                    >
                      Contact
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <ul className="space-y-[2px]  text-[8px]">
                  <li>
                    <Link
                      href="https://www.facebook.com/groups/1596603907320118"
                      className="inline-block font-medium hover:underline transition-all duration-200"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Facebook
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://www.instagram.com/studio_megaweaving?igsh=cTBxdHphMThldzg0"
                      className="inline-block font-medium hover:underline transition-all duration-200"
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

        {/* watermark 區域 - 為了讓 watermark 完整顯示，不被覆蓋 */}
        <div className="mt-9">
          {/* 大型 watermark - 完整顯示，不被切割 */}
          <div className="text-center mb-[8px] w-full">
            <span
              aria-hidden
              className="pointer-events-none select-none block  text-[clamp(50px,15vw,400px)] font-extrabold leading-none text-primary/30 tracking-normal"
            >
              megaweaving
            </span>
          </div>

          {/* 分隔線（在 watermark 下方） */}
          <hr className="border-t-[0.5px] border-primary/25 mb-[8px]" />

          {/* 底部：左右兩端對齊 + 中間隱私政策 */}
          <div>
            {/* Tablet & Desktop: 三欄布局 */}
            <div className="flex items-center justify-between text-[8px] ">
              <div className="font-medium">© megaweaving 2025</div>
              <div className="font-medium">
                <Link
                  href="#"
                  className="hover:underline transition-all duration-200"
                >
                  Privacy Policy
                </Link>
              </div>
              <div className="font-medium">
                <Link
                  href="#"
                  className="hover:underline transition-all duration-200"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
