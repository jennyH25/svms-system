import React, { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import SearchBar from '@/components/ui/SearchBar'
import AnimatedContent from '@/components/ui/AnimatedContent'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ChevronRight } from 'lucide-react'

const StudentOffensesList = () => {
  const [categoryFilter, setCategoryFilter] = useState('minor') 
  const [specificDegree, setSpecificDegree] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [violationsData, setViolationsData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRows, setExpandedRows] = useState(new Set())
  
  useEffect(() => {
    let isMounted = true

    const refresh = async (options = {}) => {
      await fetchViolations({ ...options, isMounted })
    }

    refresh()

    const intervalId = setInterval(() => {
      refresh({ silent: true })
    }, 10000)

    const handleWindowFocus = () => {
      refresh({ silent: true })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh({ silent: true })
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const fetchViolations = async ({ silent = false, isMounted = true } = {}) => {
    if (!silent) {
      setLoading(true)
    }
    setError('')

    try {
      const response = await fetch(`/api/violations?t=${Date.now()}`, {
        cache: 'no-store',
      })
      const data = await response.json()

      if (!isMounted) {
        return
      }

      if (data.status === 'ok') {
        const degreeOrder = ['First Degree','Second Degree','Third Degree','Fourth Degree','Fifth Degree','Sixth Degree','Seventh Degree']
        const sorted = [...data.violations].sort((a, b) => {
          const da = degreeOrder.indexOf(a.degree)
          const db = degreeOrder.indexOf(b.degree)
          if (da !== db) return da - db
          if (a.category !== b.category) return a.category.localeCompare(b.category)
          return a.name.localeCompare(b.name)
        })
        setViolationsData(sorted)
      } else {
        setError(data.message || 'Unknown error')
      }
    } catch (error) {
      if (!isMounted) {
        return
      }
      console.error('Error fetching violations:', error)
      setError(error.message || 'Network error')
    } finally {
      if (isMounted) {
        setLoading(false)
      }
    }
  }

  const getAvailableDegrees = () => {
    if (categoryFilter === 'minor') {
      return ['First Degree', 'Second Degree']
    } else if (categoryFilter === 'major') {
      return ['Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree']
    }
    return ['First Degree', 'Second Degree', 'Third Degree', 'Fourth Degree', 'Fifth Degree', 'Sixth Degree', 'Seventh Degree']
  }

  const availableDegrees = getAvailableDegrees()

  // Group violations by parent
  const groupedViolations = violationsData.reduce((acc, violation) => {
    if (!violation.parent_id) {
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

    const query = searchQuery.trim().toLowerCase()
    const searchMatch =
      !query ||
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.degree || '').toLowerCase().includes(query) ||
      String(item.category || '').toLowerCase().includes(query) ||
      (item.children || []).some((child) =>
        String(child.name || '').toLowerCase().includes(query)
      )

    return categoryMatch && degreeMatch && searchMatch
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
      </tr>
    ))
  }

  if (loading) {
    return <div className="text-white">Loading...</div>
  }

  if (error) {
    return <div className="text-white">Error loading violations: {error}</div>
  }

  return (
    <div className="text-white">
      {/* Header */}
      <AnimatedContent>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-wide">OFFENSES LIST</h2>
        </div>
      </AnimatedContent>

      {/* Search and Filters */}
      <AnimatedContent distance={40} delay={0.1}>
        <div className="flex gap-4 mb-6 items-center">
          <SearchBar
            placeholder="Search Violation"
            className="flex-1 max-w-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
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
          <h3 className="text-lg font-bold mb-4">List of Offenses</h3>
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
                </tr>
              </thead>
              <tbody className="text-[#1a1a1a]">
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 px-4 text-center text-gray-500">
                      No violations found.
                    </td>
                  </tr>
                )}
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
                    </tr>
                    {renderExpandedRow(row.id, row.children)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AnimatedContent>

    </div>
  )
}

export default StudentOffensesList