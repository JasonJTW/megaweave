"use client";

import Image from "next/image";
import Link from "next/link";

interface WeavingRequestCardProps {
  itemTitle: string;
  quantity: number;
  imageUrl?: string;
  weaveId: number | string;
}

const WeavingRequestCard: React.FC<WeavingRequestCardProps> = ({
  itemTitle,
  quantity,
  imageUrl,
  weaveId,
}) => {
  return (
    <div className="flex flex-col items-center justify-center pb-4 w-full px-4">
      <span className="text-[12px] font-bold text-[#9EB098] font-ddin uppercase tracking-wider mb-2">
        Weaving Request Sent
      </span>

      <div className="w-full max-w-[360px] bg-primary-5 border border-primary-30/50 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {imageUrl ? (
            <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
              <Image
                fill
                src={imageUrl}
                className="object-cover"
                alt={itemTitle}
                sizes="48px"
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-[9px] text-gray-400 flex-shrink-0">
              No img
            </div>
          )}

          <div className="min-w-0 flex-1 text-left">
            <div className="font-bold text-[14px] text-gray-800 truncate leading-tight">
              {itemTitle}
            </div>
            <div className="text-[11px] text-gray-500 leading-none mt-1">
              Request Qty: {quantity}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">
            Pending
          </span>
          <Link
            href={`/user?highlightWeaveId=${weaveId}`}
            className="text-[11px] text-primary hover:underline font-bold"
          >
            View Detail &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};

export default WeavingRequestCard;
