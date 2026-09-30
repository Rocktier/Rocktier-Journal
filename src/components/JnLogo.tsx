interface Props {
  size?: number;
}

/**
 * Rocktier Journal monogram — "JN" in a Rounded-Square with the signature
 * Rocktier red dot. Offline-first vector (paths, no emoji).
 */
export default function JnLogo({ size = 32 }: Props) {
  return (
    <img
      src="/favicon.png"
      width={size}
      height={size}
      role="img"
      aria-label="Rocktier Journal"
      alt="Rocktier Journal"
    />
  );
}
