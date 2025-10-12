"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import WeavingIcon from "./icons/WeavingIcon";
import ReuseIcon from "./icons/ReuseIcon";
import ElfIcon from "./icons/ElfIcon";
import MessageIcon from "./icons/MessageIcon";

export default function IconGrid() {
  const icons = [
    { id: "reuse", Icon: ReuseIcon, color: "text-megaweave-blue" },
    { id: "weaving", Icon: WeavingIcon, color: "text-primary" },
    { id: "message", Icon: MessageIcon, color: "text-megaweave-red-dark" },
    { id: "elf", Icon: ElfIcon, color: "text-megaweave-gold" },
  ];

  const [positions, setPositions] = useState([0, 1, 2, 3]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPositions((prev) => [prev[3], prev[0], prev[1], prev[2]]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-megaweave-secondary shadow-sm border-b">
      {/* 1) 固定高度 + overflow-hidden */}
      {/* 2) containment：把 layout/pain 的變化限制在這個容器內，避免影響整頁 scroll */}
      <div
        className="overflow-hidden flex items-center justify-center"
        style={{ contain: "layout paint" }}
      >
        <motion.div
          layout
          layoutScroll={false} // 保留但不補償 scroll
          className="grid grid-cols-2 grid-rows-2 gap-4 p-6 md:p-12 w-full"
        >
          {positions.map((iconIndex) => {
            const { id, Icon, color } = icons[iconIndex];
            return (
              <motion.div
                key={id}
                // **移除 layoutId**（不要用 shared layout snapshot）
                layout // 仍可讓子 element 做位置補間
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
                // hint browser to composite on GPU → 減少 layout repaint
                style={{ willChange: "transform" }}
                className="flex items-center justify-center aspect-square"
              >
                <Icon className={`${color} w-full h-full`} />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
