"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import WeavingIcon from "./icons/WeavingIcon";
import ReuseIcon from "./icons/ReuseIcon";
import ElfIcon from "./icons/ElfIcon";
import CommonShareIcon from "./icons/CommonShareIcon";
// import DragonBoatFestivalIcon1 from "./icons/DragonBoatFestivalIcon1";
// import DragonBoatFestivalIcon2 from "./icons/DragonBoatFestivalIcon2";
// import DragonBoatFestivalIcon3 from "./icons/DragonBoatFestivalIcon3";
// import DragonBoatFestivalIcon4 from "./icons/DragonBoatFestivalIcon4";
// import ChristmasStarIcon from "./icons/ChineseNewYearIcon2";
// import ChristmasSock from "./icons/ChineseNewYearIcon1";
// import ChristmasTreeIcon from "./icons/ChineseNewYearIcon3";
// import ChristmasSnowmanIcon from "./icons/ChineseNewYearIcon4";
export default function IconGrid() {
  const icons = [
    { id: "reuse", Icon: ReuseIcon },
    { id: "elf", Icon: ElfIcon },
    { id: "weaving", Icon: WeavingIcon },
    { id: "common", Icon: CommonShareIcon },
  ];

  const [positions, setPositions] = useState([0, 1, 2, 3]);
  const [rotation, setRotation] = useState(0); // 🌀 累積旋轉角度

  useEffect(() => {
    const interval = setInterval(() => {
      setPositions((prev) => [prev[3], prev[0], prev[1], prev[2]]);
      setRotation((prev) => prev + 90); // 每次換位置加90度
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const colorMap = [
    "#FABE50", // 黃
    "#C05421", // 紅
    "#3B6232", // 綠
    "#58A89B", // 藍
  ];

  return (
    <div
      className="bg-megaweave-secondary"
      style={{
        overflowAnchor: "none",
      }}
    >
      <div
        className="flex items-center justify-center overflow-hidden p-2"
        style={{ contain: "layout paint" }}
      >
        <motion.div
          layout
          layoutScroll={false}
          className="grid w-full grid-cols-2 grid-rows-2 gap-0"
        >
          {positions.map((iconIndex) => {
            const { id, Icon } = icons[iconIndex];
            const color = colorMap[iconIndex];

            return (
              <motion.div
                key={id}
                layout
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
                animate={{
                  color,
                  rotate: rotation, // 🌀 根據 rotation 狀態旋轉
                }}
                style={{
                  willChange: "transform",
                  color,
                }}
                className="flex aspect-square items-center justify-center"
              >
                <Icon className="h-full w-full" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
