import React, { useState, useEffect } from 'react'
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
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, MoreVertical } from 'lucide-react'

const Violations = () => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [selectedViolation, setSelectedViolation] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('minor') 
  const [specificDegree, setSpecificDegree] = useState('')
  const [formData, setFormData] = useState({
    category: '',
    degree: '',
    name: '',
    parentId: null,
    children: [],
  })
  const [formError, setFormError] = useState('')
  const [editFormData, setEditFormData] = useState({
    id: '',
    category: '',
    degree: '',
    name: '',
    parentId: null,
    children: [],
  })
  const [editFormError, setEditFormError] = useState('')
  const [violationsData, setViolationsData] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState(new Set())
  
  useEffect(() => {
    fetchViolations()
  }, [])

  const fetchViolations = async () => {
    try {
      const response = await fetch('/api/violations')
      const data = await response.json()
      if (data.status === 'ok') {
        // ensure client-side ordering in case backend isn't restarted
        const degreeOrder = ['First Degree','Second Degree','Third Degree','Fourth Degree','Fifth Degree','Sixth Degree','Seventh Degree'];
        const sorted = [...data.violations].sort((a, b) => {
          const da = degreeOrder.indexOf(a.degree);
          const db = degreeOrder.indexOf(b.degree);
          if (da !== db) return da - db;
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.name.localeCompare(b.name);
        });
        setViolationsData(sorted)
      }
    } catch (error) {
      console.error('Error fetching violations:', error)
    } finally {
      setLoading(false)
    }
  }

  // degrees used for filtering the table
  const getAvailableDegrees = () => {
    if (categoryFilter === 'minor') {
      return ['First Degree', 'Second Degree']
    } else if (categoryFilter === 'major') {
      return ['Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree']
    }
    return ['First Degree', 'Second Degree', 'Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree']
  }

  const availableDegrees = getAvailableDegrees()

  // helper for add/edit form to restrict degree list based on selected category
  const getFormDegrees = (category) => {
    if (category === 'Minor Offenses') {
      return ['First Degree', 'Second Degree'];
    } else if (category === 'Major Offenses') {
      return ['Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree'];
    }
    return ['First Degree', 'Second Degree', 'Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree'];
  }

  // Group violations by parent
  const groupedViolations = violationsData.reduce((acc, violation) => {
    if (!violation.parent_id) {
      // preserve any children that were added before parent in the list
      const existing = acc[violation.id] || {};
      acc[violation.id] = {
        ...violation,
        children: existing.children || []
      }
    } else {
      if (!acc[violation.parent_id]) {
        acc[violation.parent_id] = { children: [] }
      }
      acc[violation.parent_id].children.push(violation)
    }
    return acc
  }, {})

  const filteredData = Object.values(groupedViolations).filter(item => {
    let categoryMatch = true
    if (categoryFilter === 'minor') {
      categoryMatch = ['First Degree', 'Second Degree'].includes(item.degree)
    } else if (categoryFilter === 'major') {
      categoryMatch = ['Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree'].includes(item.degree)
    }

    let degreeMatch = !specificDegree || item.degree === specificDegree

    return categoryMatch && degreeMatch
  })

  const columns = [
    { 
      key: 'name', 
      label: 'Violation', 
      width: 'w-2/3',
      render: (value, row) => (
        <div className="flex items-center gap-2">
          {row.children && row.children.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(row.id)
              }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              {expandedRows.has(row.id) ? 
                <ChevronDown className="w-4 h-4" /> : 
                <ChevronRight className="w-4 h-4" />
              }
            </button>
          )}
          <span className="text-[14px] text-[#1a1a1a] font-semibold">{value}</span>
        </div>
      )
    },
    { key: 'degree', label: 'Degree', width: 'w-1/3' },
  ]

  const toggleExpanded = (id) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const openDeleteModal = (row) => {
    setDeleteTarget(row)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) {
      setIsDeleteModalOpen(false)
      return
    }

    try {
      const response = await fetch(`/api/violations/${deleteTarget.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchViolations()
      }
    } catch (error) {
      console.error('Error deleting violation:', error)
    }

    setIsDeleteModalOpen(false)
    setDeleteTarget(null)
  }

  const actions = [
    { 
      label: 'Edit', 
      icon: <Edit className="w-4 h-4" />, 
      onClick: (row) => {
        setSelectedViolation(row)
        setEditFormData({
          id: row.id,
          category: row.category,
          degree: row.degree,
          name: row.name,
          parentId: row.parent_id,
          children: (row.children || []).map(c => c.name),
        })
        setEditFormError('')
        setIsEditModalOpen(true)
      }
    },
    { 
      label: 'Delete', 
      icon: <Trash2 className="w-4 h-4" />, 
      onClick: (row) => openDeleteModal(row),
      variant: 'danger'
    },
  ]

  const handleAddViolation = async () => {
    // basic validation
    if (!formData.category || !formData.degree || !formData.name) {
      setFormError('Category, degree, and name are required.');
      return;
    }
    setFormError('');

    try {
      const response = await fetch('/api/violations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })
      if (response.ok) {
        setFormData({ category: '', degree: '', name: '', parentId: null, children: [] })
        setIsModalOpen(false)
        fetchViolations()
      } else {
        const data = await response.json();
        setFormError(data.message || 'Failed to add violation.');
      }
    } catch (error) {
      console.error('Error adding violation:', error)
      setFormError('Network error while adding violation.');
    }
  }

  const handleEditViolation = async () => {
    if (!editFormData.category || !editFormData.degree || !editFormData.name) {
      setEditFormError('Category, degree, and name are required.');
      return;
    }
    setEditFormError('');

    try {
      const response = await fetch(`/api/violations/${editFormData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      })
      if (response.ok) {
        setIsEditModalOpen(false)
        fetchViolations()
      } else {
        const data = await response.json();
        setEditFormError(data.message || 'Failed to update violation.');
      }
    } catch (error) {
      console.error('Error editing violation:', error)
      setEditFormError('Network error while updating violation.');
    }
  }

  const handleViolationRowClick = (violation) => {
    if (violation.children && violation.children.length > 0) {
      toggleExpanded(violation.id)
    }
  }

  // Render expanded children
  const renderExpandedRow = (parentId, children) => {
    if (!expandedRows.has(parentId)) return null

    return children.map(child => (
      <tr key={child.id} className="bg-gray-50">
        <td className="py-2 px-4 pl-12">
          <span className="text-[13px] text-[#666] font-medium">• {child.name}</span>
        </td>
        <td className="py-2 px-4">
          <span className="text-[13px] text-[#666]">{child.degree}</span>
        </td>
        <td className="py-2 px-4 text-center">
          {/* No actions for sub-violations */}
        </td>
      </tr>
    ))
  }

  if (loading) {
    return <div className="text-white">Loading...</div>
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
            onClick={() => {
              setFormError('')
              setFormData({ category: '', degree: '', name: '', parentId: null, children: [] })
              setIsModalOpen(true)
            }}
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
          <div className="bg-[#EAECF0] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#FFFFFF]">
                <tr className="text-gray-900/50 text-[13px]">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={`py-3 px-4 font-medium ${
                        column.align === "center"
                          ? "text-center"
                          : column.align === "right"
                            ? "text-right"
                            : "text-left"
                      } ${column.width || ""}`}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="text-center py-3 px-4 font-medium w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-[#1a1a1a]">
                {filteredData.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-gray-100 transition-colors text-[#1a1a1a] ${row.children && row.children.length > 0 ? "cursor-pointer" : ""}`}
                      onClick={() => handleViolationRowClick(row)}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`py-3 px-4 ${
                            column.align === "center"
                              ? "text-center"
                              : column.align === "right"
                                ? "text-right"
                                : ""
                          }`}
                        >
                          {column.render ? (
                            column.render(row[column.key], row)
                          ) : (
                            <span className="text-[14px] text-[#1a1a1a] font-semibold">
                              {row[column.key]}
                            </span>
                          )}
                        </td>
                      ))}
                      <td
                        className="py-3 px-4 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                              <MoreVertical className="w-4 h-4 text-gray-500" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="bg-white border border-gray-200 shadow-lg z-50"
                          >
                            {actions.map((action, actionIndex) => (
                              <DropdownMenuItem
                                key={actionIndex}
                                className={`
                                  flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
                                  data-[highlighted]:bg-gray-100
                                  data-[highlighted]:text-gray-900
                                  ${
                                    action.variant === 'danger'
                                      ? 'text-red-600 data-[highlighted]:bg-red-100 data-[highlighted]:text-red-700'
                                      : 'text-gray-700'
                                  }
                                `}
                                onClick={() => action.onClick(row)}
                              >
                                {action.icon}
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {renderExpandedRow(row.id, row.children)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnimatedContent>

      {/* Add Violation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFormError('');
        }}
        title="Add Violation"
        size="md"
      >
        {formError && (
          <div className="text-red-400 text-sm mb-2">
            {formError}
          </div>
        )}
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Category</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="w-full justify-between bg-[#3a3a3a] hover:bg-[#4a4a4a] h-10">
                  {formData.category ? formData.category : 'Select Category'}
                  <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => {
                    const category = 'Minor Offenses';
                    setFormData({
                      ...formData,
                      category,
                      degree: getFormDegrees(category).includes(formData.degree) ? formData.degree : ''
                    });
                  }}>
                  Minor Offenses
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                    const category = 'Major Offenses';
                    setFormData({
                      ...formData,
                      category,
                      degree: getFormDegrees(category).includes(formData.degree) ? formData.degree : ''
                    });
                  }}>
                  Major Offenses
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
                {getFormDegrees(formData.category).map(degree => (
                  <DropdownMenuItem
                    key={degree}
                    onClick={() => setFormData({ ...formData, degree })}
                  >
                    {degree}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Violation Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#3a3a3a] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter violation name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Sub‑violations</label>
            {formData.children.map((child, idx) => (
              <div key={idx} className="flex items-center mb-2 gap-2">
                <input
                  type="text"
                  value={child}
                  onChange={(e) => {
                    const newChildren = [...formData.children];
                    newChildren[idx] = e.target.value;
                    setFormData({ ...formData, children: newChildren });
                  }}
                  className="flex-1 px-3 py-2 bg-[#3a3a3a] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Child violation"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newChildren = formData.children.filter((_, i) => i !== idx);
                    setFormData({ ...formData, children: newChildren });
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, children: [...formData.children, ""] })}
              className="text-blue-400 hover:text-blue-600 text-sm"
            >
              + Add another sub‑violation
            </button>
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddViolation}>
            Add Violation
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Violation Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditFormError('');
        }}
        title="Edit Violation"
        size="md"
      >
        {editFormError && (
          <div className="text-red-400 text-sm mb-2">
            {editFormError}
          </div>
        )}
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Category</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="w-full justify-between bg-[#3a3a3a] hover:bg-[#4a4a4a] h-10">
                  {editFormData.category ? editFormData.category : 'Select Category'}
                  <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                <DropdownMenuItem onClick={() => {
                    const category = 'Minor Offenses';
                    setEditFormData({
                      ...editFormData,
                      category,
                      degree: getFormDegrees(category).includes(editFormData.degree) ? editFormData.degree : ''
                    });
                  }}>
                  Minor Offenses
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                    const category = 'Major Offenses';
                    setEditFormData({
                      ...editFormData,
                      category,
                      degree: getFormDegrees(category).includes(editFormData.degree) ? editFormData.degree : ''
                    });
                  }}>
                  Major Offenses
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Degree</label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="w-full justify-between bg-[#3a3a3a] hover:bg-[#4a4a4a] h-10">
                  {editFormData.degree ? editFormData.degree : 'Select Degree'}
                  <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-full">
                {getFormDegrees(editFormData.category).map(degree => (
                  <DropdownMenuItem
                    key={degree}
                    onClick={() => setEditFormData({ ...editFormData, degree })}
                  >
                    {degree}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Violation Name</label>
            <input
              type="text"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#3a3a3a] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter violation name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Sub‑violations</label>
            {editFormData.children.map((child, idx) => (
              <div key={idx} className="flex items-center mb-2 gap-2">
                <input
                  type="text"
                  value={child}
                  onChange={(e) => {
                    const newChildren = [...editFormData.children];
                    newChildren[idx] = e.target.value;
                    setEditFormData({ ...editFormData, children: newChildren });
                  }}
                  className="flex-1 px-3 py-2 bg-[#3a3a3a] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Child violation"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newChildren = editFormData.children.filter((_, i) => i !== idx);
                    setEditFormData({ ...editFormData, children: newChildren });
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditFormData({ ...editFormData, children: [...editFormData.children, ""] })}
              className="text-blue-400 hover:text-blue-600 text-sm"
            >
              + Add another sub‑violation
            </button>
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEditViolation}>
            Update Violation
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Delete"
        size="sm"
      >
        <p>Are you sure you want to delete this violation?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

export default Violations
