import React from 'react';
import StudentLayout from '../../components/layout/StudentLayout';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import AnimatedContent from '../../components/ui/AnimatedContent';

const columns = [
	{ key: 'date', label: 'Date', width: 'w-32' },
	{ key: 'violation', label: 'Violation', width: 'w-64' },
	{ key: 'type', label: 'Type', width: 'w-64' },
	{ key: 'status', label: 'Status', width: 'w-32' },
	{ key: 'action', label: '', align: 'center', width: 'w-20' },
];

const data = [
	       {
		       date: 'Feb 04, 2026',
		       violation: 'Using Mobile Phone During Class',
		       type: 'Minor Offense - 2nd Degree',
		       status: 'Active',
	       },
	       {
		       date: 'Jan 15, 2026',
		       violation: 'Disruptive Talking',
		       type: 'Minor Offense - 2nd Degree',
		       status: 'Resolved',
	       },
	       {
		       date: 'Feb 10, 2026',
		       violation: 'Forgery of Documents',
		       type: 'Major Offense - 3rd Degree',
		       status: 'Active',
	       },
	       {
		       date: 'Feb 12, 2026',
		       violation: 'Physical Altercation',
		       type: 'Major Offense - 3rd Degree',
		       status: 'Pending',
	       },
	       {
		       date: 'Jan 20, 2026',
		       violation: 'Leaving Trash in Cafeteria',
		       type: 'Minor Offense - 1st Degree',
		       status: 'Resolved',
	       },
	       {
		       date: 'Feb 18, 2026',
		       violation: 'Plagiarism',
		       type: 'Major Offense - 4th Degree',
		       status: 'Active',
	       },
	       {
		       date: 'Feb 22, 2026',
		       violation: 'Tampering with Fire Alarm',
		       type: 'Major Offense - 5th Degree',
		       status: 'Pending',
	       },
	       {
		       date: 'Feb 25, 2026',
		       violation: 'Unauthorized Club Meeting',
		       type: 'Minor Offense - 2nd Degree',
		       status: 'Active',
	       },
	       {
		       date: 'Feb 28, 2026',
		       violation: 'Threats to Staff',
		       type: 'Major Offense - 5th Degree',
		       status: 'Resolved',
	       },
	       {
		       date: 'Feb 04, 2026',
		       violation: 'Not Wearing Proper Uniform',
		       type: 'Minor Offense - 1st Degree',
		       status: 'Active',
	       },
	       {
		       date: 'Jan 15, 2026',
		       violation: 'Not Wearing School ID',
		       type: 'Minor Offense - 1st Degree',
		       status: 'Active',
	       },
];

const actions = [
	{
		label: 'Download',
		icon: (
			<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
			</svg>
		),
		onClick: () => {},
		variant: 'secondary',
	},
];

const StudentViolations = () => {
	       return (
		       <AnimatedContent>
			       <div className="flex flex-col gap-6">
				<h2 className="text-2xl font-bold text-white mb-1">REPORTS</h2>
				<Card variant="glass" padding="lg" className="w-full">
					<div className="flex items-center justify-between mb-4">
						       <h3 className="text-lg font-semibold text-white">Report Archive</h3>
						       <Button variant="secondary" size="sm" className="gap-2 flex items-center">
							       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M6 10v6a2 2 0 002 2h8a2 2 0 002-2v-6" />
								       <line x1="10" y1="10" x2="14" y2="10" />
							       </svg>
							       Filter
						       </Button>
					</div>
					<DataTable
						columns={columns}
						data={data.map(row => ({
							...row,
							action: (
								<Button variant="secondary" size="sm" className="w-full flex items-center justify-center">
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
									</svg>
								</Button>
							),
						}))}
						className="mt-2"
					/>
				   </Card>
			   </div>
		   </AnimatedContent>
	);
};

export default StudentViolations;
