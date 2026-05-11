import React from 'react';
import GaugeIndicator from './GaugeIndicator';

const StudentStatCard = ({
  title,
  value,
  max = 10,
  color = '#60A5FA',
  comparisonLabel = '',
  className = ''
}) => {
  return (
    <div className={`bg-gradient-to-br from-[#1E1F22] to-[#26282c] rounded-xl p-4 sm:p-5 border border-white/10 min-h-[220px] sm:min-h-[260px] transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02] ${className}`}>
      <div className="flex flex-col h-full items-center justify-center">
        {title && (
          <p className="text-lg md:text-xl font-bold text-[#60A5FA] mb-1 text-center">{title}</p>
        )}
        <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-1 text-center">{value}</p>
        {comparisonLabel && (
          <p className="text-sm sm:text-base md:text-lg font-medium text-gray-400 mb-2 text-center">{comparisonLabel}</p>
        )}
        <div className="flex justify-center mt-3">
          <GaugeIndicator value={value} max={max} color={color} size={96} />
        </div>
      </div>
    </div>
  );
};

export default StudentStatCard;
