// components/NancyIcon.tsx
export default function NancyIcon({ className }: { className?: string }) {
  return (
    <svg
      width="254"
      height="164"
      viewBox="0 0 254 164"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M0 127C0 56.8598 56.8598 0 127 0C197.14 0 254 56.8598 254 127V164H0L0 127Z"
        fill="#D6E3D4"
      />
      <rect
        x="206"
        y="27"
        width="102"
        height="102"
        rx="51"
        transform="rotate(90 206 27)"
        fill="white"
      />
      <mask
        id="mask0_1632_27368"
        style={{ maskType: "alpha" }}
        maskUnits="userSpaceOnUse"
        x="104"
        y="27"
        width="102"
        height="102"
      >
        <rect
          x="206"
          y="27"
          width="102"
          height="102"
          rx="51"
          transform="rotate(90 206 27)"
          fill="white"
        />
      </mask>
      <g mask="url(#mask0_1632_27368)">
        <rect
          x="156.02"
          y="45.3604"
          width="66.3"
          height="66.3"
          rx="33.15"
          transform="rotate(90 156.02 45.3604)"
          fill="#333333"
        />
      </g>
    </svg>
  );
}
