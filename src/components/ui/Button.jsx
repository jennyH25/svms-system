import React from 'react'
import { cn } from '@/lib/utils'

const Button = React.forwardRef(({ 
  children, 
  variant = 'primary', 
  size = 'default',
  onClick, 
  className = '', 
  ...props 
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50'
  
  const variants = {
    primary: 'bg-white text-[#1a1a1a] hover:bg-gray-200',
    secondary: 'bg-[#1E1F22] text-white hover:bg-[#2a2a2a] border border-white/10',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    outline: 'border border-white/10 bg-transparent text-white hover:bg-white/10',
    ghost: 'bg-transparent text-gray-400 hover:bg-white/10 hover:text-white',
    link: 'text-gray-400 underline-offset-4 hover:underline hover:text-white',
  }

  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-lg px-3 text-sm',
    lg: 'h-11 rounded-lg px-8',
    icon: 'h-10 w-10',
  }

  return (
    <button
      ref={ref}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  )
})

Button.displayName = 'Button'

export { Button }
export default Button
