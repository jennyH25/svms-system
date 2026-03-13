import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Modal, { ModalFooter } from '../../components/ui/Modal';
import AnimatedContent from '../../components/ui/AnimatedContent';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import { Bell, Download, Filter } from 'lucide-react';
import { getAuditHeaders } from '@/lib/auditHeaders';

// Column definitions are generated inside the component since they depend on triggerDownloadModal and record context.

function normalizeType(record) {
	const category = String(record?.violation_category || '').trim();
	const degree = String(record?.violation_degree || '').trim();

	if (category && degree) {
		return `${category} - ${degree}`;
	}

	return category || degree || 'Not specified';
}

function parseNotificationMetadata(rawMetadata) {
	if (!rawMetadata) return null;
	if (typeof rawMetadata === 'object') return rawMetadata;

	try {
		return JSON.parse(rawMetadata);
	} catch (_error) {
		return null;
	}
}

const StudentViolations = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const highlightId = new URLSearchParams(location.search).get('highlight');
	const [records, setRecords] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');
	const [searchTerm, setSearchTerm] = useState('');
	const [statusFilter, setStatusFilter] = useState('All');
	const [unreadCount, setUnreadCount] = useState(0);
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
	const [downloadModalOpen, setDownloadModalOpen] = useState(false);
	const [downloadFormat, setDownloadFormat] = useState('excel');
	const [selectedDownloadRecord, setSelectedDownloadRecord] = useState(null);

	useEffect(() => {
		let isMounted = true;

		const loadData = async ({ silent = false } = {}) => {
			try {
				if (isMounted && !silent) {
					setIsLoading(true);
					setError('');
				}

				const [recordsResp, notificationsResp] = await Promise.all([
					fetch('/api/student-violations/me', { headers: { ...getAuditHeaders() } }),
					fetch('/api/notifications', { headers: { ...getAuditHeaders() } }),
				]);

				const recordsData = await recordsResp.json().catch(() => ({}));
				const notificationsData = await notificationsResp.json().catch(() => ({}));

				if (isMounted) {
					if (recordsResp.ok) {
						setRecords(Array.isArray(recordsData.records) ? recordsData.records : []);
						setHasLoadedOnce(true);
					} else {
						setError(recordsData.message || 'Unable to refresh your violations.');
					}

					if (notificationsResp.ok) {
						const unreadViolationUpdates = (notificationsData.notifications || []).filter(
							(note) => {
								const metadata = parseNotificationMetadata(note?.metadata);
								const type = String(metadata?.type || '').toLowerCase();
								return !note?.read_at && type.startsWith('student_violation_');
							},
						).length;
						setUnreadCount(unreadViolationUpdates);
					}
				}
			} catch (_error) {
				if (isMounted) {
					setError('Unable to refresh your violations right now.');
				}
			} finally {
				if (isMounted && !silent) {
					setIsLoading(false);
				}
			}
		};

		loadData();
		const intervalId = setInterval(() => loadData({ silent: true }), 15000);

		return () => {
			isMounted = false;
			clearInterval(intervalId);
		};
	}, []);

	const formatDownloadFileName = useCallback((record, format) => {
		const getNamePart = (preferred, fallback) => {
			const value = (record?.[preferred] || record?.[fallback] || '').toString().trim();
			return value ? value.replace(/\s+/g, '_') : '';
		};

		const surname = getNamePart('student_last_name', 'last_name') || getNamePart('surname', 'family_name');
		const givenName = getNamePart('student_first_name', 'first_name') || getNamePart('given_name', 'name');
		const studentSegment = surname || givenName ? `${surname || 'Unknown'}_${givenName || 'Student'}` : 'Unknown_Student';

		const violationSegment = (record?.violation || record?.violation_label || record?.violation_name || 'Violation').toString().trim().replace(/\s+/g, '_');

		const typeString = record?.type ? record.type.toString().trim() : normalizeType(record);
		const typeSegment = typeString ? `(${typeString})` : '(Unknown Type)';

		const sanitize = (text) =>
			String(text)
				.replace(/[\\/:*?"<>|]/g, '')
				.trim();

		const rawDate = record?.createdAtRaw || record?.date || new Date().toISOString();
		const parsedDate = new Date(rawDate);
		const dateSegment = Number.isNaN(parsedDate.getTime())
			? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
			: parsedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

		const safeStudentSegment = sanitize(studentSegment).replace(/\s+/g, '_');
		const safeViolationSegment = sanitize(violationSegment).replace(/\s+/g, '_');
		const safeTypeSegment = sanitize(typeSegment);
		const safeDateSegment = sanitize(dateSegment);

		const ext = format === 'pdf' ? 'pdf' : 'csv';

		return `${safeStudentSegment}_${safeViolationSegment}_${safeTypeSegment}_${safeDateSegment}.${ext}`;
	}, []);

	const createDownload = useCallback((record, format) => {
		const values = {
			Date: record.date,
			Violation: record.violation,
			Type: record.type,
			'Reported by': record.reportedBy,
			Remarks: record.remarks,
			Status: record.status,
		};

		if (format === 'excel') {
			const csv = [
				Object.keys(values).join(','),
				Object.values(values)
					.map((v) => `"${String(v).replace(/"/g, '""')}"`)
					.join(','),
			].join('\n');
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			const filename = formatDownloadFileName(record, 'excel');
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', filename);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			return;
		}

		if (format === 'pdf') {
			const text = `Violation Report\n\n${Object.entries(values)
				.map(([k, v]) => `${k}: ${v}`)
				.join('\n')}`;
			const blob = new Blob([text], { type: 'application/pdf' });
			const filename = formatDownloadFileName(record, 'pdf');
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', filename);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		}
	}, [formatDownloadFileName]);

	const triggerDownloadModal = useCallback((record) => {
		setSelectedDownloadRecord(record);
		setDownloadFormat('excel');
		setDownloadModalOpen(true);
	}, []);

	const confirmDownload = useCallback(() => {
		if (!selectedDownloadRecord) return;
		createDownload(selectedDownloadRecord, downloadFormat);
		setDownloadModalOpen(false);
	}, [createDownload, downloadFormat, selectedDownloadRecord]);

	const columns = useMemo(
		() => [
			{ key: 'date', label: 'Date Logged', width: 'w-40' },
			{ key: 'violation', label: 'Violation', width: 'w-[30rem]' },
			{ key: 'type', label: 'Type', width: 'w-64' },
			{ key: 'reportedBy', label: 'Reported by', width: 'w-40' },
			{ key: 'remarks', label: 'Remarks' },
			{
				key: 'status',
				label: 'Status',
				width: 'w-32',
				render: (value) => (
					<span
						className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
							value === 'Cleared'
								? 'bg-green-100 text-green-700'
								: 'bg-amber-100 text-amber-700'
						}`}
					>
						{value}
					</span>
				),
			},
			{
				key: 'download',
				label: '',
				width: 'w-16',
				align: 'center',
				render: (_value, row) => (
					<button
						type="button"
						className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
						onClick={(e) => {
							e.stopPropagation();
							triggerDownloadModal(row);
						}}
						aria-label="Download violation"
					>
						<Download className="w-4 h-4" />
					</button>
				),
			},
		],
		[triggerDownloadModal],
	);

	const tableData = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();

		return (records || [])
			.filter((row) => {
				const status = row?.cleared_at ? 'Cleared' : 'Active';
				const typeText = normalizeType(row).toLowerCase();
				const violationText = String(row?.violation_label || row?.violation_name || '').toLowerCase();
				const remarksText = String(row?.remarks || '').toLowerCase();

				const matchesSearch =
					!query ||
					violationText.includes(query) ||
					typeText.includes(query) ||
					remarksText.includes(query);

				const matchesStatus = statusFilter === 'All' || status === statusFilter;
				return matchesSearch && matchesStatus;
			})
			.map((row) => {
				const createdAt = new Date(row.created_at);
				const displayDate = Number.isNaN(createdAt.getTime())
					? '-'
					: createdAt.toLocaleDateString();

				return {
					id: row.id,
					date: displayDate,
					violation: row.violation_label || row.violation_name || '-',
					type: normalizeType(row),
					reportedBy: row.reported_by || '-',
					remarks: row.remarks || '-',
					status: row.cleared_at ? 'Cleared' : 'Active',
					student_last_name: row.student_last_name || row.last_name || row.surname || '',
					student_first_name: row.student_first_name || row.first_name || row.given_name || '',
					createdAtRaw: row.created_at || row.date || new Date().toISOString(),
				};
			});
	}, [records, searchTerm, statusFilter]);

	return (
		<AnimatedContent>
			<div className="flex flex-col gap-6">
				<h2 className="text-2xl font-bold text-white mb-1">MY VIOLATIONS</h2>

				{highlightId ? (
					<Card variant="glass" padding="sm" className="w-full border border-cyan-400/25 bg-cyan-500/10">
						<p className="text-cyan-100 text-sm">
							Showing update for violation record <span className="font-bold">#{highlightId}</span>.
						</p>
					</Card>
				) : null}

				{unreadCount > 0 ? (
					<Card variant="glass" padding="md" className="w-full border border-blue-400/25 bg-blue-500/10">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 text-blue-200">
								<Bell className="w-4 h-4" />
								<span className="text-sm font-semibold">
									You have {unreadCount} new update{unreadCount > 1 ? 's' : ''} about your violations.
								</span>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => navigate('/student/notifications')}
							>
								View Notifications
							</Button>
						</div>
					</Card>
				) : null}

				<Card variant="glass" padding="lg" className="w-full">
					<div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
						<h3 className="text-lg font-semibold text-white">Violation Records</h3>
						<div className="flex items-center gap-2">
							<SearchBar
								placeholder="Search violation, type, or remarks"
								className="w-72"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
							<div className="relative">
								<select
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value)}
									className="appearance-none rounded-lg border border-gray-500/30 bg-[#1a1a1a] px-3 py-2 pr-8 text-sm text-white outline-none focus:border-cyan-400"
								>
									<option value="All">All</option>
									<option value="Active">Active</option>
									<option value="Cleared">Cleared</option>
								</select>
								<div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
									<Filter className="w-4 h-4 text-gray-400" />
								</div>
							</div>
						</div>
					</div>{isLoading && !hasLoadedOnce ? (
						<div className="text-center text-gray-400 py-8">Loading violations...</div>
					) : (
						<>
							{error ? (
								<div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
									{error}
								</div>
							) : null}
							<DataTable columns={columns} data={tableData} className="mt-2" />							<Modal
								isOpen={downloadModalOpen}
								onClose={() => setDownloadModalOpen(false)}
								title="Download Violation Record"
								size="sm"
							>
								<div className="space-y-3">
									<p className="text-sm text-gray-200">Choose download format for:</p>
									<p className="text-sm font-semibold text-white">
										{selectedDownloadRecord?.violation ?? 'No violation selected'}
									</p>
									<select
										value={downloadFormat}
										onChange={(e) => setDownloadFormat(e.target.value)}
										className="w-full rounded-lg border border-gray-500/30 bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
									>
										<option value="excel">Excel</option>
										<option value="pdf">PDF</option>
									</select>
								</div>
								<ModalFooter>
									<button
										type="button"
										className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
										onClick={() => setDownloadModalOpen(false)}
									>
										Cancel
									</button>
									<button
										type="button"
										className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
										onClick={confirmDownload}
									>
										Download
									</button>
								</ModalFooter>
							</Modal>						</>
					)}
				</Card>
			</div>
		</AnimatedContent>
	);
};

export default StudentViolations;




