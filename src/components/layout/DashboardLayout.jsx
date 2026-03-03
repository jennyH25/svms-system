import React from 'react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

const DashboardLayout = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-[#0d0d0d] font-inter">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 p-6 bg-gradient-to-br from-[#0B0D10]/50 to-[#0d0d0d]/80">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
