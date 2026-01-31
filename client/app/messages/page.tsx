"use client";

import React from "react";
import { ConversationList } from "@/app/components/Chat/ConversationList";
import { MessageSquare } from "lucide-react";

export default function MessagesPage() {
  return (
    <div className="container max-w-6xl mx-auto h-[calc(100vh-64px)] p-0 md:p-4">
       <div className="flex h-full bg-white rounded-lg shadow-sm overflow-hidden border">
           {/* Sidebar - Always visible on mobile for index page, Left side on desktop */}
           <div className="w-full md:w-1/3 border-r h-full">
               <ConversationList />
           </div>
           
           {/* Placeholder - Hidden on mobile, Right side on desktop */}
           <div className="hidden md:flex flex-col flex-1 items-center justify-center p-8 text-center bg-gray-50 h-full">
               <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                   <MessageSquare className="w-12 h-12 text-blue-500" />
               </div>
               <h3 className="text-xl font-bold text-gray-800">Your Messages</h3>
               <p className="text-gray-500 max-w-sm mt-2">
                   Select a conversation from the list to start chatting.
               </p>
           </div>
       </div>
    </div>
  );
}
