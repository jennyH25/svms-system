import React from 'react'
    
const SearchBar = ({ placeholder = "Search", className = "" }) => {
  return (
    <div className={`relative ${className}`}>
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white "
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={placeholder}
            className="bg-[#1a1a1a] text-white placeholder-white pl-11 pr-6 py-2.5 rounded-xl w-full text-sm focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
        </div>
  )
}

export default SearchBar