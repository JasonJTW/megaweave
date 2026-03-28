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
  | "welcome"
  | "wish"
  | "share"
  | "scroll"
  | "rules"
  | "message";

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
  const [showMockDetail, setShowMockDetail] = useState(false);

  // --- SWIPE State ---
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const isSwiping = useRef(false);
  const isTransitioning = useRef(false);

  const step = steps[currentStepIndex];

  const updatePosition = useCallback(() => {
    if (!isOpen || !step || isTransitioning.current) return;

    if (step.targetId) {
      const el = document.getElementById(step.targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        const isInViewport =
          rect.top >= 60 && rect.bottom <= window.innerHeight - 60;
        const isSpotlightStep =
          step.layoutType === "wish" ||
          step.layoutType === "share" ||
          step.layoutType === "message";

        if (!isInViewport) {
          isTransitioning.current = true;

          // Temporarily unlock body overflow so scrollIntoView actually works
          document.body.style.overflow = "";

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
            // Re-lock body overflow after scroll completes
            document.body.style.overflow = "hidden";
            isTransitioning.current = false;

            if (isSpotlightStep) {
              setTargetRect(el.getBoundingClientRect());
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
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      document.body.style.overflow = "hidden";
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
      // Tour finished — close and scroll to top
      setShowMockDetail(false);
      onClose();
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 100);
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

  const handleClick = () => {
    // If the logical 'click' was triggered at the end of a swipe, ignore it
    if (isSwiping.current) {
      isSwiping.current = false;
      return;
    }
    handleNext(); // Normal tap = next
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
        borderRadius: 50,
      }
    : {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        borderRadius: 50,
      };

  // Close handler with scroll-to-top
  const handleClose = () => {
    setShowMockDetail(false);
    onClose();
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  // For the message step, we render a completely different full-screen mock overlay
  const isMessageStep = step?.layoutType === "message";

  return (
    <div
      className="fixed inset-0 z-[100] cursor-pointer"
      onClick={handleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      aria-label="Proceed to next tour step"
    >
      {/* ====== Mock PostDetail Overlay (Message Step) ====== */}
      <AnimatePresence>
        {showMockDetail && (
          <motion.div
            key="mock-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-[105] bg-[#f5f4f3] overflow-hidden pointer-events-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mock Top Bar */}
            <div className="px-4 py-3 mt-[70px] flex items-center justify-between">
              <div className="p-2 rounded-lg">
                <ArrowLeft className="w-6 h-6 text-gray-800" />
              </div>
              <div className="p-2 rounded-lg">
                <Share2 className="w-6 h-6 text-gray-800" />
              </div>
            </div>

            {/* Mock PostDetail Content */}
            <div className="mx-8 px-5 py-5 bg-white rounded-[30px]">
              {/* Mock Image */}
              <div className="relative">
                <ShareBadgeIcon className="absolute -top-1 right-5 z-20" />
                <div className="bg-gray-200 rounded-[20px] w-full aspect-[4/3] flex items-center justify-center">
                  <span className="text-gray-400 text-lg">📷</span>
                </div>
              </div>

              {/* Mock Title */}
              <h1 className="text-2xl font-bold font-ddin text-gray-900 mt-4 mb-2">
                Post Title
              </h1>

              {/* Mock Category */}
              <div className="flex gap-2 mb-3">
                <span className="px-3 py-1 bg-secondary rounded-full text-sm font-medium">
                  Category
                </span>
              </div>

              {/* Mock Description */}
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                This is a sample post description showing what the detail page
                looks like...
              </p>

              {/* Mock Avatar Row */}
              <div className="flex items-center bg-[#fafafa] rounded-[30px] p-[9px] mb-3">
                <div className="w-[50px] h-[50px] rounded-full bg-gray-300 flex items-center justify-center text-xl">
                  U
                </div>
                <div className="ml-[18px]">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    Username (owner)
                  </h3>
                </div>
              </div>

              {/* Mock Action Bar — with highlighted message button */}
              <div className="flex items-center justify-start pb-4 border-b border-megaweave-blue">
                <button className="inline-flex items-center space-x-1 px-3 py-2 text-gray-500">
                  <Heart className="w-5 h-5" />
                  <span className="text-black text-sm">12</span>
                </button>
                <button className="inline-flex items-center space-x-1 px-3 py-2 text-gray-500">
                  <MessageSquare className="w-5 h-5" />
                </button>
                {/* THIS is the highlighted private message button */}
                <div
                  id="tour-message"
                  className="inline-flex items-center px-2 py-1"
                >
                  <PrivateMessageIcon className="w-5 h-5 text-gray-500" />
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
        className="fixed pointer-events-none"
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
        className="absolute top-6 right-6 z-[120] text-white transition-colors"
        aria-label="Close tour"
      >
        <X size={18} strokeWidth={6} />
      </button>

      {/* Absolute Tooltip Card Container */}
      <div className="absolute inset-x-0 inset-y-0 flex items-center justify-center pointer-events-none z-[115]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`relative max-w-[80%] w-[340px] mx-[63px] ${
              step?.layoutType === "scroll" || step?.layoutType === "message"
                ? "bg-transparent"
                : "bg-[#F1F1F1]/90"
            } ${step.layoutType === "wish" || step.layoutType === "share" ? "-mt-56" : ""} ${step.layoutType === "rules" ? "py-[30px]" : ""} ${step.layoutType === "message" ? "mt-[20px]" : ""} text-megaweave-forest-dark p-5 rounded-[24px] shadow-2xl pointer-events-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Contextual Decorations based on Layout Type */}
            {step?.layoutType === "welcome" && (
              <>
                <div className="absolute -top-[40px] -left-[20px] w-16 h-16 pointer-events-none">
                  <WazowskiIcon />
                </div>
                <div className="w-28 h-28 pointer-events-none mx-auto">
                  <WeavingIcon className="w-full h-full text-[#3B6232]" />
                </div>
                <div className="absolute bottom-0 -right-[30px] w-16 h-16 pointer-events-none">
                  <SeekIcon2 />
                </div>
              </>
            )}

            {step?.layoutType === "wish" && (
              <>
                <div className="absolute -top-[50px] right-[30px] w-16 h-16 pointer-events-none text-[#714f36]">
                  <SeekIcon2 />
                </div>
              </>
            )}

            {step?.layoutType === "share" && (
              <>
                <div className="absolute -top-14 left-[30px] w-16 h-16 pointer-events-none">
                  <WazowskiIcon />
                </div>
              </>
            )}

            {step?.layoutType === "scroll" && (
              <div className="flex flex-col items-center text-white">
                <div className="flex flex-col items-center mb-6">
                  <DashlineIcon />
                  <motion.div
                    animate={{ y: [0, -30, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute top-1/3 ml-14 text-white"
                  >
                    <ScrollHandIcon className="w-16 h-16" />
                  </motion.div>
                </div>
                <div className="bg-[#EEEEEE] text-megaweave-forest-dark type-button-b1 p-5 rounded-xl shadow-lg absolute top-1/2 -right-4 w-[126px] text-left">
                  {step.content}
                </div>
              </div>
            )}

            {step?.layoutType === "rules" && (
              <>
                <div className="absolute -top-[65px] left-1/2 -translate-x-1/2 w-20 h-20 rounded-full flex items-center justify-center pointer-events-none">
                  <AlertIcon />
                </div>
              </>
            )}

            {step?.layoutType === "message" && (
              <>
                <div className="absolute -top-20 right-1/2 w-16 h-16 pointer-events-none">
                  <div className="relative w-28 h-28 pointer-events-none mx-auto">
                    <div className="absolute inset-[30%] bg-white rounded-sm" />
                    <WeavingIcon className="relative w-full h-full text-[#3B6232]" />
                  </div>
                </div>
              </>
            )}

            {/* Standard Text Content area */}
            {step?.layoutType !== "scroll" && (
              <div
                className={`${step.layoutType === "welcome" ? "mt-12" : ""} ${step.layoutType === "message" ? "bg-[#F1F1F1]/90 rounded-[24px] p-5" : ""} text-center flex flex-col items-center justify-center font-ddin`}
              >
                <div className="type-button-b1 text-left text-megaweave-forest-dark whitespace-pre-wrap">
                  {step?.content}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 獨立渲染的 Badge */}
      <AnimatePresence>
        {step?.layoutType === "wish" && targetRect && (
          <motion.div
            key="wish-badge"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed pointer-events-none text-[#efd0c4] z-[120]"
            style={{
              top: targetRect.bottom + 40,
              right: 54,
              width: "48px",
              height: "48px",
            }}
          >
            <WishBadgeIcon />
          </motion.div>
        )}

        {step?.layoutType === "share" && targetRect && (
          <motion.div
            key="share-badge"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed pointer-events-none text-[#fbe7c6] z-[120]"
            style={{
              top: targetRect.bottom + 40,
              right: 54,
              width: "48px",
              height: "48px",
            }}
          >
            <ShareBadgeIcon />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Bottom Dots Navigation */}
      <div className="fixed bottom-8 inset-x-0 flex justify-center space-x-2.5 z-[120] pointer-events-none">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              idx === currentStepIndex ? "w-6 bg-white" : "w-2.5 bg-white/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
