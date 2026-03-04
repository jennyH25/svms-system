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
    <div className={`bg-gradient-to-br from-[#1E1F22] to-[#26282c] rounded-xl p-5 border border-white/10 transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02] ${className}`}>
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-lg font-bold text-[#60A5FA] mb-1 text-center">{title}</p>
        <p className="text-4xl font-bold text-white mb-1 text-center">{value}</p>
        {comparisonLabel && (
          <p className="text-gray-400 text-base font-medium mb-2 text-center">{comparisonLabel}</p>
        )}
        <div className="flex justify-center mt-2">
          <GaugeIndicator value={value} max={max} color={color} size={100} />
        </div>
      </div>
    </div>
  );
};

export default StudentStatCard;
