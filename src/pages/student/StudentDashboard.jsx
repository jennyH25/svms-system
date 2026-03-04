
import React from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import StudentStatCard from '../../components/ui/StudentStatCard';
// GaugeIndicator is now used inside StatCard
import AnimatedContent from '../../components/ui/AnimatedContent';

const studentInfo = {
  name: 'Jeresano, Arman',
  id: '23-000000',
  program: 'BS INFORMATION TECHNOLOGY',
  section: 'BSIT - 1A',
  year: '1ST YEAR',
};

const recentActivities = [
  {
    title: 'Proffesor Lorem Ipsum',
    description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
    time: 'Just now',
  },
  {
    title: 'Proffesor Lorem Ipsum',
    description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
    time: 'Just now',
  },
  {
    title: 'Proffesor Lorem Ipsum',
    description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
    time: 'Just now',
  },
  {
    title: 'Proffesor Lorem Ipsum',
    description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
    time: 'Just now',
  },
];

const StudentDashboard = () => {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <AnimatedContent delay={0.1}>
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">DASHBOARD</h2>
        </div>
      </AnimatedContent>

      {/* Student Info & Stat Cards */}
      <AnimatedContent delay={0.3}>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Student Info */}
          <Card variant="glass" padding="lg" className="flex-1 min-w-[320px]">
            <div>
              <span className="text-3xl font-extrabold text-white leading-tight">{studentInfo.name}</span>
              <span className="text-lg text-white font-normal ml-1"> </span>
              <div className="text-gray-400 font-medium text-sm mt-1">ID: {studentInfo.id}</div>
            </div>
            <div className="mt-4 text-white text-sm space-y-1">
              <div><span className="font-bold">PROGRAM:</span> {studentInfo.program}</div>
              <div><span className="font-bold">SECTION:</span> {studentInfo.section}</div>
              <div><span className="font-bold">YEAR:</span> {studentInfo.year}</div>
            </div>
          </Card>

          {/* Stat Cards */}
          <div className="flex flex-col md:flex-row gap-6 flex-1">
            <StudentStatCard
              title="Good Standing!"
              value={0}
              max={10}
              color="#60A5FA"
              comparisonLabel="Violation Count"
              className="flex-1"
            />
            <StudentStatCard
              title="You are in good disciplinary standing"
              value={0}
              max={10}
              color="#F59E42"
              comparisonLabel="Major Violation"
              className="flex-1"
            />
          </div>
        </div>
      </AnimatedContent>

      {/* Recent Activity */}
      <AnimatedContent delay={0.5}>
        <Card variant="glass" padding="lg" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
            <button className="text-gray-400 hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          </div>
          <div className="space-y-2">
            {recentActivities.map((activity, idx) => (
              <div key={idx} className="bg-[#232528]/60 rounded-lg px-4 py-3 flex justify-between items-center border border-white/10">
                <div>
                  <div className="font-bold text-white text-sm mb-1">{activity.title}</div>
                  <div className="text-gray-400 text-xs">{activity.description}</div>
                </div>
                <div className="text-gray-500 text-xs font-medium">{activity.time}</div>
              </div>
            ))}
          </div>
        </Card>
      </AnimatedContent>
    </div>
  );
};

export default StudentDashboard;
