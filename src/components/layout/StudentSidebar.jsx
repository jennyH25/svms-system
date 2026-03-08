import React from "react";
import { NavLink } from "react-router-dom";
import logo from "../../assets/css_logo.png";
import { useSettings } from "../../context/SettingsContext";

const StudentSidebar = () => {
  const { settings } = useSettings();
  
  // Parse the display name to show first two words in bold
  const displayName = settings?.displayName || "Student Violation Management System";
  const nameParts = displayName.split(" ").filter(Boolean);
  const firstTwoWords = nameParts.slice(0, 2).join(" ") || "";
  const secondLine = nameParts[2] || "";
  const thirdLine = nameParts[3] || "";

  const menuItems = [
    {
      path: "/student",
      label: "Dashboard",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      )
    },
    {
      path: "/student/violations",
      label: "Violations",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      path: "/student/offenses",
      label: "List of Offenses",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      path: "/student/notifications",
      label: "Notification",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="w-60 h-screen sticky top-0 bg-gradient-to-b from-[#1A1C1F] to-[#232528] text-white p-6 font-inter">
      
      {/* Logo */}
      <div className="mb-12">
        <img
          src={settings?.logoPath || logo}
          alt="System Logo"
          className="h-[8.5rem] mt-4 mb-4 object-contain"
        />
        <h1 className="text-xl font-extrabold leading-tight">
          {firstTwoWords}
        </h1>
        {secondLine && <p className="text-white">{secondLine}</p>}
        {thirdLine && <p className="text-white">{thirdLine}</p>}
      </div>

      {/* Navigation */}
      <nav>
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                {...(item.path === "/student" ? { end: true } : {})}
                className={({ isActive }) =>
                  `flex items-center gap-3 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-white/15 to-transparent text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default StudentSidebar;