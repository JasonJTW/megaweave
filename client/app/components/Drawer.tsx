import React from "react";
import ExpandIcon from "./icons/ExpandIcon";
import Feed from "./PostCard/Feed";
import type { Post, Condition } from "../types/schema";
import { useRouter } from "next/navigation";
interface DrawerProps {
  title: string;
  posts: Post[];
  conditions: Condition[];
}
const handleExpand = () => {
  alert("Expand drawer");
};
const Drawer: React.FC<DrawerProps> = ({ title, posts, conditions }) => {
  const router = useRouter();
  return (
    <>
      <div className="flex justify-between mx-4 my-[20px] px-[16px] py-[8px] border-b border-primary-30 text-megaweave-forest-dark font-ddin type-button-b1">
        <div>{title}</div>
        <button onClick={handleExpand}>
          <ExpandIcon />
        </button>
      </div>
      <Feed
        posts={posts}
        conditions={conditions}
        onPostClick={(post) => router.push(`/item/${post.id}`)}
      />
    </>
  );
};

export default Drawer;
