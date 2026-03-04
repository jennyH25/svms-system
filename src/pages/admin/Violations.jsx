import React, { useState } from 'react'
import DataTable from '@/components/ui/DataTable'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import SearchBar from '@/components/ui/SearchBar'
import AnimatedContent from '@/components/ui/AnimatedContent'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Plus } from 'lucide-react'

const Violations = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('minor') 
  const [specificDegree, setSpecificDegree] = useState('')
  const [formData, setFormData] = useState({
    type: '',
    degree: '',
    violation: '',
  })
  
  const violationsData = [
    // First Degree Minor Offenses
    { id: 1, violation: 'Running in hallways', degree: 'First' },
    { id: 2, violation: 'Using phone during class', degree: 'First' },
    { id: 3, violation: 'Unexcused tardiness', degree: 'First' },
    { id: 4, violation: 'Leaving trash in cafeteria', degree: 'First' },
    { id: 5, violation: 'Wearing hats indoors', degree: 'First' },

    // Second Degree Minor Offenses
    { id: 6, violation: 'Disruptive talking', degree: 'Second' },
    { id: 7, violation: 'Skipping assigned seat', degree: 'Second' },
    { id: 8, violation: 'Unauthorized club meeting', degree: 'Second' },
    { id: 9, violation: 'Playing loud music', degree: 'Second' },

    // Third Degree Major Offenses
    { id: 10, violation: 'Forgery of documents', degree: 'Third' },
    { id: 11, violation: 'Physical altercation', degree: 'Third' },
    { id: 12, violation: 'Bullying', degree: 'Third' },

    // Fourth Degree Major Offenses
    { id: 13, violation: 'Plagiarism', degree: 'Fourth' },
    { id: 14, violation: 'Breaking into school property', degree: 'Fourth' },

    // Fifth Degree Major Offenses
    { id: 15, violation: 'Possession of prohibited substances', degree: 'Fifth' },
    { id: 16, violation: 'Tampering with fire alarm', degree: 'Fifth' },
    { id: 17, violation: 'Threats to staff', degree: 'Fifth' },
    { id: 18, violation: 'Vandalizing school bus', degree: 'Fifth' },
  ];


  const getAvailableDegrees = () => {
    if (categoryFilter === 'minor') {
      return ['First', 'Second']
    } else if (categoryFilter === 'major') {
      return ['Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
    }
    return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh']
  }

  const availableDegrees = getAvailableDegrees()

  const filteredData = violationsData.filter(item => {

    let categoryMatch = true
    if (categoryFilter === 'minor') {
      categoryMatch = ['First', 'Second'].includes(item.degree)
    } else if (categoryFilter === 'major') {
      categoryMatch = ['Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'].includes(item.degree)
    }


    let degreeMatch = !specificDegree || item.degree === specificDegree

    return categoryMatch && degreeMatch
  })

  const columns = [
    { key: 'violation', label: 'Violation', width: 'w-2/3' },
    { key: 'degree', label: 'Degree', width: 'w-1/3' },
  ]

  const handleAddViolation = () => {
    console.log('New violation:', formData)
    setFormData({ type: '', degree: '', violation: '' })
    setIsModalOpen(false)
  }

  const handleViolationRowClick = (violation) => {
    console.log('Violation clicked:', violation)

  }

  return (
    <div className="text-white">
      {/* Header */}
      <AnimatedContent>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-wide">VIOLATIONS</h2>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 flex items-center"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus className="w-4 h-4" />
            Add Violation
          </Button>
        </div>
      </AnimatedContent>

      {/* Search and Filters */}
      <AnimatedContent distance={40} delay={0.1}>
        <div className="flex gap-4 mb-6 items-center">
          <SearchBar placeholder="Search Violation" className="flex-1 max-w-xs" />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="min-w-[100px] justify-between">
                Degree
                <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSpecificDegree('')}>
                All
              </DropdownMenuItem>
              {availableDegrees.map(degree => (
                <DropdownMenuItem key={degree} onClick={() => setSpecificDegree(degree)}>
                  {degree}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </AnimatedContent>

      {/* Minor/Major Toggle */}
      <AnimatedContent distance={40} delay={0.2}>
        <div className="flex mb-4">
          <button
            onClick={() => { setCategoryFilter('minor'); setSpecificDegree('') }}
            className={`px-8 py-2.5 rounded-l-lg text-sm font-medium transition-colors ${
              categoryFilter === 'minor'
                ? 'bg-[#1E1F22] text-white'
                : 'bg-[#2D2F33] text-gray-400 hover:text-white'
            }`}
          >
            Minor
          </button>
          <button
            onClick={() => { setCategoryFilter('major'); setSpecificDegree('') }}
            className={`px-8 py-2.5 rounded-r-lg text-sm font-medium transition-colors ${
              categoryFilter === 'major'
                ? 'bg-[#1E1F22] text-white'
                : 'bg-[#2D2F33] text-gray-400 hover:text-white'
            }`}
          >
            Major
          </button>
        </div>
      </AnimatedContent>

      {/* Table Container */}
      <AnimatedContent distance={40} delay={0.3}>
        <div className="bg-[#23262B] rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">List of Violation</h3>
          <DataTable columns={columns} data={filteredData} onRowClick={handleViolationRowClick} />
        </div>
      </AnimatedContent>

      {/* Add Violation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Violation"
        size="md"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Type</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="w-full justify-between bg-[#3a3a3a] hover:bg-[#4a4a4a] h-10">
                    {formData.type ? formData.type.charAt(0).toUpperCase() + formData.type.slice(1) : 'Select Type'}
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, type: 'academic' })}>
                    Academic
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, type: 'behavioral' })}>
                    Behavioral
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, type: 'conduct' })}>
                    Conduct
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Degree</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" className="w-full justify-between bg-[#3a3a3a] hover:bg-[#4a4a4a] h-10">
                    {formData.degree ? formData.degree : 'Select Degree'}
                    <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-full">
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'First' })}>
                    First
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Second' })}>
                    Second
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Third' })}>
                    Third
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Fourth' })}>
                    Fourth
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Fifth' })}>
                    Fifth
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Sixth' })}>
                    Sixth
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFormData({ ...formData, degree: 'Seventh' })}>
                    Seventh
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Violation</label>
            <textarea
              value={formData.violation}
              onChange={(e) => setFormData({ ...formData, violation: e.target.value })}
              placeholder="Enter violation details..."
              className="w-full bg-[#3a3a3a] text-white rounded-lg px-4 py-3 border border-white/10 focus:outline-none focus:ring-1 focus:ring-white/20 text-sm resize-none"
              rows="5"
            />
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              className="bg-gray-500 text-white hover:bg-gray-600"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddViolation}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Violations
