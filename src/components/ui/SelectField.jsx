import React from 'react'
import { ChevronDown } from 'lucide-react'

const SelectField = ({
  label,
  className = '',
  selectClassName = '',
  wrapperClassName = '',
  children,
  ...props
}) => {
  return (
    <div className={wrapperClassName || 'w-full'}>
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          {...props}
          className={`w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-gradient-to-b from-[rgba(56,62,72,0.95)] to-[rgba(37,41,48,0.95)] px-4 py-3 pr-11 text-[15px] text-white shadow-inner shadow-black/20 focus:outline-none focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${className} ${selectClassName}`.trim()}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" size={16} />
      </div>
    </div>
  )
}

export default SelectField
