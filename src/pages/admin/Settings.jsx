import React, { useState } from 'react'
import AnimatedContent from '../../components/ui/AnimatedContent'
import Button from '../../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu'

const Settings = () => {
  const [theme, setTheme] = useState('dark')
  const [displayName, setDisplayName] = useState('')
  const [logo, setLogo] = useState('/system-logo.jpg')

  return (
    <div className="text-white">
      <AnimatedContent>
        <h2 className="text-xl font-bold mb-6 tracking-wide">SYSTEM SETTINGS</h2>
      </AnimatedContent>
      <AnimatedContent delay={0.1}>
        <div className="bg-[#23262B] rounded-xl p-8 ml-8">
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-2">Change Logo</h3>
            <p className="text-gray-400 text-base mb-6">Customize the system's logo, display name and color theme.</p>
            <div className="flex items-center gap-8 mb-6">
              <div className="w-28 h-28 rounded-full bg-[#1a1a1a] flex items-center justify-center overflow-hidden">
                {logo ? (
                  <img src={logo} alt="Logo" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <img src="/avatar-placeholder.png" alt="Avatar" className="w-full h-full object-cover rounded-full" />
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" size="lg" className="bg-white text-[#23262B] hover:bg-gray-200 border-0 px-8">
                  Upload
                </Button>
                <Button variant="danger" size="lg" className="bg-red-600 text-white border-0 px-8">
                  Remove
                </Button>
              </div>
            </div>
            <div className="border-t border-white/10 my-8" />
            <div className="grid grid-cols-2 gap-10 items-end">
              <div>
                <label className="block text-base font-medium mb-3">System Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:ring-1 focus:ring-gray-600"
                  placeholder="This name will appear on the dashboard header."
                />
              </div>
              <div>
                <label className="block text-base font-medium mb-3">System Color Theme</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="lg" className="w-full flex justify-between bg-[#1a1a1a] border border-white/10 px-4 py-3">
                      {theme === 'light' ? 'Light Mode' : theme === 'dark' ? 'Dark Mode' : 'Custom'}
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setTheme('light')}>Light Mode</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('dark')}>Dark Mode</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('custom')}>Custom</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <Button variant="secondary" size="lg" className="bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0 px-12">
            Save Changes
          </Button>
        </div>
      </AnimatedContent>
    </div>
  )
}

export default Settings
