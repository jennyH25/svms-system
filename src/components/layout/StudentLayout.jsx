import React from 'react';
import Sidebar from './StudentSidebar';
import Navbar from './Navbar';
import { Outlet } from 'react-router-dom';

const StudentLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#0d0d0d] font-inter">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar />
        <main className="flex-1 p-6 bg-gradient-to-br from-[#0B0D10]/50 to-[#0d0d0d]/80">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default StudentLayout;
