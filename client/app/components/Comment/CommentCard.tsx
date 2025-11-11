import React from "react";
import { useState } from "react";
import MessageIcon from "../icons/MessageIcon";
import { Button } from "@/components/ui/button";
import ExpandIcon from "../icons/ExpandIcon";
import WeavingIcon from "../icons/WeavingIcon";
// interface CommentCardProps {
//   open: boolean;
// }

const CommentCard = () => {
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`flex ${
        open == true ? "h-auto" : "h-[36px] overflow-hidden leading-[36px]"
      } bg-primary-5 rounded-[18px] font-ddin px-[17px] py-[4px] items-center justify-between`}
    >
      <div className="font-medium text-[21px] text-center">All</div>
      <div className="flex gap-[10px]">
        <Button
          variant="ghost"
          className="px-0 py-0"
          onClick={() => {
            setOpen(!open);
          }}
        >
          <MessageIcon className="!h-[19px] !w-[19px]" />
        </Button>
        <Button
          variant="ghost"
          className="px-0"
          onClick={() => {
            setOpen(!open);
          }}
        >
          <WeavingIcon className="!h-[19px] !w-[19px]" />
        </Button>
        <Button
          variant="ghost"
          className="px-0"
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ExpandIcon className="!h-[19px] !w-[19px]" />
        </Button>
      </div>
    </div>
  );
};

export default CommentCard;
