import React from 'react'

const Violations = () => {
  return (
    <div className="text-white">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold tracking-wide">VIOLATIONS</h2>
        <button className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Record Violation
        </button>
      </div>
      <div className="bg-[#1a1a1a] rounded-xl p-6">
        <p className="text-gray-400">Violation records will be displayed here.</p>
      </div>
    </div>
  )
}

export default Violations
