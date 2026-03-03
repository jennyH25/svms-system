import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Modal, { ModalFooter, ModalDivider } from '../ui/Modal'
import GlassInput from '../ui/GlassInput'
import Button from '../ui/button'

/**
 * EditProfileModal - Modal for editing user profile
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {Object} initialData - Initial user data { fullName, idNumber, email }
 * @param {Function} onSave - Callback when save is clicked with form data
 */
const EditProfileModal = ({ 
  isOpen, 
  onClose, 
  initialData = {},
  onSave 
}) => {
  const [formData, setFormData] = useState({
    fullName: initialData.fullName || '',
    idNumber: initialData.idNumber || '',
    email: initialData.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [showPassword, setShowPassword] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  })

  const togglePasswordVisibility = (field) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave?.(formData)
  }

  const handleCancel = () => {
    setFormData({
      fullName: initialData.fullName || '',
      idNumber: initialData.idNumber || '',
      email: initialData.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    onClose?.()
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Edit User Profile"
      size="md"
      showCloseButton={false}
    >
      <form onSubmit={handleSubmit}>
        {/* Name and ID Row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Full Name</label>
            <GlassInput
              value={formData.fullName}
              onChange={handleChange('fullName')}
              placeholder="Enter full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">ID Number</label>
            <GlassInput
              value={formData.idNumber}
              onChange={handleChange('idNumber')}
              placeholder="Enter ID number"
            />
          </div>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">Email</label>
          <GlassInput
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            placeholder="Enter email address"
          />
        </div>

        {/* Divider */}
        <ModalDivider />

        {/* Change Password Section */}
        <p className="text-sm text-gray-400 mb-4">Change Password</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Current Password</label>
            <div className="relative">
              <GlassInput
                type={showPassword.currentPassword ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={handleChange('currentPassword')}
                placeholder="Enter current password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('currentPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword.currentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">New Password</label>
            <div className="relative">
              <GlassInput
                type={showPassword.newPassword ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={handleChange('newPassword')}
                placeholder="Enter new password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('newPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword.newPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Confirm Password</label>
            <div className="relative">
              <GlassInput
                type={showPassword.confirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleChange('confirmPassword')}
                placeholder="Confirm new password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('confirmPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword.confirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-lg bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="px-6 py-2.5 rounded-lg bg-[#4A5568] text-white hover:bg-[#3d4654]"
          >
            Save Changes
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default EditProfileModal
