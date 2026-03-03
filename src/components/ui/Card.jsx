import React from 'react'

const Card = ({ 
  children, 
  title, 
  className = '',
  variant = 'default',  // default, outlined, transparent, glass
  padding = 'md',       // sm, md, lg, none
  rounded = 'xl',       // sm, md, lg, xl, 2xl
  hover = false,        // adds hover effect
  onClick,
}) => {
  // Variant styles
  const variants = {
    default: 'bg-[#1a1a1a]',
    outlined: 'bg-[#1a1a1a] border border-white/10',
    transparent: 'bg-transparent',
    dark: 'bg-[#0d0d0d]',
    gradient: 'bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a]',
    glass: 'bg-white/5 backdrop-blur-md border border-white/10',
    'glass-dark': 'bg-black/20 backdrop-blur-md border border-white/10',
  }

  // Padding sizes
  const paddings = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  // Border radius
  const roundedSizes = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
  }

  // Hover effect
  const hoverEffect = hover 
    ? variant.includes('glass') 
      ? 'hover:bg-white/10 hover:scale-[1.02] hover:shadow-lg hover:shadow-white/5 hover:border-white/20 transition-all duration-300 cursor-pointer' 
      : 'hover:bg-[#2a2a2a] hover:scale-[1.02] hover:shadow-lg transition-all duration-300 cursor-pointer' 
    : 'transition-all duration-300 hover:shadow-lg hover:shadow-white/5'

  return (
    <div 
      className={`
        ${variants[variant]} 
        ${paddings[padding]} 
        ${roundedSizes[rounded]}
        ${hoverEffect}
        ${className}
      `}
      onClick={onClick}
    >
      {title && <h3 className="text-card-title mb-4">{title}</h3>}
      {children}
    </div>
  )
}

export default Card
