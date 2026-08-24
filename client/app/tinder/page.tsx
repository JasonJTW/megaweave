"use client";

import React from "react";
import TinderFeed from "../components/TinderFeed/TinderFeed";

export default function TinderPage() {
  return (
    <>
      {/* Background layer */}
      <div className="fixed inset-0 -z-10 bg-[#F4F5F3]" />

      {/* Main Tinder Feed Container: Mobile-first, centered with margins on desktop */}
      <main className="relative flex min-h-[calc(100dvh-64px)] w-full items-center justify-center overflow-hidden">
        <TinderFeed />
      </main>
    </>
  );
}
