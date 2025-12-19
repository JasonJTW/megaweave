// components/WishBadgeIcon.tsx
export default function WishBadgeIcon({ className }: { className?: string }) {
  return (
    <svg
      width="50"
      height="69"
      viewBox="0 0 50 69"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M27.4795 68.0413C26.0259 69.1896 23.9741 69.1896 22.5205 68.0413L1.52048 51.4521C0.560195 50.6935 0 49.5371 0 48.3133V4C0 1.79086 1.79086 0 4 0H46C48.2091 0 50 1.79086 50 4V48.3133C50 49.5371 49.4398 50.6935 48.4795 51.4521L27.4795 68.0413Z"
        fill="#C05421"
      />
      <path
        d="M11.7646 33.9999C11.7646 26.6903 17.6903 20.7646 24.9999 20.7646C32.3096 20.7646 38.2352 26.6903 38.2352 33.9999V45.5288C38.2352 46.4712 37.4712 47.2352 36.5288 47.2352H13.4711C12.5287 47.2352 11.7646 46.4712 11.7646 45.5288V33.9999Z"
        fill="white"
        fillOpacity="0.7"
      />
      <rect
        x="22.1411"
        y="33.9473"
        width="6.96213"
        height="6.96213"
        rx="3.48106"
        transform="rotate(-90 22.1411 33.9473)"
        fill="white"
      />
      <rect
        x="23.6509"
        y="32.729"
        width="4.52538"
        height="4.52538"
        rx="2.26269"
        transform="rotate(-90 23.6509 32.729)"
        fill="#333333"
      />
      <rect
        x="16.397"
        y="33.9473"
        width="6.96213"
        height="6.96213"
        rx="3.48106"
        transform="rotate(-90 16.397 33.9473)"
        fill="white"
      />
      <rect
        x="17.8276"
        y="32.729"
        width="4.52538"
        height="4.52538"
        rx="2.26269"
        transform="rotate(-90 17.8276 32.729)"
        fill="#333333"
      />
    </svg>
  );
}
