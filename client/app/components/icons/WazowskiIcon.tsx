import { motion } from "framer-motion";

export default function WazowskiIcon({ className }: { className?: string }) {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M17.0654 0C23.0278 6.30247e-05 28.174 3.43317 30.5684 8.39648C30.8304 8.92299 31.3723 9.28516 32 9.28516C32.6277 9.28516 33.1696 8.92299 33.4316 8.39648C35.8259 3.43311 40.9722 6.35071e-05 46.9346 0L49.0654 0C57.3133 8.80269e-05 64 6.56922 64 14.6719V49.3281C64 57.4307 57.3133 63.9999 49.0654 64H46.9346C40.9722 63.9999 35.8259 60.5669 33.4316 55.6035C33.1696 55.0771 32.6277 54.7148 32 54.7148C31.3723 54.7148 30.8304 55.0771 30.5684 55.6035C28.1741 60.5668 23.0278 63.9999 17.0654 64H14.9346C6.68672 63.9999 4.66794e-05 57.4307 0 49.3281L0 14.6719C0 6.56922 6.68669 8.71837e-05 14.9346 0L17.0654 0Z"
        fill="#F0AF1E"
      />
      <motion.g
        animate={{ translateY: [2, -2, 2] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <rect
          x="35.1812"
          y="32.1875"
          width="18.7135"
          height="18.7134"
          rx="9.35672"
          transform="rotate(-90 35.1812 32.1875)"
          fill="white"
        />
        <rect
          x="40.0562"
          y="28.4443"
          width="12.7251"
          height="12.7251"
          rx="6.36257"
          transform="rotate(-90 40.0562 28.4443)"
          fill="#333333"
        />
      </motion.g>
    </svg>
  );
}
