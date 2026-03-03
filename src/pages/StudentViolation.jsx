import React from 'react'
import AnimatedContent from '../components/ui/AnimatedContent'
import Card from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import Button from '../components/ui/Button'
import DataTable from '../components/ui/DataTable'
import { Plus, TrendingUp, TrendingDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../components/ui/dropdown-menu'

const StudentViolation = () => {
  // Example data for table and stats
  const columns = [
    { key: 'no', label: 'No', width: 'w-10' },
    { key: 'date', label: 'Date' },
    { key: 'studentName', label: 'Student Name' },
    { key: 'yearSection', label: 'Year/Section' },
    { key: 'violation', label: 'Violation' },
    { key: 'reportedBy', label: 'Reported by' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'signature', label: 'Signature' },
    { key: 'status', label: 'Status' },
  ]
  const data = Array.from({ length: 12 }).map((_, i) => ({
    id: i + 1,
    no: i + 1,
    date: '02/02/26\n11:00AM',
    studentName: <span><b>Arman Jeresano</b><br /><span className="text-xs text-gray-500">23-00000</span></span>,
    yearSection: 'BSIT - 3B',
    violation: i % 2 === 0 ? 'Academic' : 'Behavioral',
    reportedBy: i % 2 === 0 ? 'Jenny Hernandez' : 'Jhun Alvarez',
    remarks: 'Lorem Ipsum',
    signature: <Button size="sm" variant="secondary" className="px-3 py-1">{i < 3 ? 'Signed' : 'Attach'}</Button>,
    status: <Button size="sm" variant="secondary" className="bg-[#A3AED0] text-white px-3 py-1">{i < 3 ? 'Cleared' : 'Cleared'}</Button>
  }))

  return (
    <div className="text-white">
      <AnimatedContent>
        <h2 className="text-xl font-bold mb-6 tracking-wide">STUDENT VIOLATION</h2>
      </AnimatedContent>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <AnimatedContent delay={0.1}>
          <StatCard title="At-Risk Students" value={0} percentage={0} icon={<TrendingUp />} />
        </AnimatedContent>
        <AnimatedContent delay={0.2}>
          <StatCard title="Violations" value={0} percentage={11.01} icon={<TrendingDown />} />
        </AnimatedContent>
      </div>

      <AnimatedContent delay={0.3}>
        <div className="flex justify-end mb-4">
          <Button variant="secondary" size="sm" className="gap-2 bg-[#4A5568] hover:bg-[#3d4654] border-0">
            <Plus className="w-4 h-4" />
            Log New Violation
          </Button>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={0.4}>
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Student Name or School ID"
            className="bg-[#1a1a1a] text-white placeholder-white pl-4 pr-6 py-2.5 rounded-xl w-64 text-sm focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
          {/* Asc/Desc Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                Asc
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Asc</DropdownMenuItem>
              <DropdownMenuItem>Desc</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Date Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                Date
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Date</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Year Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                Year
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Year</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Status Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="min-w-[90px] justify-between">
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Status</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" size="sm" className="px-6">Generate</Button>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={0.5}>
        <DataTable columns={columns} data={data} />
      </AnimatedContent>
    </div>
  )
}

export default StudentViolation
