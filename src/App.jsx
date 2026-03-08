import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/AppRoutes'
import { SettingsProvider } from './context/SettingsContext'

function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AppRoutes />
      </SettingsProvider>
    </BrowserRouter>
  )
}

export default App