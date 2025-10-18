// components/LocationIcon.tsx
export default function LocationIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="15"
      viewBox="0 0 12 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M6.39998 0H5.60002C2.50727 0 0 2.50778 0 5.60114V6.40127C0 7.94209 0.969988 9.4245 1.97654 10.4372L5.65604 14.4927C5.81155 14.6527 6.06795 14.6544 6.22571 14.4966L10.0871 10.4605C11.1075 9.44595 12 7.95395 12 6.40112V5.601C12 2.50778 9.49287 0 6.39998 0Z"
        fill="currentColor"
      />
      <path
        d="M6.1638 3.28711H5.82066C4.49369 3.28711 3.41797 4.36283 3.41797 5.6898V6.03294C3.41797 7.3599 4.49369 8.43562 5.82066 8.43562H6.1638C7.49076 8.43562 8.56648 7.3599 8.56648 6.03294V5.6898C8.56648 4.36283 7.49076 3.28711 6.1638 3.28711Z"
        fill="white"
      />
    </svg>
  );
}
