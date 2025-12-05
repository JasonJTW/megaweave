import React, { useState } from "react";
import { motion } from "framer-motion";
import ExpandIcon from "./icons/ExpandIcon";
import Feed from "./PostCard/Feed";
import type { Post, Condition } from "../types/schema";
import { useRouter } from "next/navigation";
import ExpandedIcon from "./icons/ExpandedIcon";

interface DrawerProps {
  title: string;
  posts: Post[];
  conditions: Condition[];
}

const Drawer: React.FC<DrawerProps> = ({ title, posts, conditions }) => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between mx-4 my-[20px] px-[16px] py-[8px] border-b border-primary-30 text-megaweave-forest-dark font-ddin type-button-b1">
        <div>{title}</div>
        <button
          onClick={handleExpand}
          className="transition-transform duration-300"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 0 : 180 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 15,
            }}
          >
            {isExpanded ? <ExpandedIcon /> : <ExpandIcon />}
          </motion.div>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
          marginBottom: isExpanded ? 0 : -16,
        }}
        transition={{
          height: isExpanded
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] } // 展開：保留彈跳感
            : { duration: 0.25, ease: "easeInOut" }, // 收合：平滑順暢，無回彈
          opacity: {
            duration: 0.25,
            ease: "easeInOut",
          },
          marginBottom: isExpanded
            ? { duration: 0.25, ease: [0.34, 1.3, 0.64, 1] }
            : { duration: 0.25, ease: "easeInOut" }, // 收合：平滑歸位
        }}
        style={{
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={false}
          animate={{
            y: isExpanded ? 0 : -10,
            scale: isExpanded ? 1 : 0.98,
          }}
          transition={{
            duration: 0.25,
            ease: [0.34, 1.3, 0.64, 1],
          }}
        >
          <Feed
            posts={posts}
            conditions={conditions}
            onPostClick={(post) => router.push(`/item/${post.id}`)}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Drawer;
