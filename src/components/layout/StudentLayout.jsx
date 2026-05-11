import React from 'react';
import { NavLink } from 'react-router-dom';
import Sidebar, { studentMenuItems } from './StudentSidebar';
import Navbar from './Navbar';
import { Outlet } from 'react-router-dom';
import Modal, { ModalFooter } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

const SUPER_ADMIN_TRUSTED_DEVICE_KEY = "svms_super_admin_trusted_device";

const StudentLayout = () => {
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);

  const openLogoutModal = () => setIsLogoutModalOpen(true);
  const closeLogoutModal = () => setIsLogoutModalOpen(false);

  const confirmLogout = () => {
    const trustedDeviceToken = localStorage.getItem(
      SUPER_ADMIN_TRUSTED_DEVICE_KEY,
    );
    localStorage.clear();
    if (trustedDeviceToken) {
      localStorage.setItem(
        SUPER_ADMIN_TRUSTED_DEVICE_KEY,
        trustedDeviceToken,
      );
    }
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen bg-[#0d0d0d] font-inter">
      <Sidebar onRequestLogout={openLogoutModal} />
      <div className="flex-1 flex flex-col">
        <Navbar onRequestLogout={openLogoutModal} />
        <main className="flex-1 px-4 py-4 pb-[7.5rem] sm:px-5 sm:py-5 sm:pb-[7.5rem] lg:p-6 bg-gradient-to-br from-[#0B0D10]/50 to-[#0d0d0d]/80">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#131518]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-4 gap-2">
          {studentMenuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                {...(item.path === "/student" ? { end: true } : {})}
                className={({ isActive }) =>
                  `flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-[11px] font-medium transition-colors ${
                    isActive
                      ? "bg-white/12 text-white"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <span className="flex items-center justify-center">{item.icon}</span>
                <span className="leading-tight">{item.shortLabel || item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Modal
        isOpen={isLogoutModalOpen}
        onClose={closeLogoutModal}
        title="Confirm Logout"
        size="sm"
        showCloseButton
      >
        <p className="text-sm text-gray-200">Are you sure you want to log out?</p>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={closeLogoutModal}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={confirmLogout}>
            Logout
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default StudentLayout;
