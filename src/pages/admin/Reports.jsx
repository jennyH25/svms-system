import React from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

const Reports = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Reports</h2>
        <Button>Generate Report</Button>
      </div>
      <Card>
        <p className="text-gray-600">Reports and analytics will be displayed here.</p>
      </Card>
    </div>
  )
}

export default Reports
