// components/DividerStart.tsx
export default function DividerStart({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="100"
      viewBox="0 0 160 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M75 62.5C75 83.2107 58.2107 100 37.5 100C16.7893 100 -6.46864e-06 83.2107 -5.03677e-06 62.5L-3.30836e-06 37.5C-1.87649e-06 16.7893 16.7893 1.60921e-06 37.5 3.75112e-06C58.2107 5.89303e-06 75 16.7893 75 37.5L75 62.5Z"
        fill="currentColor"
      />
      <path
        d="M160 62.5C160 83.2107 143.211 100 122.5 100C101.789 100 85 83.2107 85 62.5L85 37.5C85 16.7893 101.789 1.60921e-06 122.5 3.75112e-06C143.211 5.89303e-06 160 16.7893 160 37.5L160 62.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
