"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Share2, Heart, MessageSquare } from "lucide-react";

import WeavingIcon from "./icons/WeavingIcon";
import SeekIcon2 from "./icons/SeekIcon2";
import WishBadgeIcon from "./icons/WishBadgeIcon";
import ShareBadgeIcon from "./icons/ShareBadgeIcon";
import WazowskiIcon from "./icons/WazowskiIcon";
import DashlineIcon from "./icons/DashlineIcon";
import ScrollHandIcon from "./icons/ScrollHandIcon";
import AlertIcon from "./icons/AlertIcon";
import PrivateMessageIcon from "./icons/PrivateMessageIcon";
export type TourStepType =
  "welcome" | "wish" | "share" | "scroll" | "rules" | "message";

export type TourStep = {
  targetId?: string;
  title?: string;
  content: string | React.ReactNode;
  layoutType: TourStepType;
};

type OverlayTourProps = {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
};

export default function OverlayTour({
  steps,
  isOpen,
  onClose,
}: OverlayTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetBorderRadius, setTargetBorderRadius] = useState<string>("50px");
  const [showMockDetail, setShowMockDetail] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 375,
  );
  const [badgeAnchorRect, setBadgeAnchorRect] = useState<DOMRect | null>(null);

  // --- SWIPE State ---
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const isSwiping = useRef(false);
  const isTransitioning = useRef(false);

  const step = steps[currentStepIndex];

  const updatePosition = useCallback(() => {
    if (!isOpen || !step || isTransitioning.current) return;

    if (step.targetId) {
      // Prefer the primary element; fall back to the -desktop variant when primary is display:none (zero-width)
      let el = document.getElementById(step.targetId);
      if (el && el.getBoundingClientRect().width === 0) {
        const desktopEl = document.getElementById(step.targetId + "-desktop");
        if (desktopEl && desktopEl.getBoundingClientRect().width > 0) {
          el = desktopEl;
        }
      }
      if (el) {
        const rect = el.getBoundingClientRect();
        // Read the element's actual border-radius so the spotlight matches
        const computedRadius = window.getComputedStyle(el).borderRadius;
        setTargetBorderRadius(computedRadius || "50px");
        const isInViewport =
          rect.top >= 60 && rect.bottom <= window.innerHeight - 60;
        const isSpotlightStep =
          step.layoutType === "wish" ||
          step.layoutType === "share" ||
          step.layoutType === "message";

        if (!isInViewport) {
          isTransitioning.current = true;

          // Temporarily allow scrolling while keeping the scrollbar gutter to avoid layout shift
          document.body.style.overflowY = "scroll";
          document.body.style.overflowX = "hidden";

          if (
            step.layoutType === "welcome" ||
            step.layoutType === "wish" ||
            step.layoutType === "share"
          ) {
            window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
          } else {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          setTimeout(() => {
            // Re-lock body overflow
            document.body.style.overflowY = "";
            document.body.style.overflowX = "";
            document.body.style.overflow = "hidden";
            isTransitioning.current = false;

            if (isSpotlightStep) {
              setTargetRect(el!.getBoundingClientRect());
            } else {
              setTargetRect(null);
            }
          }, 500);
        } else {
          if (isSpotlightStep) {
            setTargetRect(rect);
          } else {
            setTargetRect(null);
          }
        }
      } else {
        setTargetRect(null);
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, step]);

  useEffect(() => {
    const refreshBadgeAnchor = () => {
      const el = document.getElementById("tour-badge-anchor");
      if (el) setBadgeAnchorRect(el.getBoundingClientRect());
    };
    updatePosition();
    refreshBadgeAnchor();
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      updatePosition();
      refreshBadgeAnchor();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updatePosition]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      document.body.style.overflow = "hidden";
      // Refresh badge anchor after the feed has painted
      setTimeout(() => {
        const el = document.getElementById("tour-badge-anchor");
        if (el) setBadgeAnchorRect(el.getBoundingClientRect());
      }, 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      const nextStep = steps[currentStepIndex + 1];
      if (nextStep?.layoutType === "message") {
        setShowMockDetail(true);
      }
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Tour finished — delegate scroll to parent's onClose callback
      setShowMockDetail(false);
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prevStep = steps[currentStepIndex - 1];
      if (
        step?.layoutType === "message" &&
        prevStep?.layoutType !== "message"
      ) {
        setShowMockDetail(false);
      }
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  // --- SWIPE LOGIC ---
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    isSwiping.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      isSwiping.current = true; // prevent the next onClick from advancing immediately
      if (isLeftSwipe) {
        handleNext(); // swipe left = next
      } else if (isRightSwipe) {
        handlePrev(); // swipe right = prev
      }
    }
  };

  // 此變數決定：如果有選到目標，且不屬於不該挖洞的步驟（如 scroll 步驟不需要大範圍挖洞），才呈現亮斑
  const showSpotlight =
    targetRect &&
    step?.layoutType !== "scroll" &&
    step?.layoutType !== "welcome" &&
    step?.layoutType !== "rules";

  // Spotlight Box
  const spotlightStyle = showSpotlight
    ? {
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
        borderRadius: targetBorderRadius,
      }
    : {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        borderRadius: targetBorderRadius,
      };

  // Close handler with scroll-to-top
  const handleClose = () => {
    setShowMockDetail(false);
    onClose();
  };

  // For the message step, we render a completely different full-screen mock overlay
  const isMessageStep = step?.layoutType === "message";

  return (
    <div
      className="fixed inset-0 z-[100]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Left click zone — go to previous step */}
      <div
        className="absolute inset-y-0 left-0 z-[110] w-1/3 cursor-w-resize"
        onClick={() => {
          if (!isSwiping.current) handlePrev();
        }}
        aria-label="Previous tour step"
      />
      {/* Right click zone — go to next step */}
      <div
        className="absolute inset-y-0 right-0 z-[110] w-1/3 cursor-e-resize"
        onClick={() => {
          if (!isSwiping.current) handleNext();
        }}
        aria-label="Next tour step"
      />
      {/* ====== Mock PostDetail Overlay (Message Step) ====== */}
      <AnimatePresence>
        {showMockDetail && (
          <motion.div
            key="mock-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="pointer-events-none fixed inset-0 z-[105] overflow-hidden bg-[#f5f4f3]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mock Top Bar */}
            <div className="mt-[70px] flex items-center justify-between px-4 py-3">
              <div className="rounded-lg p-2">
                <ArrowLeft className="h-6 w-6 text-gray-800" />
              </div>
              <div className="rounded-lg p-2">
                <Share2 className="h-6 w-6 text-gray-800" />
              </div>
            </div>

            {/* Mock PostDetail Content */}
            <div className="mx-8 rounded-[30px] bg-white px-5 py-5">
              {/* Mock Image */}
              <div className="relative">
                <ShareBadgeIcon className="absolute -top-1 right-5 z-20" />
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[20px] bg-gray-200">
                  <span className="text-lg text-gray-400">📷</span>
                </div>
              </div>

              {/* Mock Title */}
              <h1 className="mb-2 mt-4 font-ddin text-2xl font-bold text-gray-900">
                Post Title
              </h1>

              {/* Mock Category */}
              <div className="mb-3 flex gap-2">
                <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">
                  Category
                </span>
              </div>

              {/* Mock Description */}
              <p className="mb-4 text-sm leading-relaxed text-gray-600">
                This is a sample post description showing what the detail page
                looks like...
              </p>

              {/* Mock Avatar Row */}
              <div className="mb-3 flex items-center rounded-[30px] bg-[#fafafa] p-[9px]">
                <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-gray-300 text-xl">
                  U
                </div>
                <div className="ml-[18px]">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Username (owner)
                  </h3>
                </div>
              </div>

              {/* Mock Action Bar — with highlighted message button */}
              <div className="flex items-center justify-start border-b border-megaweave-blue pb-4">
                <button className="inline-flex items-center space-x-1 px-3 py-2 text-gray-500">
                  <Heart className="h-5 w-5" />
                  <span className="text-sm text-black">12</span>
                </button>
                <button className="inline-flex items-center space-x-1 px-3 py-2 text-gray-500">
                  <MessageSquare className="h-5 w-5" />
                </button>
                {/* THIS is the highlighted private message button */}
                <div
                  id="tour-message"
                  className="inline-flex items-center px-2 py-1"
                >
                  <PrivateMessageIcon className="h-5 w-5 text-gray-500" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== Normal Tour Layer (Spotlight + Cards + Dots) ====== */}
      {/* Spotlight Canvas */}
      <motion.div
        initial={false}
        animate={spotlightStyle}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="pointer-events-none fixed"
        style={{
          boxShadow: isMessageStep
            ? "0 0 0 9999px rgba(0, 0, 0, 0.80)"
            : "0 0 0 9999px rgba(0, 0, 0, 0.80)",
          background: "transparent",
          zIndex: isMessageStep ? 106 : undefined,
        }}
      />

      {/* Global Close Button (Top Right) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        className="absolute right-6 top-6 z-[120] text-white transition-colors"
        aria-label="Close tour"
      >
        <X size={18} strokeWidth={6} />
      </button>

      {/* Absolute Tooltip Card Container */}
      <div className="pointer-events-none absolute inset-x-0 inset-y-0 z-[115] flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`relative mx-[63px] w-[340px] max-w-[80%] ${
              step?.layoutType === "scroll" || step?.layoutType === "message"
                ? "bg-transparent"
                : "bg-[#F1F1F1]/90"
            } ${step.layoutType === "wish" || step.layoutType === "share" ? "-mt-56" : ""} ${step.layoutType === "rules" ? "py-[30px]" : ""} ${step.layoutType === "message" ? "mt-[20px]" : ""} pointer-events-auto rounded-[24px] p-5 text-megaweave-forest-dark shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Contextual Decorations based on Layout Type */}
            {step?.layoutType === "welcome" && (
              <>
                <div className="pointer-events-none absolute -left-[20px] -top-[40px] h-16 w-16">
                  <WazowskiIcon />
                </div>
                <div className="pointer-events-none mx-auto h-28 w-28">
                  <WeavingIcon className="h-full w-full text-[#3B6232]" />
                </div>
                <div className="pointer-events-none absolute -right-[30px] bottom-0 h-16 w-16">
                  <SeekIcon2 />
                </div>
              </>
            )}

            {step?.layoutType === "wish" && (
              <>
                <div className="pointer-events-none absolute -top-[50px] right-[30px] h-16 w-16 text-[#714f36]">
                  <SeekIcon2 />
                </div>
              </>
            )}

            {step?.layoutType === "share" && (
              <>
                <div className="pointer-events-none absolute -top-14 left-[30px] h-16 w-16">
                  <WazowskiIcon />
                </div>
              </>
            )}

            {step?.layoutType === "scroll" && (
              <div className="flex flex-col items-center text-white">
                <div className="mb-6 flex flex-col items-center">
                  <DashlineIcon />
                  <motion.div
                    animate={{ y: [0, -30, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute top-1/3 ml-14 text-white"
                  >
                    <ScrollHandIcon className="h-16 w-16" />
                  </motion.div>
                </div>
                <div className="type-button-b1 absolute -right-4 top-1/2 w-[126px] rounded-xl bg-[#EEEEEE] p-5 text-left text-megaweave-forest-dark shadow-lg">
                  {step.content}
                </div>
              </div>
            )}

            {step?.layoutType === "rules" && (
              <>
                <div className="pointer-events-none absolute -top-[65px] left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full">
                  <AlertIcon />
                </div>
              </>
            )}

            {step?.layoutType === "message" && (
              <>
                <div className="pointer-events-none absolute -top-20 right-1/2 h-16 w-16">
                  <div className="pointer-events-none relative mx-auto h-28 w-28">
                    <div className="absolute inset-[30%] rounded-sm bg-white" />
                    <WeavingIcon className="relative h-full w-full text-[#3B6232]" />
                  </div>
                </div>
              </>
            )}

            {/* Standard Text Content area */}
            {step?.layoutType !== "scroll" && (
              <div
                className={`${step.layoutType === "welcome" ? "mt-12" : ""} ${step.layoutType === "message" ? "rounded-[24px] bg-[#F1F1F1]/90 p-5" : ""} flex flex-col items-center justify-center text-center font-ddin`}
              >
                <div className="type-button-b1 whitespace-pre-wrap text-left text-megaweave-forest-dark">
                  {step?.content}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 獨立渲染的 Badge — position derived from #tour-badge-anchor (first PostCard's badge container) */}
      <AnimatePresence>
        {step?.layoutType === "wish" && (badgeAnchorRect || targetRect) && (() => {
          // Always prefer the real badge container anchor (works on both mobile & desktop)
          const right = badgeAnchorRect
            ? windowWidth - badgeAnchorRect.right + 10
            : targetRect
              ? windowWidth - targetRect.right + 10
              : 54;
          const top = badgeAnchorRect
            ? badgeAnchorRect.top
            : targetRect
              ? targetRect.bottom + 8
              : 120;
          return (
            <motion.div
              key="wish-badge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed z-[120] text-[#efd0c4]"
              style={{ right, top, width: "48px", height: "48px" }}
            >
              <WishBadgeIcon />
            </motion.div>
          );
        })()}

        {step?.layoutType === "share" && (badgeAnchorRect || targetRect) && (() => {
          const right = badgeAnchorRect
            ? windowWidth - badgeAnchorRect.right + 10
            : targetRect
              ? windowWidth - targetRect.right + 10
              : 54;
          const top = badgeAnchorRect
            ? badgeAnchorRect.top
            : targetRect
              ? targetRect.bottom + 8
              : 120;
          return (
            <motion.div
              key="share-badge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none fixed z-[120] text-[#fbe7c6]"
              style={{ right, top, width: "48px", height: "48px" }}
            >
              <ShareBadgeIcon />
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Fixed Bottom Dots Navigation */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-8 z-[120] flex justify-center space-x-2.5">
        {steps.map((_, idx) => (
          <button
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentStepIndex(idx);
            }}
            aria-label={`Go to step ${idx + 1}`}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              idx === currentStepIndex ? "w-6 bg-white" : "w-2.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
