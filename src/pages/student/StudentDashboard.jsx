import React from 'react';
import Card from '../../components/ui/Card';
import AnimatedContent from '../../components/ui/AnimatedContent';

const StudentDashboard = () => {
  // Dummy student info
  const studentInfo = {
    id: 'stu-2026',
    name: 'Juan Dela Cruz',
    program: 'BSIT',
    yearSection: '3A',
    violations: 2,
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 font-inter">
      <Card variant="glass" padding="lg" className="max-w-xl w-full">
        <AnimatedContent>
          <h2 className="text-2xl font-bold mb-4 text-white">Welcome, {studentInfo.name}</h2>
        </AnimatedContent>
        <AnimatedContent delay={0.1}>
          <div className="mb-4 text-white">
            <p><b>Student ID:</b> {studentInfo.id}</p>
            <p><b>Program:</b> {studentInfo.program}</p>
            <p><b>Year/Section:</b> {studentInfo.yearSection}</p>
            <p><b>Violations:</b> {studentInfo.violations}</p>
          </div>
        </AnimatedContent>
        <AnimatedContent delay={0.2}>
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2 text-white">Recent Violations</h3>
            <ul className="list-disc pl-6 text-gray-300">
              <li>02/01/2026 - Academic - Late Submission</li>
              <li>01/15/2026 - Behavioral - Disrespect</li>
            </ul>
          </div>
        </AnimatedContent>
      </Card>
    </div>
  );
};

export default StudentDashboard;
