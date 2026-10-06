export function GeometricBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="geo-grid absolute inset-0" />
      <div className="geo-grid geo-grid-glow absolute inset-0" />
      <svg
        viewBox="-300 -300 600 600"
        className="absolute top-[-140px] right-[-220px] w-[760px] max-w-none opacity-70 max-md:top-[-80px] max-md:right-[-420px]"
        fill="none"
      >
        <g className="geo-spin" style={{ animationDuration: '160s' }} stroke="var(--sage-6)">
          <circle r="260" strokeDasharray="2 10" />
          <rect x="-184" y="-184" width="368" height="368" transform="rotate(45)" />
        </g>
        <g className="geo-spin" style={{ animationDuration: '110s', animationDirection: 'reverse' }}>
          <circle r="200" stroke="var(--sage-5)" />
          <rect x="-141" y="-141" width="282" height="282" stroke="var(--sage-6)" />
          <circle cx="200" r="4" fill="var(--jade-9)" />
        </g>
        <g className="geo-spin" style={{ animationDuration: '70s' }}>
          <polygon points="0,-130 112.6,65 -112.6,65" stroke="var(--jade-7)" strokeOpacity=".6" />
          <circle r="130" stroke="var(--sage-5)" strokeDasharray="1 6" />
          <circle cy="-130" r="3" fill="var(--jade-8)" />
        </g>
        <circle r="56" stroke="var(--sage-6)" />
        <circle r="3" fill="var(--sage-8)" />
      </svg>
    </div>
  )
}
