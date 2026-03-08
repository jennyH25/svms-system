
import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import StudentStatCard from '../../components/ui/StudentStatCard';
// GaugeIndicator is now used inside StatCard
import AnimatedContent from '../../components/ui/AnimatedContent';

function formatStudentName(lastName, firstName, fallbackFullName) {
  if (lastName && firstName) {
    return `${lastName}, ${firstName}`;
  }

  return fallbackFullName || 'Student';
}

function formatProgram(program) {
  const normalized = String(program || '').trim().toUpperCase();

  if (normalized === 'BSIT') {
    return 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY';
  }

  if (normalized === 'BSCS') {
    return 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE';
  }

  return String(program || 'N/A').trim() || 'N/A';
}

function parseYearSection(yearSection) {
  const value = String(yearSection || '').trim().toUpperCase();
  const match = value.match(/(\d+)\s*([A-Z]+)/);

  if (!match) {
    return { yearNumber: '', section: 'N/A' };
  }

  return {
    yearNumber: match[1],
    section: match[2],
  };
}

function toOrdinalYearLabel(yearNumber) {
  const n = Number(yearNumber);
  if (!Number.isFinite(n) || n <= 0) {
    return 'N/A';
  }

  const j = n % 10;
  const k = n % 100;
  let suffix = 'TH';

  if (j === 1 && k !== 11) suffix = 'ST';
  else if (j === 2 && k !== 12) suffix = 'ND';
  else if (j === 3 && k !== 13) suffix = 'RD';

  return `${n}${suffix} YEAR`;
}

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
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentUser, setStudentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('svms_user') || '{}');
    } catch (_error) {
      return {};
    }
  });

  useEffect(() => {
    const userId = studentUser?.id;
    if (!userId) {
      return;
    }

    const loadStudentProfile = async () => {
      try {
        const response = await fetch(`/api/students/profile/${userId}`);
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result?.student) {
          return;
        }

        setStudentProfile(result.student);

        const nextUser = {
          ...studentUser,
          schoolId: result.student.school_id || studentUser.schoolId || '',
          program: result.student.program || studentUser.program || '',
          yearSection: result.student.year_section || studentUser.yearSection || '',
          firstName: result.student.first_name || studentUser.firstName || '',
          lastName: result.student.last_name || studentUser.lastName || '',
          fullName: result.student.full_name || studentUser.fullName || '',
        };

        localStorage.setItem('svms_user', JSON.stringify(nextUser));
        setStudentUser(nextUser);
      } catch (_error) {
        // Keep existing local user data if profile fetch fails.
      }
    };

    loadStudentProfile();
  }, [studentUser?.id]);

  const dashboardInfo = useMemo(() => {
    const firstName = studentProfile?.first_name || studentUser?.firstName || '';
    const lastName = studentProfile?.last_name || studentUser?.lastName || '';
    const fullName = studentProfile?.full_name || studentUser?.fullName || '';
    const schoolId = studentProfile?.school_id || studentUser?.schoolId || 'N/A';
    const rawProgram = studentProfile?.program || studentUser?.program || '';
    const rawYearSection =
      studentProfile?.year_section || studentUser?.yearSection || '';
    const violationCount = Number(
      studentProfile?.violation_count ?? studentUser?.violationCount ?? 0,
    );

    const parsed = parseYearSection(rawYearSection);

    return {
      name: formatStudentName(lastName, firstName, fullName),
      schoolId,
      program: formatProgram(rawProgram),
      section: parsed.section || 'N/A',
      year: toOrdinalYearLabel(parsed.yearNumber),
      violationCount: Number.isFinite(violationCount) ? violationCount : 0,
    };
  }, [studentProfile, studentUser]);

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
              <span className="text-3xl font-extrabold text-white leading-tight">{dashboardInfo.name}</span>
              <span className="text-lg text-white font-normal ml-1"> </span>
              <div className="text-gray-400 font-medium text-sm mt-1">SCHOOL ID: {dashboardInfo.schoolId}</div>
            </div>
            <div className="mt-4 text-white text-sm space-y-1">
              <div><span className="font-bold">PROGRAM:</span> {dashboardInfo.program}</div>
              <div><span className="font-bold">SECTION:</span> {dashboardInfo.section}</div>
              <div><span className="font-bold">YEAR:</span> {dashboardInfo.year}</div>
            </div>
          </Card>

          {/* Stat Cards */}
          <div className="flex flex-col md:flex-row gap-6 flex-1">
            <StudentStatCard
              title="Good Standing!"
              value={dashboardInfo.violationCount}
              max={10}
              color="#60A5FA"
              comparisonLabel="Violation Count"
              className="flex-1"
            />
            <StudentStatCard
              title="You are in good disciplinary standing"
              value={dashboardInfo.violationCount}
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
