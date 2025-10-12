"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import WeavingIcon from "./icons/WeavingIcon";
import ReuseIcon from "./icons/ReuseIcon";
import ElfIcon from "./icons/ElfIcon";
import MessageIcon from "./icons/MessageIcon";

export default function IconGrid() {
  const icons = [
    { id: "reuse", Icon: ReuseIcon },
    { id: "weaving", Icon: WeavingIcon },
    { id: "message", Icon: MessageIcon },
    { id: "elf", Icon: ElfIcon },
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
    "#58A89B", // 藍
    "#3B6232", // 綠
    "#C05421", // 紅
    "#FABE50", // 黃
  ];

  return (
    <div className="bg-megaweave-secondary">
      <div
        className="overflow-hidden flex items-center justify-center"
        style={{ contain: "layout paint" }}
      >
        <motion.div
          layout
          layoutScroll={false}
          className="grid grid-cols-2 grid-rows-2 gap-4 p-6 md:p-12 w-full"
        >
          {positions.map((iconIndex, gridIndex) => {
            const { id, Icon } = icons[iconIndex];
            const color = colorMap[gridIndex];

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
                  willChange: "transform, color",
                  color,
                }}
                className="flex items-center justify-center aspect-square"
              >
                <Icon className="w-full h-full" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
