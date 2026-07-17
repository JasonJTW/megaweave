import SeekIcon from "../icons/SeekIcon";
import ReuseIcon from "../icons/ReuseIcon";
import ShareIcon from "../icons/ShareIcon";
import WeavingIcon from "../icons/WeavingIcon";
import MessageIcon from "../icons/MessageIcon";
import AddIcon from "../icons/AddIcon";
interface UserPageDecoLineProps {
  className?: string;
}
export default function UserPageDecoLine({ className }: UserPageDecoLineProps) {
  return (
    <div
      className={`flex h-[24px] flex-1 justify-between pb-4 text-megaweave-forest-dark ${
        className || ""
      }`}
    >
      <SeekIcon className="h-[24px] w-auto" />
      <ReuseIcon className="h-[24px] w-auto" />
      <ShareIcon className="h-[24px] w-auto" />
      <WeavingIcon className="h-[24px] w-auto" />
      <MessageIcon className="h-[24px] w-auto" />
      <AddIcon className="h-[24px] w-auto" />
      <AddIcon className="h-[24px] w-auto" />
    </div>
  );
}
