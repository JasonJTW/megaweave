import { motion, TargetAndTransition } from "framer-motion";
import { useId } from "react";

export default function ElfIcon({ className }: { className?: string }) {
  const id = useId();
  const safeId = id.replace(/:/g, "");
  const rightClipId = `right-eye-clip-${safeId}`;
  const leftClipId = `left-eye-clip-${safeId}`;

  // 三階段同步動畫：Center -> Blink1 -> Left -> Blink2 -> Right -> Blink3 -> Center
  const syncDuration = 9;
  const syncTimes = [0, 0.2, 0.22, 0.24, 0.5, 0.52, 0.54, 0.8, 0.82, 0.84, 1];

  const blinkAnimation: TargetAndTransition = {
    scaleY: [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1],
    transition: {
      duration: syncDuration,
      repeat: Infinity,
      times: syncTimes,
      ease: "easeInOut",
    },
  };

  const lookAnimation: TargetAndTransition = {
    x: [-2, -2, -8, -8, -8, 5, 5, 5, -2, -2, -2],
    transition: {
      duration: syncDuration,
      repeat: Infinity,
      times: syncTimes,
      ease: "easeInOut",
    },
  };

  return (
    <svg
      width="171"
      height="171"
      viewBox="0 0 171 171"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <clipPath id={rightClipId}>
          <circle cx="89.5177" cy="62.6732" r="22.4877" />
        </clipPath>
        <clipPath id={leftClipId}>
          <circle cx="52.413" cy="62.6732" r="22.4877" />
        </clipPath>
      </defs>
      <path
        d="M0 85.5C0 38.2796 38.2796 0 85.5 0C132.72 0 171 38.2796 171 85.5V159.976C171 166.064 166.064 171 159.976 171H11.0239C4.93556 171 0 166.064 0 159.976V85.5Z"
        fill="currentColor"
      />
      {/* 為了防止右眼被遮住，將右眼的繪製順序放在左眼之後 */}
      {/* Left Eye */}
      <motion.g
        animate={blinkAnimation}
        style={{ transformOrigin: "52.4px 62.6px" }}
      >
        <rect
          x="29.9253"
          y="85.1606"
          width="44.9754"
          height="44.9754"
          rx="22.4877"
          transform="rotate(-90 29.9253 85.1606)"
          fill="white"
        />
        <motion.g animate={lookAnimation} clipPath={`url(#${leftClipId})`}>
          <rect
            x="39.167"
            y="77.2896"
            width="29.234"
            height="29.234"
            rx="14.617"
            transform="rotate(-90 39.167 77.2896)"
            fill="#333333"
          />
        </motion.g>
      </motion.g>
      {/* Right Eye */}
      <motion.g
        animate={blinkAnimation}
        style={{ transformOrigin: "89.5px 62.6px" }}
      >
        <rect
          x="67.03"
          y="85.1606"
          width="44.9754"
          height="44.9754"
          rx="22.4877"
          transform="rotate(-90 67.03 85.1606)"
          fill="white"
        />
        <motion.g animate={lookAnimation} clipPath={`url(#${rightClipId})`}>
          <rect
            x="76.7859"
            y="77.2896"
            width="29.234"
            height="29.234"
            rx="14.617"
            transform="rotate(-90 76.7859 77.2896)"
            fill="#333333"
          />
        </motion.g>
      </motion.g>
    </svg>
  );
}
