interface Props {
  size?: number;
}

/**
 * Rocktier Journal monogram — "JN" in a Rounded-Square with the signature
 * Rocktier red dot. Offline-first vector (paths, no emoji).
 */
export default function JnLogo({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="JN — Rocktier Journal"
    >
      {/* Background rounded-square */}
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="7"
        ry="7"
        fill="var(--accent)"
      />
      {/* JN monogram */}
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif"
        fontSize="14"
        fontWeight="700"
        fill="var(--accent-text)"
      >
        JN
      </text>
      {/* Rocktier signature red dot */}
      <circle cx="25" cy="7" r="3" fill="var(--red)" />
    </svg>
  );
}
