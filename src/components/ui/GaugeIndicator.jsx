import React from "react";

const GaugeIndicator = ({
  value = 0,
  max = 10,
  color = "#60A5FA",
  size = 100,
}) => {
  const strokeWidth = 6;
  const center = size / 2;
  const radius = size / 2 - strokeWidth;

  // 160° sweep for modern look (not full half circle)
  const startAngle = -170;
  const endAngle = -10;
  const sweep = endAngle - startAngle;

  const percentage = Math.min(value / max, 1);
  const activeAngle = startAngle + sweep * percentage;

  const polarToCartesian = (angle) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(rad),
      y: center + radius * Math.sin(rad),
    };
  };

  const describeArc = (start, end) => {
    const startPos = polarToCartesian(start);
    const endPos = polarToCartesian(end);
    return `
      M ${startPos.x} ${startPos.y}
      A ${radius} ${radius} 0 0 1 ${endPos.x} ${endPos.y}
    `;
  };

  // Needle line (only declare once below)

  // Tick marks
  const ticks = [];
  const tickCount = 6;
  for (let i = 0; i < tickCount; i++) {
    const tickAngle = startAngle + (sweep / (tickCount - 1)) * i;
    const tickStart = polarToCartesian(tickAngle);
    const tickEnd = polarToCartesian(tickAngle, radius - 18);
    ticks.push(
      <line
        key={i}
        x1={tickStart.x}
        y1={tickStart.y}
        x2={tickEnd.x}
        y2={tickEnd.y}
        stroke="#A3A7B3"
        strokeWidth={4}
        opacity={0.5}
        strokeLinecap="round"
      />
    );
  }

  // Needle line
  const needleLength = radius - 10;
  const needleAngleRad = (activeAngle * Math.PI) / 180;
  const needleX = center + needleLength * Math.cos(needleAngleRad);
  const needleY = center + needleLength * Math.sin(needleAngleRad);

  // Needle base circle
  const baseRadius = 14;

  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox={`0 0 ${size} ${size * 0.6}`}
      className="overflow-visible"
    >
      {/* Background Track */}
      <path
        d={describeArc(startAngle, endAngle)}
        stroke="#23262F"
        strokeWidth={16}
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Active Arc */}
      <path
        d={describeArc(startAngle, activeAngle)}
        stroke={color}
        strokeWidth={16}
        fill="none"
        strokeLinecap="round"
      />

      {/* Tick marks */}
      {ticks}

      {/* Needle */}
      <line
        x1={center}
        y1={center}
        x2={needleX}
        y2={needleY}
        stroke="#A3A7B3"
        strokeWidth={8}
        strokeLinecap="round"
      />

      {/* Needle base circle */}
      <circle
        cx={center}
        cy={center}
        r={baseRadius}
        fill="#A3A7B3"
        opacity={0.7}
      />
    </svg>
  );
};

export default GaugeIndicator;