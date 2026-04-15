
import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import StudentStatCard from '../../components/ui/StudentStatCard';
// GaugeIndicator is now used inside StatCard
import AnimatedContent from '../../components/ui/AnimatedContent';
import { getAuditHeaders } from '@/lib/auditHeaders';
import { cachedFetchJSON } from '@/lib/fetchHelper';
import { ShieldCheck, AlertTriangle, ListChecks, Eye } from 'lucide-react';

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



const StudentDashboard = () => {
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentViolations, setStudentViolations] = useState([]);
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
        const result = await cachedFetchJSON(`/api/students/profile/${userId}`, {}, {
          ttlMs: 30000,
          staleWhileRevalidate: true,
        });

        if (result.status !== 'ok' || !result?.data?.student) {
          return;
        }

        setStudentProfile(result.data.student);

        const nextUser = {
          ...studentUser,
          schoolId: result.data.student.school_id || studentUser.schoolId || '',
          program: result.data.student.program || studentUser.program || '',
          yearSection: result.data.student.year_section || studentUser.yearSection || '',
          firstName: result.data.student.first_name || studentUser.firstName || '',
          lastName: result.data.student.last_name || studentUser.lastName || '',
          fullName: result.data.student.full_name || studentUser.fullName || '',
        };

        localStorage.setItem('svms_user', JSON.stringify(nextUser));
        setStudentUser(nextUser);
      } catch (_error) {
        // Keep existing local user data if profile fetch fails.
      }
    };

    loadStudentProfile();
  }, [studentUser?.id]);

  useEffect(() => {
    const userId = studentUser?.id;
    if (!userId) {
      return;
    }

    const loadStudentViolations = async () => {
      try {
        const result = await cachedFetchJSON('/api/student-violations/me', {
          headers: { ...getAuditHeaders() },
        }, {
          ttlMs: 12000,
          staleWhileRevalidate: true,
        });

        if (result.status !== 'ok') {
          return;
        }

        setStudentViolations(Array.isArray(result.data?.records) ? result.data.records : []);
      } catch (_error) {
        // Ignore violation fetch errors for dashboard counts.
      }
    };

    loadStudentViolations();
    const intervalId = setInterval(loadStudentViolations, 15000);
    return () => clearInterval(intervalId);
  }, [studentUser?.id]);

  const dashboardInfo = useMemo(() => {
    const firstName = studentProfile?.first_name || studentUser?.firstName || '';
    const lastName = studentProfile?.last_name || studentUser?.lastName || '';
    const fullName = studentProfile?.full_name || studentUser?.fullName || '';
    const schoolId = studentProfile?.school_id || studentUser?.schoolId || 'N/A';
    const rawProgram = studentProfile?.program || studentUser?.program || '';
    const rawYearSection =
      studentProfile?.year_section || studentUser?.yearSection || '';

    const fetchedViolations = Array.isArray(studentViolations) ? studentViolations : [];
    const activeViolations = fetchedViolations.filter((record) => !record?.cleared_at);
    const profileViolationCount = Number(studentProfile?.violation_count ?? studentUser?.violationCount ?? 0);
    const hasViolationData = fetchedViolations.length > 0;

    const violationCount = hasViolationData
      ? activeViolations.length
      : Number.isFinite(profileViolationCount)
      ? profileViolationCount
      : 0;

    const parsed = parseYearSection(rawYearSection);

    const majorViolationCount = hasViolationData
      ? activeViolations.filter((record) => {
          const category = String(record?.violation_category || '').trim().toLowerCase();
          const degree = String(record?.violation_degree || '').trim().toLowerCase();
          const degreeMajorClass = /third degree|fourth degree|fifth degree|sixth degree|seventh degree/i;
          return (
            category.includes('major') ||
            degree.includes('major') ||
            degreeMajorClass.test(record?.violation_degree || '') ||
            (String(record?.violation_label || '').toLowerCase().includes('major'))
          );
        }).length
      : 0;

    const disciplinaryStanding = violationCount <= 0 ? 'Good Standing' : 'Under Review';
    const disciplinaryMessage =
      violationCount <= 0
        ? 'You currently have no disciplinary sanctions affecting your academic status.'
        : 'You have active violation records. Please check the Violations tab for details.';

    const disciplinaryIcon =
      violationCount <= 0 ? (
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-400" />
      );

    return {
      name: formatStudentName(lastName, firstName, fullName),
      schoolId,
      program: formatProgram(rawProgram),
      section: parsed.section || 'N/A',
      year: toOrdinalYearLabel(parsed.yearNumber),
      violationCount: Number.isFinite(violationCount) ? violationCount : 0,
      majorViolationCount: Number.isFinite(majorViolationCount) ? majorViolationCount : 0,
      disciplinaryStanding,
      disciplinaryMessage,
      disciplinaryIcon,
    };
  }, [studentProfile, studentUser, studentViolations]);

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
          <Card variant="glass" padding="lg" className="flex-1 min-w-[320px] min-h-[320px]">
            <div>
              <span className="text-3xl md:text-4xl font-extrabold text-white leading-tight">{dashboardInfo.name}</span>
              <span className="text-lg text-white font-normal ml-1"> </span>
              <div className="text-gray-400 font-medium text-sm md:text-base mt-1">SCHOOL ID: {dashboardInfo.schoolId}</div>
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
              title=""
              value={dashboardInfo.violationCount}
              max={10}
              color="#60A5FA"
              comparisonLabel="Violation Count"
              className="flex-1"
            />
            <StudentStatCard
              title=""
              value={dashboardInfo.majorViolationCount}
              max={10}
              color="#F59E42"
              comparisonLabel="Major Violation"
              className="flex-1"
            />
          </div>
        </div>
      </AnimatedContent>

      {/* Disciplinary Standing */}
      <AnimatedContent delay={0.5}>
        <Card variant="glass" padding="lg" className="w-full min-h-[280px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl md:text-2xl font-semibold text-white">Disciplinary Standing</h3>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-4">
            <div className="flex-shrink-0">
              {React.cloneElement(dashboardInfo.disciplinaryIcon, {
                className: `${dashboardInfo.disciplinaryIcon.props.className || ""} w-8 h-8`.trim(),
              })}
            </div>
            <div>
              <div className="text-white text-xl md:text-2xl font-semibold">Status: {dashboardInfo.disciplinaryStanding}</div>
              <div className="mt-1 text-gray-200 text-sm md:text-base">{dashboardInfo.disciplinaryMessage}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => window.location.href = '/student/violations'}
              className="flex items-center justify-center gap-2 rounded-lg bg-[rgb(36,38,41)] px-4 py-3 text-sm md:text-base font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              <Eye className="w-5 h-5 text-white" />
              View My Violations
            </button>

            <button
              onClick={() => window.location.href = '/student/offenses'}
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-500/30 bg-transparent px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              <ListChecks className="w-4 h-4" />
              View List of Offenses
            </button>
          </div>
        </Card>
      </AnimatedContent>
    </div>
  );
};

export default StudentDashboard;
