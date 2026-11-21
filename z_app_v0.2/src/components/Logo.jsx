export function Logo({ className = "h-8 w-8" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Chatbot head (rounded rectangle) */}
      <rect x="20" y="25" width="80" height="60" rx="15" fill="currentColor" />

      {/* Antenna ball */}
      <circle cx="90" cy="15" r="8" fill="currentColor" />

      {/* Antenna stick */}
      <line
        x1="90"
        y1="23"
        x2="90"
        y2="25"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Left eye */}
      <circle cx="45" cy="45" r="5" fill="white" />

      {/* Right eye */}
      <circle cx="75" cy="45" r="5" fill="white" />

      {/* Dollar sign mouth area (speech bubble style) */}
      <circle cx="60" cy="65" r="12" fill="white" />

      {/* Dollar sign $ */}
      <text
        x="60"
        y="72"
        fontFamily="Arial, sans-serif"
        fontSize="18"
        fontWeight="bold"
        fill="currentColor"
        textAnchor="middle"
      >
        $
      </text>

      {/* Speech bubble tail */}
      <path d="M 30 85 L 20 100 L 40 90 Z" fill="currentColor" />
    </svg>
  );
}
