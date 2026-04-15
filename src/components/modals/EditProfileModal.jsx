import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import Modal, { ModalFooter, ModalDivider } from '../ui/Modal'
import GlassInput from '../ui/GlassInput'
import Button from '../ui/Button'

/**
 * EditProfileModal - Modal for editing user profile
 * 
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {Object} initialData - Initial user data { username, schoolId, firstName, lastName, email }
 * @param {Function} onSave - Callback when save is clicked with form data
 */
const EditProfileModal = ({ 
  isOpen, 
  onClose, 
  initialData = {},
  onSave,
  isSaving = false,
  showSuccessModal = false,
  onCloseSuccessModal,
}) => {
  const buildInitialFormData = () => ({
    username: initialData.username || '',
    schoolId: initialData.schoolId || '',
    firstName: initialData.firstName || '',
    lastName: initialData.lastName || '',
    email: initialData.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [formData, setFormData] = useState({
    ...buildInitialFormData(),
  })

  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialFormData())
    }
  }, [isOpen, initialData.username, initialData.schoolId, initialData.firstName, initialData.lastName, initialData.email])

  const isStudent = initialData.role === 'student'

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    await onSave?.(formData)
  }

  const handleCancel = () => {
    setFormData(buildInitialFormData())
    onClose?.()
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={<span className="font-black font-inter">Edit User Profile</span>}
      size="md"
      showCloseButton={false}
    >
      <form onSubmit={handleSubmit}>
        {/* Full Name */}
        <div className="mb-4">
          <p className="text-sm font-semibold text-white mb-2">Full Name</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">First Name</label>
              <GlassInput
                value={formData.firstName}
                onChange={handleChange('firstName')}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Last Name</label>
              <GlassInput
                value={formData.lastName}
                onChange={handleChange('lastName')}
                placeholder="Enter last name"
              />
            </div>
          </div>
        </div>

        {/* Username and School ID (student only) */}
        <div className="mb-4">
          <div className={isStudent ? 'grid grid-cols-2 gap-4' : ''}>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Username</label>
              <GlassInput
                value={formData.username}
                onChange={handleChange('username')}
                placeholder="Enter username"
              />
            </div>

            {isStudent && (
              <div>
                <label className="block text-sm font-medium text-white mb-2">School ID</label>
                <GlassInput
                  value={formData.schoolId}
                  onChange={handleChange('schoolId')}
                  placeholder="Enter school ID"
                />
              </div>
            )}
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
            disabled={isSaving}
            className="px-6 py-2.5 rounded-lg bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-lg bg-[#4A5568] text-white hover:bg-[#3d4654]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </ModalFooter>
      </form>

      <Modal
        isOpen={showSuccessModal}
        onClose={onCloseSuccessModal}
        title={
          <span className="font-black font-inter flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Profile Saved
          </span>
        }
        size="sm"
        showCloseButton
      >
        <div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-green-300">
            Your profile changes were saved successfully.
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={onCloseSuccessModal}
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </Modal>
  )
}

export default EditProfileModal
