import React from 'react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

const Students = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        <Button>Add Student</Button>
      </div>
      <Card>
        <p className="text-gray-600">Student list will be displayed here.</p>
      </Card>
    </div>
  )
}

export default Students
