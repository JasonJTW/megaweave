"use client";

import React from "react";
import { ConversationList } from "@/app/components/Chat/ConversationList";
import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="container mx-auto h-[calc(100vh-64px)] max-w-6xl p-0 md:p-4">
      <div className="flex h-full overflow-hidden rounded-lg border bg-white shadow-sm">
        {/* Sidebar - Always visible on mobile for index page, Left side on desktop */}
        <div className="h-full w-full border-r md:w-1/3">
          <ConversationList />
        </div>

        {/* Placeholder - Hidden on mobile, Right side on desktop */}
        <div className="hidden h-full flex-1 flex-col items-center justify-center bg-gray-50 p-8 text-center md:flex">
          <div className="mb-4 rounded-full bg-white p-4 shadow-sm">
            <MessageSquare className="h-12 w-12 text-blue-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-800">Your Messages</h3>
          <p className="mt-2 max-w-sm text-gray-500">
            Select a conversation from the list to start chatting.
          </p>
        </div>
      </div>
    </div>
  );
}
