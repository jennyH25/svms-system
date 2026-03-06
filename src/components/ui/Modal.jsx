import React, { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * Modal - Reusable modal component with dark glassmorphism styling
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {string} title - Modal title
 * @param {React.ReactNode} children - Modal content
 * @param {string} size - Modal size: 'sm' | 'md' | 'lg' | 'xl'
 * @param {boolean} showCloseButton - Whether to show the X close button
 * @param {string} className - Additional classes for the modal content
 */
const Modal = ({ 
  isOpen, 
  onClose, 
  title,
  children, 
  size = 'md',
  showCloseButton = true,
  className = '' 
}) => {
  // Animation state
  const [visible, setVisible] = React.useState(false);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      // Delay unmount for animation
      const timeout = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  if (!isOpen && !visible) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/50 backdrop-blur-md transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {/* Modal Content */}
      <div
        className={`relative w-full ${sizes[size]} mx-4 bg-gradient-to-br from-[#2a2d35]/80 to-[#1a1c20]/80 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-inset ring-white/10 ${className} transform transition-transform duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'} overflow-hidden scrollbar-hide`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            {title && (
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            )}
            {showCloseButton && (
              <button 
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-auto"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {/* Body */}
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>
    </div>
  )
}

// Modal Footer for action buttons
export const ModalFooter = ({ children, className = '' }) => (
  <div className={`flex items-center justify-end gap-3 pt-6 ${className}`}>
    {children}
  </div>
)

// Modal Section Divider
export const ModalDivider = ({ label, className = '' }) => (
  <div className={`py-4 ${className}`}>
    <div className="w-full border-t border-white/10" />
    {label && <span className="text-sm text-gray-400 block mt-2">{label}</span>}
  </div>
)

export default Modal
