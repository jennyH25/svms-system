import React from 'react'

/**
 * TableTabs - Reusable tab component for table filtering
 * 
 * @param {Array} tabs - Array of tab objects { key, label, disabled? }
 * @param {string} activeTab - Currently active tab key
 * @param {Function} onTabChange - Callback when tab is changed
 * @param {string} className - Additional classes for the container
 */
const TableTabs = ({ 
  tabs = [], 
  activeTab, 
  onTabChange,
  renderTabAction,
  className = '' 
}) => {
  return (
    <div className={`flex ${className}`}>
      {tabs.map((tab, index) => (
        <div key={tab.key} className="relative inline-flex">
          <button
            type="button"
            onClick={() => {
              if (!tab.disabled) {
                onTabChange?.(tab.key);
              }
            }}
            disabled={Boolean(tab.disabled)}
            className={`px-8 py-2.5 text-sm font-medium transition-colors ${
              index === 0 ? 'rounded-l-lg' : ''
            } ${index === tabs.length - 1 ? 'rounded-r-lg' : ''} ${
              tab.disabled
                ? 'bg-[#2D2F33] text-gray-600 cursor-not-allowed opacity-60'
                : activeTab === tab.key 
                ? 'bg-[#1E1F22] text-white' 
                : 'bg-[#2D2F33] text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
          {renderTabAction ? renderTabAction(tab, activeTab === tab.key) : null}
        </div>
      ))}
    </div>
  )
}

export default TableTabs
