// components/UserIcon.tsx
export default function ElfIcon({ className }: { className?: string }) {
  return (
    <svg
      width="171"
      height="171"
      viewBox="0 0 171 171"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M0 85.5C0 38.2796 38.2796 0 85.5 0C132.72 0 171 38.2796 171 85.5V159.976C171 166.064 166.064 171 159.976 171H11.0239C4.93556 171 0 166.064 0 159.976V85.5Z"
        fill="currentColor"
      />
      <rect
        x="67.03"
        y="85.1606"
        width="44.9754"
        height="44.9754"
        rx="22.4877"
        transform="rotate(-90 67.03 85.1606)"
        fill="white"
      />
      <rect
        x="76.7859"
        y="77.2896"
        width="29.234"
        height="29.234"
        rx="14.617"
        transform="rotate(-90 76.7859 77.2896)"
        fill="#333333"
      />
      <rect
        x="29.9253"
        y="85.1606"
        width="44.9754"
        height="44.9754"
        rx="22.4877"
        transform="rotate(-90 29.9253 85.1606)"
        fill="white"
      />
      <rect
        x="39.167"
        y="77.2896"
        width="29.234"
        height="29.234"
        rx="14.617"
        transform="rotate(-90 39.167 77.2896)"
        fill="#333333"
      />
    </svg>
  );
}
