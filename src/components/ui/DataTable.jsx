import React from 'react'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * DataTable - Reusable table component with white background and dark header
 * 
 * @param {Array} columns - Array of column definitions { key, label, align?, width?, render? }
 * @param {Array} data - Array of data objects to display
 * @param {Array} actions - Optional array of action definitions { label, icon, onClick, variant? }
 * @param {Function} onRowClick - Optional callback when a row is clicked
 * @param {string} className - Additional classes for the table container
 */
const DataTable = ({ 
  columns = [], 
  data = [], 
  actions = [],
  onRowClick,
  className = '' 
}) => {
  const hasActions = actions.length > 0

  return (
    <div className={`bg-[#EAECF0] rounded-xl overflow-hidden ${className}`}>
      <table className="w-full">
        <thead className="bg-[#FFFFFF]">
          <tr className="text-gray-900/50 text-[13px]">
            {columns.map((column) => (
              <th 
                key={column.key} 
                className={`py-3 px-4 font-medium ${
                  column.align === 'center' ? 'text-center' : 
                  column.align === 'right' ? 'text-right' : 'text-left'
                } ${column.width || ''}`}
              >
                {column.label}
              </th>
            ))}
            {hasActions && (
              <th className="text-center py-3 px-4 font-medium w-16">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="text-[#1a1a1a]">
          {data.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex} 
              className={`border-b border-gray-100 hover:bg-gray-100 transition-colors text-[#1a1a1a] ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => (
                <td 
                  key={column.key} 
                  className={`py-3 px-4 ${
                    column.align === 'center' ? 'text-center' : 
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {column.render ? column.render(row[column.key], row) : (
                    <span className="text-[14px] text-[#1a1a1a] font-semibold">
                      {row[column.key]}
                    </span>
                  )}
                </td>
              ))}
              {hasActions && (
                <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border border-gray-200 shadow-lg z-50">
                      {actions.map((action, actionIndex) => (
                        <DropdownMenuItem 
                          key={actionIndex}
                          className={`!flex !items-center !gap-2 !cursor-pointer !px-3 !py-2 !text-sm !outline-none !transition-colors !rounded-lg ${
                            action.variant === 'danger' 
                              ? '!text-red-600 data-[highlighted]:!bg-gray-200' 
                              : '!text-gray-700 data-[highlighted]:!bg-gray-200'
                          }`}
                          onClick={() => action.onClick?.(row)}
                        >
                          {action.icon}
                          <span>{action.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      
      {data.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          No data available
        </div>
      )}
    </div>
  )
}

// Pre-built cell renderers for common patterns
export const TableCellText = ({ primary, secondary }) => (
  <div>
    <p className="text-[#1a1a1a] text-[14px] font-semibold">{primary}</p>
    {secondary && <p className="text-gray-500 text-[13px] font-medium">{secondary}</p>}
  </div>
)

export const TableCellDateTime = ({ date, time }) => (
  <div>
    <span className="text-[14px] text-[#1a1a1a] font-semibold">{date}</span>
    {time && <span className="text-cyan-600 text-[13px] font-medium ml-2">{time}</span>}
  </div>
)

export const TableCellBadge = ({ label, variant = 'default' }) => {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    primary: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-orange-100 text-orange-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-cyan-100 text-cyan-700',
  }

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-[12px] font-medium ${variants[variant]}`}>
      {label}
    </span>
  )
}

export default DataTable
