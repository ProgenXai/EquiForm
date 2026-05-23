type RosetteIconProps = {
  size?: number;
};

export default function RosetteIcon({ size = 20 }: RosetteIconProps) {
  const accent = "#00d4c8";
  const accentDark = "#00bfb5";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="inline-block shrink-0 align-middle"
    >
      <circle cx="12" cy="12" r="11" fill={accent} stroke="white" strokeWidth="1.25" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <line
          key={angle}
          x1="12"
          y1="12"
          x2="12"
          y2="2.5"
          stroke="white"
          strokeWidth="1"
          strokeLinecap="round"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
      <circle
        cx="12"
        cy="12"
        r="7.25"
        fill="none"
        stroke="white"
        strokeWidth="1.25"
        strokeDasharray="2.2 1.8"
      />
      <circle cx="12" cy="12" r="4.25" fill={accentDark} stroke="white" strokeWidth="1" />
      <circle cx="12" cy="12" r="1.75" fill="white" />
    </svg>
  );
}
