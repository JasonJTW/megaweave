import { Post } from "@/app/types/schema";
import { PendingItem } from "@/app/contexts/ChatPopupContext";
import Image from "next/image";

interface PostInfoCardProps {
  post: Post;
  item?: PendingItem | null;
}

const PostInfoCard: React.FC<PostInfoCardProps> = ({ post, item }) => {
  const displayTitle =
    item && item.title !== "all" ? item.title : `All Items - ${post.title}`;

  return (
    <div className="w-full h-[100px] bg-primary-15 flex flex-col justify-center px-2 font-ddin">
      <div className="flex flex-row gap-4">
        {(() => {
          const urls = post.image_urls ? post.image_urls.split(",") : [];
          const firstImg =
            urls.length > 0 && urls[0].trim() !== "" ? urls[0] : null;
          return firstImg ? (
            <Image
              width={80}
              height={80}
              src={firstImg}
              className="aspect-square object-cover rounded-md"
              alt=""
            />
          ) : (
            <div className="w-[30px] h-[30px] bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-400">
              No px
            </div>
          );
        })()}
        <div>
          <div className="mt-2 type-h4 truncate">{displayTitle}</div>
          <div className="text-xs text-gray-500">
            ID: {item ? item.id : post.id}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostInfoCard;
