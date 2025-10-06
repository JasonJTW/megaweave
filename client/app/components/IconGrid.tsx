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
      <motion.div
        layout
        className="grid grid-cols-2 grid-rows-2 p-6 md:p-12 max-w-6xl mx-auto gap-4 relative"
      >
        {positions.map((iconIndex) => {
          const { id, Icon, color } = icons[iconIndex];
          return (
            <motion.div
              key={id}
              layoutId={id}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
              className="flex items-center justify-center aspect-square"
            >
              <Icon className={`${color} w-full h-full`} />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
