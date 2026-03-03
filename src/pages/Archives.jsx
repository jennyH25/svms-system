import React, { useState } from 'react'
import AnimatedContent from '../components/ui/AnimatedContent'
import SearchBar from '../components/ui/SearchBar'
import Button from '../components/ui/Button'
import DataTable from '../components/ui/DataTable'
import TableTabs from '../components/ui/TableTabs'
import { Folder } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui/dropdown-menu'
import { Filter, Download } from 'lucide-react'

const folderList = [
  { key: 'users', label: 'USERS' },
  { key: '2024-2025', label: 'S.Y. 2024-2025' },
  { key: '2023-2024', label: 'S.Y. 2023-2024' },
  { key: '2022-2023', label: 'S.Y. 2022-2023' },
  { key: '2021-2022', label: 'S.Y. 2021-2022' },
  { key: '2020-2021', label: 'S.Y. 2020-2021' },
]

const tabs = [
  { key: 'users', label: 'Users' },
]

const columns = [
  { key: 'no', label: 'No', width: 'w-10' },
  { key: 'date', label: 'Date' },
  { key: 'studentName', label: 'Student Name' },
  { key: 'yearSection', label: 'Year/Section' },
  { key: 'violation', label: 'Violation' },
  { key: 'reportedBy', label: 'Reported by' },
  { key: 'remarks', label: 'Remarks' },
  { key: 'signature', label: 'Signature' },
  { key: 'actions', label: '', align: 'center', render: (_, row) => (
    <Button size="sm" variant="secondary" className="gap-2 bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-2.828 0L9 13zm0 0V17h4" /></svg>
      Edit
    </Button>
  ) },
]
const data = Array.from({ length: 10 }).map((_, i) => ({
  id: i + 1,
  no: i + 1,
  date: '02/02/26\n11:00AM',
  studentName: <span><b>Arman Jeresano</b><br /><span className="text-xs text-gray-500">23-00000</span></span>,
  yearSection: 'BSIT - 3B',
  violation: i % 2 === 0 ? 'Academic' : 'Behavioral',
  reportedBy: i % 2 === 0 ? 'Jenny Hernandez' : 'Edrianne Lumbas',
  remarks: 'Lorem Ipsum',
  signature: <Button size="sm" variant="secondary" className="px-3 py-1">{i < 3 ? 'Signed' : 'Attach'}</Button>,
}))

const semesterTabs = [
  { key: '1st', label: '1st Semester' },
  { key: '2nd', label: '2nd Semester' },
]

const Archives = () => {
  const [activeFolder, setActiveFolder] = useState('users')
  const [activeTab, setActiveTab] = useState('users')
  const [activeSemester, setActiveSemester] = useState('1st')

  // Determine dynamic title
  let tableTitle = 'Archived Users'
  if (activeFolder !== 'users') {
    tableTitle = `Archived Student Records - S.Y. ${activeFolder.replace('-', ' - ')} (${activeSemester} Semester)`
  }

  return (
    <div className="text-white">
      <AnimatedContent>
        <h2 className="text-xl font-bold mb-2 tracking-wide">SYSTEM ARCHIVES <span className="font-normal">&gt; {folderList.find(f => f.key === activeFolder)?.label}</span></h2>
      </AnimatedContent>
      <AnimatedContent delay={0.1}>
        <SearchBar placeholder="Search Folder" className="mb-4 w-64" />
      </AnimatedContent>
      <AnimatedContent delay={0.2}>
        <div className="flex gap-4 mb-6">
          {folderList.map(folder => (
            <button
              key={folder.key}
              onClick={() => setActiveFolder(folder.key)}
              className={`flex flex-col items-center px-4 py-2 rounded-xl transition-all duration-200 ${activeFolder === folder.key ? 'bg-[#23262B] border-2 border-[#A3AED0]' : 'bg-[#23262B]/60 border border-transparent'} hover:bg-[#23262B]`}
            >
              <span className="mb-2 flex items-center justify-center w-[80px] h-[60px]">
                <svg viewBox="0 0 32 32" width="48" height="36" xmlns="http://www.w3.org/2000/svg" fill="#34353A" style={{ display: 'block', margin: '0 auto' }}>
                  <g id="SVGRepo_iconCarrier">
                    <g id="Page-1" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                      <g id="Icon-Set-Filled" transform="translate(-362, -153)" fill="#34353A">
                        <path d="M390,157 L376,157 C376,154.791 374.209,153 372,153 L366,153 C363.791,153 362,154.791 362,157 L362,163 L394,163 L394,161 C394,158.791 392.209,157 390,157 L390,157 Z M362,181 C362,183.209 363.791,185 366,185 L390,185 C392.209,185 394,183.209 394,181 L394,165 L362,165 L362,181 L362,181 Z" id="folder-2" />
                      </g>
                    </g>
                  </g>
                </svg>
              </span>
              <span className="text-xs font-semibold text-white">{folder.label}</span>
            </button>
          ))}
        </div>
      </AnimatedContent>
      {activeFolder !== 'users' && (
        <AnimatedContent delay={0.25}>
          <TableTabs tabs={semesterTabs} activeTab={activeSemester} onTabChange={setActiveSemester} className="mb-2" />
        </AnimatedContent>
      )}
      <AnimatedContent delay={0.4}>
        <div className="bg-[#23262B] rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">{tableTitle}</h3>
          <div className="flex justify-end gap-2 mb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2 bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0">
                  <Filter className="w-4 h-4" /> Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Academic</DropdownMenuItem>
                <DropdownMenuItem>Behavioral</DropdownMenuItem>
                <DropdownMenuItem>Signed</DropdownMenuItem>
                <DropdownMenuItem>Attach</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="sm" className="gap-2 bg-[#A3AED0] text-[#23262B] hover:bg-[#8B9CB8] border-0">
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
          <DataTable columns={columns} data={data} />
        </div>
      </AnimatedContent>
    </div>
  )
}

export default Archives
