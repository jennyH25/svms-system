import React from 'react'
import { Check, X } from 'lucide-react'
import { validatePassword, PASSWORD_REQUIREMENT_LABELS } from '../../lib/passwordValidator'

/**
 * PasswordRequirements - Component that shows password requirements with real-time validation
 * 
 * @param {string} password - The password to validate against requirements
 * @param {boolean} showRequirements - Whether to show the requirements (typically shown on focus)
 */
const PasswordRequirements = ({ password = '', showRequirements = false }) => {
  const validation = validatePassword(password)

  if (!showRequirements) {
    return null
  }

  const requirements = [
    { key: 'minLength', label: PASSWORD_REQUIREMENT_LABELS.minLength },
    { key: 'hasUppercase', label: PASSWORD_REQUIREMENT_LABELS.hasUppercase },
    { key: 'hasLowercase', label: PASSWORD_REQUIREMENT_LABELS.hasLowercase },
    { key: 'hasNumber', label: PASSWORD_REQUIREMENT_LABELS.hasNumber },
    { key: 'hasSpecial', label: PASSWORD_REQUIREMENT_LABELS.hasSpecial },
  ]

  return (
    <div className="mt-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
      <p className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">Password Requirements:</p>
      <div className="space-y-2">
        {requirements.map((req) => {
          const isMet = validation[req.key]
          return (
            <div key={req.key} className="flex items-center gap-2">
              {isMet ? (
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span className={`text-sm ${isMet ? 'text-green-400' : 'text-gray-400'}`}>
                {req.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PasswordRequirements
