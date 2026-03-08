import React, { useState, useEffect, useRef } from 'react'
import AnimatedContent from '../../components/ui/AnimatedContent'
import Button from '../../components/ui/Button'
import { useSettings } from '../../context/SettingsContext'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu'

const Settings = () => {
  const { settings, uploadLogo, removeLogo, updateSettings } = useSettings()
  const [displayName, setDisplayName] = useState('')
  const [theme, setTheme] = useState('dark')
  const [customColor, setCustomColor] = useState('#000000')
  const [logo, setLogo] = useState(null)
  const [uploadedLogoFile, setUploadedLogoFile] = useState(null)
  const [logoToRemove, setLogoToRemove] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const logoInputRef = useRef(null)

  // Apply theme immediately when local state changes
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.style.colorScheme = 'light'
      document.body.classList.remove('dark')
      document.body.classList.add('light')
    } else if (theme === 'custom' && customColor) {
      root.style.colorScheme = 'dark'
      document.body.style.setProperty('--primary-color', customColor)
      document.body.classList.remove('light')
      document.body.classList.add('dark')
    } else {
      root.style.colorScheme = 'dark'
      document.body.classList.remove('light')
      document.body.classList.add('dark')
    }
  }, [theme, customColor])

  // populate local form state whenever settings change (including on
  // initial fetch). keeps the logo preview and name field in sync.
  useEffect(() => {
    if (settings) {
      setDisplayName(settings.displayName || '')
      setTheme(settings.theme || 'dark')
      setCustomColor(settings.themeColor || '#000000')
      setLogo(settings.logoPath || null)
      setUploadedLogoFile(null)
      setLogoToRemove(false)
    }
  }, [settings])

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (must be image)
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      setSuccess('')
      setTimeout(() => setError(''), 5000)
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit')
      setSuccess('')
      setTimeout(() => setError(''), 5000)
      return
    }

    // Set the file locally for preview, will upload on save
    setUploadedLogoFile(file)
    setLogo(URL.createObjectURL(file)) // Preview the uploaded file
    setLogoToRemove(false) // Cancel any pending removal
    setSuccess('Logo selected. Click "Save Changes" to apply.')
    setError('')
    setTimeout(() => setSuccess(''), 5000)

    // Reset input
    if (logoInputRef.current) {
      logoInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setLogo(null)
    setUploadedLogoFile(null)
    setLogoToRemove(true)
    setSuccess('Logo removal pending. Click "Save Changes" to apply.')
    setError('')
    setTimeout(() => setSuccess(''), 5000)
  }

  const handleSaveChanges = async () => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty')
      setSuccess('')
      setTimeout(() => setError(''), 5000)
      return
    }

    setLoading(true)

    try {
      // Handle logo removal first
      if (logoToRemove) {
        const removeResult = await removeLogo()
        if (!removeResult.success) {
          setError(removeResult.error || 'Failed to remove logo')
          setSuccess('')
          setTimeout(() => setError(''), 5000)
          setLoading(false)
          return
        }
      }

      // Handle logo upload
      if (uploadedLogoFile) {
        const uploadResult = await uploadLogo(uploadedLogoFile)
        if (!uploadResult.success) {
          setError(uploadResult.error || 'Failed to upload logo')
          setSuccess('')
          setTimeout(() => setError(''), 5000)
          setLoading(false)
          return
        }
      }

      // Update other settings
      const result = await updateSettings(displayName, theme, customColor)

      if (result.success) {
        setSuccess('Settings saved successfully!')
        setError('')
        setTimeout(() => setSuccess(''), 5000)
        // Reset local changes
        setUploadedLogoFile(null)
        setLogoToRemove(false)
      } else {
        setError(result.error || 'Failed to save settings')
        setSuccess('')
        setTimeout(() => setError(''), 5000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setSuccess('')
      setTimeout(() => setError(''), 5000)
    }

    setLoading(false)
  }

  return (
    <div className="text-white">
      <AnimatedContent>
        <h2 className="text-xl font-bold mb-6 tracking-wide">SYSTEM SETTINGS</h2>
      </AnimatedContent>
      <AnimatedContent delay={0.1}>
        <div className="bg-[#23262B] rounded-xl p-8 ml-8">
          {/* Error and Success Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-200">
              {success}
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-2">Change Logo</h3>
            <p className="text-gray-400 text-base mb-6">
              Customize the system's logo, display name and color theme.
            </p>
            <div className="flex items-center gap-8 mb-6">
              <div className="w-28 h-28 rounded-full bg-[#1a1a1a] flex items-center justify-center overflow-hidden">
                {logo ? (
                  <img
                    src={logo}
                    alt="Logo"
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <img
                    src="/avatar-placeholder.png"
                    alt="Avatar"
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
              </div>
              <div className="flex gap-3">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white text-[#23262B] hover:bg-gray-200 border-0 px-8"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Upload'}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  className="bg-red-600 text-white border-0 px-8"
                  onClick={handleRemoveLogo}
                  disabled={loading || !logo}
                >
                  {loading ? 'Processing...' : 'Remove'}
                </Button>
              </div>
            </div>
            <div className="border-t border-white/10 my-8" />
            <div className="grid grid-cols-2 gap-10 items-end">
              <div>
                <label className="block text-base font-medium mb-3">
                  System Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:ring-1 focus:ring-gray-600"
                  placeholder="This name will appear on the dashboard header."
                />
              </div>
              <div>
                <label className="block text-base font-medium mb-3">
                  System Color Theme
                </label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full flex justify-between bg-[#1a1a1a] border border-white/10 px-4 py-3"
                    >
                      {theme === 'light' ? 'Light Mode' : theme === 'dark' ? 'Dark Mode' : 'Custom'}
                      <svg
                        className="ml-2 w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setTheme('light')}>
                      Light Mode
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('dark')}>
                      Dark Mode
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('custom')}>
                      Custom
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Custom color picker */}
            {theme === 'custom' && (
              <div className="mt-6">
                <label className="block text-base font-medium mb-3">
                  Choose Custom Color
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={customColor}
                    onChange={e => setCustomColor(e.target.value)}
                    className="w-16 h-16 cursor-pointer rounded-lg"
                  />
                  <span className="text-gray-400">{customColor}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <Button
            variant="secondary"
            size="lg"
            className="bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0 px-12"
            onClick={handleSaveChanges}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </AnimatedContent>
    </div>
  )
}

export default Settings
