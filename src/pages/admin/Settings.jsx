import React, { useState, useEffect, useRef } from 'react'
import AnimatedContent from '../../components/ui/AnimatedContent'
import Button from '../../components/ui/Button'
import { useSettings } from '../../context/SettingsContext'
import defaultLogo from '../../assets/css_logo.png'

const MAX_LOGO_DIMENSION = 320
const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024
const MAX_INLINE_LOGO_FILE_SIZE = 450 * 1024
const DOT_DELAYS = ['0ms', '160ms', '320ms']

const LoadingDots = () => (
  <span className="inline-flex items-end">
    {DOT_DELAYS.map(delay => (
      <span
        key={delay}
        className="mx-[1px] inline-block h-1.5 w-1.5 rounded-full bg-current opacity-25 animate-pulse"
        style={{ animationDelay: delay, animationDuration: '1s' }}
      />
    ))}
  </span>
)

const LoadingText = ({ label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span>{label}</span>
    <LoadingDots />
  </span>
)

const Spinner = () => (
  <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
)

const loadImageFromFile = file =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to read the selected image.'))
    }
    image.src = objectUrl
  })

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Unable to optimize the selected image.'))
      }
    }, type, quality)
  })

const optimizeLogoFile = async file => {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed.')
  }

  const image = await loadImageFromFile(file)
  const largestSide = Math.max(image.width, image.height)
  const shouldResize =
    largestSide > MAX_LOGO_DIMENSION || file.size > MAX_INLINE_LOGO_FILE_SIZE
  const scale = shouldResize
    ? Math.min(1, MAX_LOGO_DIMENSION / largestSide)
    : 1
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    return file
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const optimizedBlob = await canvasToBlob(canvas, 'image/png')

  if (
    file.type === 'image/png' &&
    optimizedBlob.size >= file.size &&
    !shouldResize
  ) {
    return file
  }

  const optimizedBaseName = (file.name || 'logo').replace(/\.[^.]+$/, '')
  return new File([optimizedBlob], `${optimizedBaseName}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  })
}

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
  const [isPreparingLogo, setIsPreparingLogo] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const logoInputRef = useRef(null)
  const previewUrlRef = useRef(null)

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

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const clearPreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  const showTemporaryMessage = (setter, value) => {
    setter(value)
    window.setTimeout(() => setter(''), 5000)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (must be image)
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      setSuccess('')
      window.setTimeout(() => setError(''), 5000)
      return
    }

    // Validate file size (5MB max)
    if (file.size > MAX_LOGO_FILE_SIZE) {
      setError('File size exceeds 5MB limit')
      setSuccess('')
      window.setTimeout(() => setError(''), 5000)
      return
    }

    try {
      setIsPreparingLogo(true)
      setError('')
      setSuccess('')

      const optimizedFile = await optimizeLogoFile(file)
      clearPreviewUrl()
      const previewUrl = URL.createObjectURL(optimizedFile)

      previewUrlRef.current = previewUrl
      setUploadedLogoFile(optimizedFile)
      setLogo(previewUrl)
      setLogoToRemove(false)
      showTemporaryMessage(setSuccess, 'Logo selected. Click "Save Changes" to apply.')
    } catch (err) {
      setError(err.message || 'Unable to prepare the selected logo.')
      setSuccess('')
      window.setTimeout(() => setError(''), 5000)
    } finally {
      setIsPreparingLogo(false)
      if (logoInputRef.current) {
        logoInputRef.current.value = ''
      }
    }
  }

  const handleRemoveLogo = () => {
    clearPreviewUrl()
    setLogo(null)
    setUploadedLogoFile(null)
    setLogoToRemove(true)
    showTemporaryMessage(setSuccess, 'Logo removal pending. Click "Save Changes" to apply.')
    setError('')
  }

  const handleSaveChanges = async () => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty')
      setSuccess('')
      window.setTimeout(() => setError(''), 5000)
      return
    }

    const hasSettingsChanges =
      displayName.trim() !== (settings?.displayName || '').trim() ||
      theme !== (settings?.theme || 'dark') ||
      customColor !== (settings?.themeColor || '#000000')

    if (!uploadedLogoFile && !logoToRemove && !hasSettingsChanges) {
      showTemporaryMessage(setSuccess, 'No changes to save.')
      return
    }

    setIsSaving(true)

    try {
      // Handle logo removal first
      if (logoToRemove) {
        const removeResult = await removeLogo()
        if (!removeResult.success) {
          setError(removeResult.error || 'Failed to remove logo')
          setSuccess('')
          window.setTimeout(() => setError(''), 5000)
          return
        }
      }

      // Handle logo upload
      if (uploadedLogoFile) {
        const uploadResult = await uploadLogo(uploadedLogoFile)
        if (!uploadResult.success) {
          setError(uploadResult.error || 'Failed to upload logo')
          setSuccess('')
          window.setTimeout(() => setError(''), 5000)
          return
        }
      }

      // Update other settings
      const result = hasSettingsChanges
        ? await updateSettings(displayName.trim(), theme, customColor)
        : { success: true }

      if (result.success) {
        clearPreviewUrl()
        showTemporaryMessage(setSuccess, 'Settings saved successfully!')
        setError('')
        setUploadedLogoFile(null)
        setLogoToRemove(false)
      } else {
        setError(result.error || 'Failed to save settings')
        setSuccess('')
        window.setTimeout(() => setError(''), 5000)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setSuccess('')
      window.setTimeout(() => setError(''), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  const isUploadBusy = isPreparingLogo
  const isRemoveBusy = false
  const isSaveBusy = isSaving
  const uploadButtonLabel =
    isUploadBusy ? <LoadingText label="Loading" /> : 'Upload'
  const removeButtonLabel =
    isRemoveBusy ? <LoadingText label="Loading" /> : 'Remove'

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
              Customize the system's logo and display name.
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
                    src={settings?.logoPath || defaultLogo}
                    alt="System Logo"
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
                  disabled={isPreparingLogo || isSaving}
                >
                  {uploadButtonLabel}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  className="bg-red-600 text-white border-0 px-8"
                  onClick={handleRemoveLogo}
                  disabled={isPreparingLogo || isSaving || !logo}
                >
                  {removeButtonLabel}
                </Button>
              </div>
            </div>
            <div className="border-t border-white/10 my-8" />
            <div className="grid grid-cols-1 gap-10 items-end">
              <div className="max-w-xl">
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
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <Button
            variant="secondary"
            size="lg"
            className="min-w-[148px] bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0 px-12"
            onClick={handleSaveChanges}
            disabled={isPreparingLogo || isSaving}
          >
            {isSaveBusy ? (
              <>
                <Spinner />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </AnimatedContent>
    </div>
  )
}

export default Settings
