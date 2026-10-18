export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-label="Cuadra"
      role="img"
    >
      <rect x="3" y="3" width="12" height="12" rx="3.2" fill="currentColor" opacity="0.35" />
      <rect x="17" y="3" width="12" height="12" rx="3.2" fill="currentColor" />
      <rect x="3" y="17" width="12" height="12" rx="3.2" fill="currentColor" opacity="0.7" />
      <rect x="17" y="17" width="12" height="12" rx="3.2" fill="currentColor" opacity="0.35" />
    </svg>
  );
}
