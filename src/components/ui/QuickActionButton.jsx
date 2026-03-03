import React from 'react'

const QuickActionButton = ({ icon, label, onClick, className = '' }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-5 py-3 bg-white/20 border border-white/10 rounded-lg text-white text-sm font-medium hover:bg-white/15 hover:border-white/20 hover:scale-105 hover:shadow-lg hover:shadow-white/5 transition-all duration-300 ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// Pre-built quick action buttons
export const AddViolationButton = ({ onClick, className }) => (
  <QuickActionButton
    onClick={onClick}
    className={className}
    label="Add Violation"
    icon={
      <svg className="w-10 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    }
  />
)

export const ViewStudentsButton = ({ onClick, className }) => (
  <QuickActionButton
    onClick={onClick}
    className={className}
    label="View Students"
    icon={
      <svg className="w-10 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    }
  />
)

export default QuickActionButton
