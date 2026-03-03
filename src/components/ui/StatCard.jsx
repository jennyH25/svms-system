import React from 'react'

const StatCard = ({ 
  title, 
  value, 
  percentage = 0, 
  icon,
  comparisonLabel = 'vs last semester',
  iconBgColor = 'bg-cyan-500/20',
  iconColor = 'text-cyan-400',
  className = '' 
}) => {
  const isPositive = percentage >= 0

  return (
    <div className={`bg-gradient-to-br from-[#1E1F22] to-[#26282c] rounded-xl p-5 border border-white/10 transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 hover:scale-[1.02] ${className}`}>
      <div className="flex flex-col h-full">
        {/* Top Row: Value and Icon */}
        <div className="flex justify-between items-start">
          <p className="text-4xl font-bold text-white">{value}</p>
          <div className={`${iconBgColor} p-2.5 rounded-lg`}>
            {icon || (
              <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
          </div>
        </div>
        
        {/* Bottom Row: Title and Percentage */}
        <div className="flex justify-between items-end mt-3">
          <p className="text-gray-400 text-sm font-bold">{title}</p>
          <div className="flex flex-col items-end">
            <span className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{percentage}%
            </span>
            <span className="text-[11px] text-gray-500">{comparisonLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StatCard
