import React, { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext()

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    displayName: 'Student Violation Management System',
    logoPath: null,
    theme: 'dark',
    themeColor: '#000000',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch settings from server
  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/settings')
      const data = await response.json()

      if (data.status === 'ok' && data.settings) {
        setSettings({
          displayName: data.settings.displayName,
          logoPath: data.settings.logoPath,
          theme: data.settings.theme,
          themeColor: data.settings.themeColor,
        })
      } else {
        // Use default settings if fetch fails
        setSettings({
          displayName: 'Student Violation Management System',
          logoPath: null,
          theme: 'dark',
          themeColor: '#000000',
        })
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
      setError(err.message)
      // Keep default settings on error
      setSettings({
        displayName: 'Student Violation Management System',
        logoPath: null,
        theme: 'dark',
        themeColor: '#000000',
      })
    } finally {
      setLoading(false)
    }
  }

  // Update display name and theme
  const updateSettings = async (displayName, theme, themeColor) => {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          theme,
          themeColor,
        }),
      })

      const data = await response.json()

      if (data.status === 'ok' && data.settings) {
        setSettings({
          displayName: data.settings.displayName,
          logoPath: data.settings.logoPath,
          theme: data.settings.theme,
          themeColor: data.settings.themeColor,
        })
        return { success: true, settings: data.settings }
      } else {
        return { success: false, error: data.message }
      }
    } catch (err) {
      console.error('Error updating settings:', err)
      return { success: false, error: err.message }
    }
  }

  // Upload logo
  const uploadLogo = async (file) => {
    try {
      const formData = new FormData()
      formData.append('logo', file)

      const response = await fetch('/api/settings/logo', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.status === 'ok' && data.settings) {
        setSettings({
          displayName: data.settings.displayName,
          logoPath: data.settings.logoPath,
          theme: data.settings.theme,
          themeColor: data.settings.themeColor,
        })
        return { success: true, settings: data.settings, message: data.message }
      } else {
        return { success: false, error: data.message }
      }
    } catch (err) {
      console.error('Error uploading logo:', err)
      return { success: false, error: err.message }
    }
  }

  // Remove logo
  const removeLogo = async () => {
    try {
      const response = await fetch('/api/settings/logo', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.status === 'ok' && data.settings) {
        setSettings({
          displayName: data.settings.displayName,
          logoPath: data.settings.logoPath,
          theme: data.settings.theme,
          themeColor: data.settings.themeColor,
        })
        return { success: true, settings: data.settings, message: data.message }
      } else {
        return { success: false, error: data.message }
      }
    } catch (err) {
      console.error('Error removing logo:', err)
      return { success: false, error: err.message }
    }
  }

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings()
  }, [])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'light') {
      root.style.colorScheme = 'light'
      document.body.classList.remove('dark')
      document.body.classList.add('light')
    } else if (settings.theme === 'custom' && settings.themeColor) {
      root.style.colorScheme = 'dark'
      document.body.style.setProperty('--primary-color', settings.themeColor)
      document.body.classList.remove('light')
      document.body.classList.add('dark')
    } else {
      root.style.colorScheme = 'dark'
      document.body.classList.remove('light')
      document.body.classList.add('dark')
    }
  }, [settings.theme, settings.themeColor])

  const value = {
    settings,
    loading,
    error,
    fetchSettings,
    updateSettings,
    uploadLogo,
    removeLogo,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export default SettingsContext
