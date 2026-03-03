import React, { forwardRef } from 'react'

const inputStyles = {
  backgroundColor: 'rgba(45, 47, 52, 0.8)',
}

const GlassInput = forwardRef(({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  className = '',
  labelClassName = '',
  endIcon,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className={`block text-gray-400 text-[13px] tracking-wider mb-2 ${labelClassName}`}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={inputStyles}
          className={`w-full backdrop-blur-md border border-white/5 rounded-xl px-4 py-3 text-[15px] text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition-all autofill:bg-transparent autofill:shadow-[inset_0_0_0px_1000px_rgba(45,47,52,0.8)] ${endIcon ? 'pr-12' : ''} ${className}`}
          {...props}
        />
        {endIcon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {endIcon}
          </div>
        )}
      </div>
    </div>
  )
})

GlassInput.displayName = 'GlassInput'

export default GlassInput
