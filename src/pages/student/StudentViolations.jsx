import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Modal, { ModalFooter } from '../../components/ui/Modal';
import AlertModal from '../../components/ui/AlertModal';
import AnimatedContent from '../../components/ui/AnimatedContent';
import SearchBar from '../../components/ui/SearchBar';
import Button from '../../components/ui/Button';
import { Bell, Download, Filter, ChevronDown, PenTool, CheckCircle } from 'lucide-react';
import { getAuditHeaders } from '@/lib/auditHeaders';
import { cachedFetchJSON, invalidateFetchCache } from '@/lib/fetchHelper';
import SignaturePadModal from '../../components/modals/SignaturePadModal';

const EXPORT_HEADER_IMAGE_PATH = '/plpasig_header.png';

const blobToDataUrl = (blob) =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});

const getDataUrlDimensions = (dataUrl) =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
		};
		img.onerror = () => reject(new Error('Unable to load image dimensions.'));
		img.src = dataUrl;
	});

const loadImageFromDataUrl = (dataUrl) =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Unable to load image.'));
		img.src = dataUrl;
	});

const downloadCanvasAsJpeg = (canvas, filename) => {
	const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
	const link = document.createElement('a');
	link.href = dataUrl;
	link.setAttribute('download', filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

// Convert signature image to base64 data URL for exports
const getSignatureImageData = async (signatureSrc) => {
	if (!signatureSrc) return null;

	try {
		// If it's already a data URL, return it
		if (signatureSrc.startsWith('data:')) {
			return signatureSrc;
		}

		// If it's a regular URL, fetch it
		const response = await fetch(signatureSrc);
		if (!response.ok) return null;

		const blob = await response.blob();
		return await blobToDataUrl(blob);
	} catch (error) {
		console.warn('Failed to load signature image:', error);
		return null;
	}
};

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

const formatYearSemesterCell = (record) => {
	const sourceSection = String(record?.year_section || record?.yearSection || record?.student_year_section || '').trim();
	const yearMatch = sourceSection.match(/(\d)/);
	const yearLevel = yearMatch
		? `${yearMatch[1]}${Number(yearMatch[1]) === 1 ? 'ST' : Number(yearMatch[1]) === 2 ? 'ND' : Number(yearMatch[1]) === 3 ? 'RD' : 'TH'} YEAR`
		: '-';

	const semester = String(record?.semester || record?.current_semester || '').trim();
	const schoolYear = String(record?.school_year || record?.schoolYear || record?.current_school_year || '').trim();
	const term = semester && schoolYear ? `${semester} - ${schoolYear}` : semester || schoolYear || '-';

	if (yearLevel === '-' && term === '-') return '-';
	return `${yearLevel} | ${term}`;
};

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
	const [downloadFormat, setDownloadFormat] = useState('pdf');
	const [selectedDownloadRecord, setSelectedDownloadRecord] = useState(null);
	const [downloadAllModalOpen, setDownloadAllModalOpen] = useState(false);
	const [downloadAllFormat, setDownloadAllFormat] = useState('pdf');
	const [showDownloadAlertModal, setShowDownloadAlertModal] = useState(false);
	const [downloadAlertMessage, setDownloadAlertMessage] = useState("");
	const [showSignatureModal, setShowSignatureModal] = useState(false);
	const [signatureTarget, setSignatureTarget] = useState(null);
	const [signatureSuccessModal, setSignatureSuccessModal] = useState(false);
	const [isSignatureSaving, setIsSignatureSaving] = useState(false);
	const [savingSignatureId, setSavingSignatureId] = useState(null);
	const [showErrorModal, setShowErrorModal] = useState(false);
	const [errorModalMessage, setErrorModalMessage] = useState("");

	// Helper to merge updated record into state
	const mergeRecord = useCallback((updated) => {
		if (!updated) return;
		setRecords((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
	}, []);

	// Get student info from localStorage
	const getStudentInfo = useCallback(() => {
		try {
			const user = JSON.parse(localStorage.getItem('svms_user') || '{}');
			
			// Construct full year-section format (e.g., "BSIT-3B")
			let yearSection = user?.yearSection || user?.year_section || '';
			
			// If yearSection doesn't contain course info, try to construct it
			if (yearSection && !yearSection.includes('-')) {
				const course = user?.course || user?.program || user?.course_code || 'BSIT';
				yearSection = `${course}-${yearSection}`;
			}
			
			return {
				lastName: user?.lastName || user?.last_name || '',
				firstName: user?.firstName || user?.first_name || '',
				yearSection: yearSection,
				schoolId: user?.schoolId || user?.school_id || user?.schoolId || '',
			};
		} catch (_error) {
			return { lastName: '', firstName: '', yearSection: '', schoolId: '' };
		}
	}, []);

	// Resolve header image for exports
	const resolveHeaderImage = useCallback(async () => {
		try {
			const response = await fetch(EXPORT_HEADER_IMAGE_PATH);
			if (!response.ok) {
				throw new Error(`Header image not found: ${EXPORT_HEADER_IMAGE_PATH}`);
			}

			const blob = await response.blob();
			const dataUrl = await blobToDataUrl(blob);
			const dimensions = await getDataUrlDimensions(dataUrl);

			return { dataUrl, dimensions };
		} catch (_error) {
			return { dataUrl: null, dimensions: null };
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		const loadData = async ({ silent = false } = {}) => {
			try {
				if (isMounted && !silent) {
					setIsLoading(true);
					setError('');
				}

				const [recordsResp, notificationsResp] = await Promise.all([
					cachedFetchJSON('/api/student-violations/me', { headers: { ...getAuditHeaders() } }, {
						ttlMs: 12000,
						staleWhileRevalidate: true,
						forceRefresh: false,
					}),
					cachedFetchJSON('/api/notifications', { headers: { ...getAuditHeaders() } }, {
						ttlMs: 10000,
						staleWhileRevalidate: true,
						forceRefresh: false,
					}),
				]);

				const recordsData = recordsResp.data || {};
				const notificationsData = notificationsResp.data || {};

				if (isMounted) {
					if (recordsResp.status === 'ok') {
						setRecords(Array.isArray(recordsData.records) ? recordsData.records : []);
						setHasLoadedOnce(true);
					} else {
						setError(recordsResp.error || recordsData.message || 'Unable to refresh your violations.');
					}

					if (notificationsResp.status === 'ok') {
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

	const formatDateForFileName = (rawDate) => {
	const parsedDate = new Date(rawDate || new Date().toISOString());
	if (Number.isNaN(parsedDate.getTime())) {
		return new Date().toISOString().split('T')[0];
	}
	return parsedDate.toISOString().split('T')[0];
};

const formatDisplayDate = (rawDate) => {
	const parsedDate = new Date(rawDate || new Date().toISOString());
	if (Number.isNaN(parsedDate.getTime())) {
		return '-';
	}
	return parsedDate.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

const getClearedAtValue = (record) =>
	record?.cleared_at ||
	record?.clearedAt ||
	record?.clearedAtRaw ||
	record?.cleared_date ||
	record?.clearedDate ||
	'';

const isRecordCleared = (record) => {
	const statusText = String(record?.status || '').trim().toLowerCase();
	if (statusText === 'cleared') return true;
	return Boolean(getClearedAtValue(record));
};

const formatStatusForExport = (record) => {
	if (!isRecordCleared(record)) {
		return 'ACTIVE';
	}
	const clearedAt = getClearedAtValue(record);
	if (!clearedAt) {
		return 'CLEARED';
	}
	return `CLEARED (${formatDisplayDate(clearedAt)})`;
};

const deriveYearLevelFromSection = (yearSection = '') => {
	const sectionText = String(yearSection || '').trim();
	const match = sectionText.match(/(\d)/);
	if (!match) return '-';
	const yearNumber = Number(match[1]);
	if (!Number.isFinite(yearNumber)) return '-';
	const suffix = yearNumber === 1 ? 'ST' : yearNumber === 2 ? 'ND' : yearNumber === 3 ? 'RD' : 'TH';
	return `${yearNumber}${suffix} YEAR`;
};

const buildAcademicTermText = (record) => {
	const semester = String(record?.semester || record?.current_semester || '').trim();
	const schoolYear = String(record?.school_year || record?.schoolYear || record?.current_school_year || '').trim();
	if (semester && schoolYear) return `${semester} - ${schoolYear}`;
	if (semester) return semester;
	if (schoolYear) return schoolYear;
	return '-';
};

const resolveYearLevelForExport = (record, studentInfo) => {
	const sourceSection =
		record?.year_section || record?.yearSection || record?.student_year_section || studentInfo?.yearSection || '';
	return deriveYearLevelFromSection(sourceSection);
};

const formatDownloadFileName = useCallback((record, format, isAllRecords = false, studentInfo = {}) => {
	const violationSegment = isAllRecords 
		? 'Violations'
		: (record?.violation || record?.violation_label || record?.violation_name || 'Violation')
			.toString()
			.trim()
			.replace(/\s+/g, '_');
	
	const dateSegment = formatDateForFileName(record?.createdAtRaw || record?.date || new Date().toISOString());

	const sanitize = (text) =>
		String(text || '')
			.replace(/[\\/:*?"<>|]/g, '')
			.trim();

	const safeViolationSegment = sanitize(violationSegment).replace(/\s+/g, '_');
	const ext = format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'jpg';

	return `${safeViolationSegment.toLowerCase()}_${dateSegment}.${ext}`;
}, [formatDateForFileName]);

const getFilteredExportRecords = useCallback(() => {
	const query = searchTerm.trim().toLowerCase();

	return (records || []).filter((row) => {
		const status = isRecordCleared(row) ? 'Cleared' : 'Active';
		const typeText = normalizeType(row).toLowerCase();
		const violationText = String(row?.violation_label || row?.violation_name || '').toLowerCase();
		const remarksText = String(row?.remarks || '').toLowerCase();
		const yearSemesterText = formatYearSemesterCell(row).toLowerCase();

		const matchesSearch =
			!query ||
			violationText.includes(query) ||
			typeText.includes(query) ||
			remarksText.includes(query) ||
			yearSemesterText.includes(query);

		const matchesStatus = statusFilter === 'All' || status === statusFilter;
		return matchesSearch && matchesStatus;
	});
}, [records, searchTerm, statusFilter]);

const createDownload = useCallback(async (record, format) => {
	if (!record) return;

	const studentInfo = getStudentInfo();

	const normalizeStudentNumber = (value) => {
		const raw = String(value || '').trim();
		if (!raw || /^unknown$/i.test(raw) || /^n\/a$/i.test(raw) || /^na$/i.test(raw) || /^blank$/i.test(raw)) {
			return '';
		}
		return raw;
	};

	const studentNo = normalizeStudentNumber(
		studentInfo.schoolId,
	);

	const filename = formatDownloadFileName(record, format, false, studentInfo);

	if (format === 'excel') {
	try {
		const signatureSrc = record.signature || record.signature_image || record.signatureImage || '';
		const [signatureImageData, { Workbook }, headerImage] = await Promise.all([
			getSignatureImageData(signatureSrc),
			import('exceljs'),
			resolveHeaderImage(),
		]);

		const workbook = new Workbook();
		const sheet = workbook.addWorksheet('Violation Slip');

		sheet.pageSetup = {
			orientation: 'landscape',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 1,
			horizontalCentered: true,
		};

		sheet.columns = [
			{ width: 3 },
			{ width: 18 },
			{ width: 18 },
			{ width: 18 },
			{ width: 18 },
			{ width: 18 },
			{ width: 18 },
			{ width: 18 },
			{ width: 3 },
		];

		for (let row = 1; row <= 34; row += 1) {
			sheet.getRow(row).height = row <= 6 ? 18 : 20;
		}

		sheet.mergeCells('B1:H5');
		if (headerImage.dataUrl && headerImage.dimensions) {
			const headerRegionWidthPx = [2, 3, 4, 5, 6, 7, 8].reduce(
				(total, colIndex) => total + (Number(sheet.getColumn(colIndex).width || 18) * 7.5),
				0,
			);
			const headerRegionHeightPx = [1, 2, 3, 4, 5].reduce(
				(total, rowNumber) => total + (Number(sheet.getRow(rowNumber).height || 18) * 1.333),
				0,
			);
			const imageScale = Math.min(
				(headerRegionWidthPx - 12) / headerImage.dimensions.width,
				(headerRegionHeightPx - 6) / headerImage.dimensions.height,
				1.25,
			);
			const headerWidth = Math.max(8, Math.round(headerImage.dimensions.width * imageScale));
			const headerHeight = Math.max(8, Math.round(headerImage.dimensions.height * imageScale));
			const leftOffsetPx = Math.max((headerRegionWidthPx - headerWidth) / 2, 0);
			const topOffsetPx = Math.max((headerRegionHeightPx - headerHeight) / 2, 0);
			const colPx = (sheet.getColumn(2).width || 18) * 7.5;
			const rowPx = Number(sheet.getRow(1).height || 18) * 1.333;
			const headerId = workbook.addImage({ base64: headerImage.dataUrl, extension: 'png' });
			sheet.addImage(headerId, {
				tl: { col: 1 + leftOffsetPx / colPx, row: topOffsetPx / rowPx },
				ext: { width: headerWidth, height: headerHeight },
			});
		}

		sheet.mergeCells('B7:H7');
		sheet.getCell('B7').value = 'STUDENT VIOLATION REPORT';
		sheet.getCell('B7').font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF111827' } };
		sheet.getCell('B7').alignment = { horizontal: 'center', vertical: 'middle' };

		const violationText = record.violation || record.violation_label || record.violation_name || '-';
		const rawRemarks = record.remarks || '-';
		const remarksText = String(rawRemarks).trim() === '-' ? '' : rawRemarks;
		const reportedBy = record.reportedBy || record.reported_by || '-';
		const programYearSection = studentInfo.yearSection || '';
		const studentName = `${studentInfo.lastName || ''}, ${studentInfo.firstName || ''}`
			.replace(/^,\s*|\s*,\s*$/g, '')
			.trim() || '-';

		const applyBorder = (range, style = 'thin') => {
			const [start, end] = range.split(':');
			const startCol = start.charCodeAt(0);
			const endCol = end.charCodeAt(0);
			const startRow = Number(start.slice(1));
			const endRow = Number(end.slice(1));

			for (let row = startRow; row <= endRow; row += 1) {
				for (let col = startCol; col <= endCol; col += 1) {
					const cell = sheet.getCell(`${String.fromCharCode(col)}${row}`);
					cell.border = {
						top: { style },
						bottom: { style },
						left: { style },
						right: { style },
					};
				}
			}
		};

		// Main student information box (two-column layout like the sample).
		sheet.mergeCells('B8:H11');
		applyBorder('B8:H11');
		sheet.getCell('E8').border = { left: { style: 'thin' } };
		sheet.getCell('E9').border = { left: { style: 'thin' } };
		sheet.getCell('E10').border = { left: { style: 'thin' } };
		sheet.getCell('E11').border = { left: { style: 'thin' } };

		sheet.mergeCells('B9:D9');
		sheet.getCell('B9').value = {
			richText: [
				{ text: 'Date: ', font: { name: 'Calibri', size: 12, bold: true } },
				{ text: formatDisplayDate(record.createdAtRaw || record.date), font: { name: 'Calibri', size: 12 } },
			],
		};

		sheet.mergeCells('E9:H9');
		sheet.getCell('E9').value = {
			richText: [
				{ text: 'Student No: ', font: { name: 'Calibri', size: 12, bold: true } },
				{ text: studentNo || '-', font: { name: 'Calibri', size: 12 } },
			],
		};

		sheet.mergeCells('B10:D10');
		sheet.getCell('B10').value = {
			richText: [
				{ text: 'Name: ', font: { name: 'Calibri', size: 12, bold: true } },
				{ text: studentName, font: { name: 'Calibri', size: 12 } },
			],
		};

		sheet.mergeCells('E10:H10');
		sheet.getCell('E10').value = {
			richText: [
				{ text: 'Program/Section: ', font: { name: 'Calibri', size: 12, bold: true } },
				{ text: programYearSection || '-', font: { name: 'Calibri', size: 12 } },
			],
		};

		// Violation section.
		sheet.mergeCells('B13:H13');
		sheet.getCell('B13').value = 'VIOLATION';
		sheet.getCell('B13').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF111827' } };
		sheet.getCell('B13').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFE5E7EB' },
		};
		sheet.getCell('B13').alignment = { horizontal: 'left', vertical: 'middle' };
		applyBorder('B13:H13');

		sheet.mergeCells('B14:H16');
		sheet.getCell('B14').value = violationText;
		sheet.getCell('B14').font = { name: 'Calibri', size: 12, color: { argb: 'FF111827' } };
		sheet.getCell('B14').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
		applyBorder('B14:H16');

		// Remarks section.
		sheet.mergeCells('B18:H18');
		sheet.getCell('B18').value = 'REMARKS';
		sheet.getCell('B18').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF111827' } };
		sheet.getCell('B18').fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFE5E7EB' },
		};
		sheet.getCell('B18').alignment = { horizontal: 'left', vertical: 'middle' };
		applyBorder('B18:H18');

		sheet.mergeCells('B19:H22');
		sheet.getCell('B19').value = remarksText;
		sheet.getCell('B19').font = { name: 'Calibri', size: 12, color: { argb: 'FF111827' } };
		sheet.getCell('B19').alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
		applyBorder('B19:H22');

		sheet.mergeCells('B24:H24');
		sheet.getCell('B24').value = 'STUDENT COPY';
		sheet.getCell('B24').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF4B5563' } };
		sheet.getCell('B24').alignment = { horizontal: 'center', vertical: 'middle' };
		sheet.getCell('B24').border = { top: { style: 'thin' } };

		// Signature area.
		sheet.mergeCells('B26:D26');
		sheet.getCell('B26').value = 'Student Signature';
		sheet.getCell('B26').font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
		sheet.getCell('B26').alignment = { horizontal: 'left', vertical: 'bottom' };

		sheet.mergeCells('E26:H26');
		sheet.getCell('E26').value = 'Reported By';
		sheet.getCell('E26').font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
		sheet.getCell('E26').alignment = { horizontal: 'left', vertical: 'bottom' };

		sheet.mergeCells('B27:D27');
		sheet.mergeCells('E27:H27');
		sheet.getCell('B27').border = { bottom: { style: 'thin' } };
		sheet.getCell('E27').border = { bottom: { style: 'thin' } };

		if (signatureImageData) {
			const signatureImageId = workbook.addImage({ base64: signatureImageData, extension: 'png' });
			sheet.addImage(signatureImageId, {
				tl: { col: 1.2, row: 25.6 },
				ext: { width: 120, height: 26 },
			});
		}

		sheet.getCell('E27').value = reportedBy || '-';
		sheet.getCell('E27').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF111827' } };
		sheet.getCell('E27').alignment = { horizontal: 'left', vertical: 'bottom' };

		sheet.mergeCells('E28:H28');
		sheet.getCell('E28').value = 'Printed Name';
		sheet.getCell('E28').font = { name: 'Calibri', size: 10, color: { argb: 'FF4B5563' } };
		sheet.getCell('E28').alignment = { horizontal: 'left', vertical: 'top' };

		const contentCells = ['B9', 'E9', 'B10', 'E10', 'B14', 'B19'];
		contentCells.forEach((cellRef) => {
			const cell = sheet.getCell(cellRef);
			cell.alignment = { ...(cell.alignment || {}), wrapText: true };
		});

		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.setAttribute('download', filename);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Excel export failed', error);
		alert('Unable to generate Excel download.');
	}
	return;
}
if (format === 'pdf') {
	try {
		const signatureSrc = record.signature || record.signature_image || record.signatureImage || '';
		const [signatureImageData, { jsPDF }, headerImage] = await Promise.all([
			getSignatureImageData(signatureSrc),
			import('jspdf'),
			resolveHeaderImage(),
		]);

		const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
		const pageWidth = doc.internal.pageSize.getWidth();
		const margin = 14;
		const contentWidth = pageWidth - margin * 2;
		let cursorY = 10;

		if (headerImage.dataUrl && headerImage.dimensions) {
			const imageScale = Math.min(1.25, contentWidth / headerImage.dimensions.width);
			const headerWidth = Math.round(headerImage.dimensions.width * imageScale);
			const headerHeight = Math.min(Math.round(headerImage.dimensions.height * imageScale), 50);
			const headerX = margin + (contentWidth - headerWidth) / 2;
			doc.addImage(headerImage.dataUrl, 'PNG', headerX, cursorY, headerWidth, headerHeight);
			cursorY += headerHeight + 6;
		}

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(16);
		doc.text('STUDENT VIOLATION REPORT', pageWidth / 2, cursorY + 2, { align: 'center' });
		cursorY += 7;

		const violationText = record.violation || record.violation_label || record.violation_name || '-';
		const rawRemarks = record.remarks || '-';
		const remarksText = String(rawRemarks).trim() === '-' ? '' : rawRemarks;
		const reportedBy = record.reportedBy || record.reported_by || '-';
		const programYearSection = studentInfo.yearSection || '-';
		const yearLevelText = resolveYearLevelForExport(record, studentInfo);
		const academicTermText = buildAcademicTermText(record);
		const statusText = formatStatusForExport(record);
		const studentName = `${studentInfo.lastName || ''}, ${studentInfo.firstName || ''}`
			.replace(/^,\s*|\s*,\s*$/g, '')
			.trim() || '-';

		const drawLabelValue = (x, y, label, value, maxWidth = 62) => {
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(11);
			doc.text(label, x, y);
			const offset = doc.getTextWidth(label) + 2;
			doc.setFont('helvetica', 'normal');
			doc.text(String(value || '-'), x + offset, y, { maxWidth });
		};

		// Student info box.
		const infoY = cursorY;
		const infoH = 24;
		const midX = margin + contentWidth / 2;
		doc.setDrawColor(203, 213, 225);
		doc.setLineWidth(0.3);
		doc.rect(margin, infoY, contentWidth, infoH);
		doc.line(midX, infoY + 4, midX, infoY + infoH - 4);
		doc.line(margin + 4, infoY + 8, midX - 4, infoY + 8);
		doc.line(margin + 4, infoY + 16, midX - 4, infoY + 16);
		doc.line(midX + 4, infoY + 8, margin + contentWidth - 4, infoY + 8);
		doc.line(midX + 4, infoY + 16, margin + contentWidth - 4, infoY + 16);

		drawLabelValue(margin + 6, infoY + 5, 'Date:', formatDisplayDate(record.createdAtRaw || record.date), 54);
		drawLabelValue(midX + 6, infoY + 5, 'Student No:', studentNo || '-', 54);
		drawLabelValue(margin + 6, infoY + 12, 'Name:', studentName, 54);
		drawLabelValue(midX + 6, infoY + 12, 'Program/Section:', programYearSection, 54);
		drawLabelValue(margin + 6, infoY + 19, 'Year Level:', yearLevelText, 54);
		drawLabelValue(midX + 6, infoY + 19, 'Semester/S.Y.:', academicTermText, 54);
		cursorY = infoY + infoH + 8;

		// VIOLATION section.
		const sectionHeaderH = 7;
		doc.setFillColor(229, 231, 235);
		doc.rect(margin, cursorY, contentWidth, sectionHeaderH, 'F');
		doc.rect(margin, cursorY, contentWidth, sectionHeaderH);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.text('VIOLATION', margin + 6, cursorY + 4.5);

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		const violationLines = doc.splitTextToSize(String(violationText), contentWidth - 12).slice(0, 5);
		const violationBodyH = 14;
		doc.rect(margin, cursorY + sectionHeaderH, contentWidth, violationBodyH);
		doc.text(violationLines, margin + 6, cursorY + sectionHeaderH + 5);
		cursorY += sectionHeaderH + violationBodyH + 3;

		// REMARKS section.
		doc.setFillColor(229, 231, 235);
		doc.rect(margin, cursorY, contentWidth, sectionHeaderH, 'F');
		doc.rect(margin, cursorY, contentWidth, sectionHeaderH);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.text('REMARKS', margin + 6, cursorY + 4.5);

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		const remarksLines = doc.splitTextToSize(String(remarksText), contentWidth - 12).slice(0, 6);
		const remarksBodyH = 18;
		doc.rect(margin, cursorY + sectionHeaderH, contentWidth, remarksBodyH);
		doc.text(remarksLines, margin + 6, cursorY + sectionHeaderH + 5);
		cursorY += sectionHeaderH + remarksBodyH + 3;

		doc.setFillColor(248, 250, 252);
		doc.rect(margin, cursorY, contentWidth, 8, 'F');
		doc.rect(margin, cursorY, contentWidth, 8);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.text('STATUS:', margin + 6, cursorY + 5);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		doc.text(`${statusText}   |   Reported By: ${reportedBy || '-'}`, margin + 30, cursorY + 5, { maxWidth: contentWidth - 36 });
		cursorY += 10;

		doc.setDrawColor(203, 213, 225);
		doc.line(margin, cursorY, margin + contentWidth, cursorY);
		cursorY += 2;

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.setTextColor(75, 85, 99);
		doc.text('STUDENT COPY', pageWidth / 2, cursorY, { align: 'center' });
		doc.setTextColor(0, 0, 0);
		cursorY += 3;

		const leftColX = margin + 6;
		const rightColX = margin + contentWidth / 2 + 6;
		const farRightX = margin + contentWidth - 50; // Very far right corner
		const signLineY = cursorY + 12;

		// Draw signature area with single line on the FAR RIGHT corner
		doc.setDrawColor(0, 0, 0);
		doc.setLineWidth(0.3);

		if (signatureImageData) {
			// Center signature image in the line (35mm line, 20mm image)
			doc.addImage(signatureImageData, 'PNG', farRightX + 7.5, cursorY, 20, 8);
		}

		// Draw single line for signature (35mm - same as JPEG ratio)
		doc.line(farRightX, signLineY, farRightX + 35, signLineY);

		// Center SIGNATURE text BELOW the line
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(9);
		const signatureLineX = farRightX + 17.5; // Center of the line
		doc.text('STUDENT SIGNATURE', signatureLineX, signLineY + 4, { align: 'center' });

		doc.save(filename);
	} catch (error) {
		console.error('PDF export failed', error);
		alert('Unable to generate PDF download.');
	}
}
if (format === 'jpeg') {
	try {
		const signatureSrc = record.signature || record.signature_image || record.signatureImage || '';
		const [signatureImageData, headerImage] = await Promise.all([
			getSignatureImageData(signatureSrc),
			resolveHeaderImage(),
		]);

		const canvas = document.createElement('canvas');
		canvas.width = 2000;
		const violationText = record.violation || record.violation_label || record.violation_name || '-';
		const rawRemarks = record.remarks || '-';
		const remarksText = String(rawRemarks).trim() === '-' ? '' : rawRemarks;
		canvas.height = 1800;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Unable to initialize image canvas.');

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		let y = 40;
		if (headerImage.dataUrl) {
			const headerImg = await loadImageFromDataUrl(headerImage.dataUrl);
			const headerWidth = 1800;
			const headerHeight = Math.round((headerImg.height / headerImg.width) * headerWidth);
			ctx.drawImage(headerImg, 100, y, headerWidth, headerHeight);
			y += headerHeight + 30;
		}

		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 48px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('STUDENT VIOLATION REPORT', 1000, y + 50);
		y += 90;

		const reportedBy = record.reportedBy || record.reported_by || '-';
		const programYearSection = studentInfo.yearSection || '-';
		const yearLevelText = resolveYearLevelForExport(record, studentInfo);
		const academicTermText = buildAcademicTermText(record);
		const statusText = formatStatusForExport(record);
		const studentName = `${studentInfo.lastName || ''}, ${studentInfo.firstName || ''}`
			.replace(/^,\s*|\s*,\s*$/g, '')
			.trim() || '-';

		const drawWrappedText = (text, x, startY, maxWidth, lineHeight) => {
			const words = String(text || '').split(/\s+/).filter(Boolean);
			let line = '';
			let currentY = startY;
			words.forEach((word) => {
				const testLine = line ? `${line} ${word}` : word;
				if (ctx.measureText(testLine).width > maxWidth && line) {
					ctx.fillText(line, x, currentY);
					line = word;
					currentY += lineHeight;
				} else {
					line = testLine;
				}
			});
			if (line) {
				ctx.fillText(line, x, currentY);
			}
			return currentY;
		};

		ctx.textAlign = 'left';
		ctx.strokeStyle = '#cbd5e1';
		ctx.lineWidth = 2;
		ctx.strokeRect(100, y, 1800, 220);
		ctx.beginPath();
		ctx.moveTo(1000, y);
		ctx.lineTo(1000, y + 220);
		ctx.stroke();
		
		// Draw horizontal separator lines
		ctx.beginPath();
		ctx.moveTo(100, y + 65);
		ctx.lineTo(1900, y + 65);
		ctx.stroke();
		
		ctx.beginPath();
		ctx.moveTo(100, y + 135);
		ctx.lineTo(1900, y + 135);
		ctx.stroke();
		
		ctx.beginPath();
		ctx.moveTo(100, y + 205);
		ctx.lineTo(1900, y + 205);
		ctx.stroke();

		// Draw bold labels and regular values with measured spacing (like PDF)
		ctx.fillStyle = '#111827';
		const measureTextWidth = (text, font) => {
			ctx.font = font;
			return ctx.measureText(text).width;
		};
		const spacingAfterLabel = 15; // Consistent spacing between label and value
		
		ctx.font = 'bold 28px Arial';
		let labelWidth, textX = 130;
		
		// Date row
		labelWidth = measureTextWidth('Date:', 'bold 28px Arial');
		ctx.fillText('Date:', textX, y + 55);
		ctx.font = '28px Arial';
		ctx.fillText(formatDisplayDate(record.createdAtRaw || record.date), textX + labelWidth + spacingAfterLabel, y + 55);
		
		// Student No row
		ctx.font = 'bold 28px Arial';
		textX = 1030;
		labelWidth = measureTextWidth('Student No:', 'bold 28px Arial');
		ctx.fillText('Student No:', textX, y + 55);
		ctx.font = '28px Arial';
		ctx.fillText(studentNo || '-', textX + labelWidth + spacingAfterLabel, y + 55);
		
		// Name row
		ctx.font = 'bold 28px Arial';
		textX = 130;
		labelWidth = measureTextWidth('Name:', 'bold 28px Arial');
		ctx.fillText('Name:', textX, y + 125);
		ctx.font = '28px Arial';
		ctx.fillText(studentName, textX + labelWidth + spacingAfterLabel, y + 125);
		
		// Program/Section row
		ctx.font = 'bold 28px Arial';
		textX = 1030;
		labelWidth = measureTextWidth('Program/Section:', 'bold 28px Arial');
		ctx.fillText('Program/Section:', textX, y + 125);
		ctx.font = '28px Arial';
		ctx.fillText(programYearSection, textX + labelWidth + spacingAfterLabel, y + 125);
		
		// Year Level row
		ctx.font = 'bold 28px Arial';
		textX = 130;
		labelWidth = measureTextWidth('Year Level:', 'bold 28px Arial');
		ctx.fillText('Year Level:', textX, y + 195);
		ctx.font = '28px Arial';
		ctx.fillText(yearLevelText, textX + labelWidth + spacingAfterLabel, y + 195);
		
		// Semester/S.Y. row
		ctx.font = 'bold 28px Arial';
		textX = 1030;
		labelWidth = measureTextWidth('Semester/S.Y.:', 'bold 28px Arial');
		ctx.fillText('Semester/S.Y.:', textX, y + 195);
		ctx.font = '28px Arial';
		ctx.fillText(academicTermText, textX + labelWidth + spacingAfterLabel, y + 195);

		y += 255;
		ctx.fillStyle = '#e5e7eb';
		ctx.fillRect(100, y, 1800, 54);
		ctx.strokeRect(100, y, 1800, 54);
		ctx.fillStyle = '#111827';
		ctx.font = 'bold 30px Arial';
		ctx.fillText('VIOLATION', 130, y + 36);

		y += 54;
		ctx.strokeRect(100, y, 1800, 110);
		ctx.font = '24px Arial';
		drawWrappedText(violationText, 130, y + 38, 1740, 30);

		y += 140;
		ctx.fillStyle = '#e5e7eb';
		ctx.fillRect(100, y, 1800, 54);
		ctx.strokeRect(100, y, 1800, 54);
		ctx.fillStyle = '#111827';
		ctx.font = 'bold 30px Arial';
		ctx.fillText('REMARKS', 130, y + 36);

		y += 54;
		ctx.strokeRect(100, y, 1800, 140);
		ctx.font = '24px Arial';
		drawWrappedText(remarksText || '-', 130, y + 38, 1740, 30);

		y += 165;
		ctx.fillStyle = '#f8fafc';
		ctx.fillRect(100, y, 1800, 54);
		ctx.strokeStyle = '#cbd5e1';
		ctx.strokeRect(100, y, 1800, 54);
		ctx.fillStyle = '#111827';
		ctx.font = 'bold 28px Arial';
		ctx.textAlign = 'left';
		ctx.fillText('STATUS:', 130, y + 36);
		ctx.font = '24px Arial';
		ctx.fillText(`${statusText}  |  Reported By: ${reportedBy || '-'}`, 330, y + 36);

		// STUDENT COPY section with signature on the FAR RIGHT corner
		y += 80;
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 24px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('STUDENT COPY', 1000, y);

		y += 50;
		ctx.textAlign = 'right';

		// Draw signature image if available on the FAR RIGHT corner
		const signatureLineLength = 250; // 250px line
		const signatureImageWidth = 150; // Image size
		const signatureStartX = 1900 - signatureLineLength - 20; // Far right with margin
		
		if (signatureImageData) {
			try {
				const signatureImg = await loadImageFromDataUrl(signatureImageData);
				// Center image within the signature area
				const imageX = signatureStartX + (signatureLineLength - signatureImageWidth) / 2;
				ctx.drawImage(signatureImg, imageX, y, signatureImageWidth, 50);
			} catch (err) {
				console.error('Failed to load signature image in JPEG:', err);
			}
		}

		y += 70;
		ctx.strokeStyle = '#111827';
		ctx.lineWidth = 2;
		// Draw single line for signature on the FAR RIGHT (250px - same ratio as PDF)
		ctx.beginPath();
		ctx.moveTo(signatureStartX, y);
		ctx.lineTo(signatureStartX + signatureLineLength, y);
		ctx.stroke();

		// Center SIGNATURE text BELOW the line
		ctx.fillStyle = '#111827';
		ctx.font = 'bold 18px Arial';
		ctx.textAlign = 'center';
		ctx.fillText('STUDENT SIGNATURE', signatureStartX + signatureLineLength / 2, y + 20);

		downloadCanvasAsJpeg(canvas, filename);
	} catch (error) {
		console.error('JPEG export failed', error);
		alert('Unable to generate JPEG download.');
	}
}
}, [formatDownloadFileName, getStudentInfo, resolveHeaderImage]);

	const triggerDownloadModal = useCallback((record) => {
		setSelectedDownloadRecord(record);
		setDownloadFormat('pdf');
		setDownloadModalOpen(true);
	}, []);

	const confirmDownload = useCallback(() => {
		if (!selectedDownloadRecord) return;
		createDownload(selectedDownloadRecord, downloadFormat);
		setDownloadModalOpen(false);
	}, [createDownload, downloadFormat, selectedDownloadRecord]);

	const createDownloadAll = useCallback(async (format) => {
		if (!records || records.length === 0) {
			setDownloadAlertMessage("There's no violations to export.");
			setShowDownloadAlertModal(true);
			return;
		}

		const studentInfo = getStudentInfo();

		// Get the first record to extract violation information (if needed)
		const firstRecord = records[0];
		const sheetData = records.map((record, index) => ({
			No: index + 1,
			Date: formatDisplayDate(record.created_at || record.date),
			'Year/Semester': `${resolveYearLevelForExport(record, studentInfo)} | ${buildAcademicTermText(record)}`,
			Violation: record.violation_label || record.violation_name || '-',
			'Reported by': record.reported_by || '-',
			Remarks: record.remarks || '-',
			Signature: record.signature || record.signature_image || record.signatureImage || '',
			Status: formatStatusForExport(record),
		}));

		const filename = formatDownloadFileName(firstRecord, format, true, studentInfo);

		if (format === 'excel') {
			try {
				// Process signature images for all records
				const signaturePromises = records.map(record => 
					getSignatureImageData(record.signature || record.signature_image || record.signatureImage || '')
				);
				const signatureImages = await Promise.all(signaturePromises);
				
				const [{ Workbook }, { dataUrl, dimensions }] = await Promise.all([
					import('exceljs'),
					resolveHeaderImage(),
				]);
				const workbook = new Workbook();
				const sheet = workbook.addWorksheet('All Violations', {
					views: [{ state: 'frozen', ySplit: 8 }],
				});

					sheet.columns = [
						{ key: 'No', width: 8 },
						{ key: 'Date', width: 16 },
						{ key: 'Year/Semester', width: 24 },
						{ key: 'Violation', width: 36 },
						{ key: 'Reported by', width: 22 },
						{ key: 'Remarks', width: 26 },
						{ key: 'Signature', width: 18 },
						{ key: 'Status', width: 22 },
					];

		sheet.mergeCells('A1:H9');
		sheet.mergeCells('A10:H10');
		sheet.mergeCells('A11:H11');
		sheet.pageSetup = {
			orientation: 'landscape',
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
		};
		for (let i = 1; i <= 9; i += 1) {
			sheet.getRow(i).height = 35;
		}
		sheet.getRow(10).height = 28;
		sheet.getRow(11).height = 20;
		sheet.getRow(12).height = 24;

		// Add header image if available
		if (dataUrl && dimensions) {
			const headerRegionWidthPx = [1, 2, 3, 4, 5, 6, 7, 8].reduce(
				(total, colIndex) => total + (Number(sheet.getColumn(colIndex).width || 10) * 7.5),
				0,
			);
			const headerRegionHeightPx = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce(
				(total, rowNumber) => total + (Number(sheet.getRow(rowNumber).height || 15) * 1.333),
				0,
			);
			const imageScale = Math.min(
				(headerRegionWidthPx - 24) / dimensions.width,
				(headerRegionHeightPx - 12) / dimensions.height,
				1.25,
			);
			const imageWidthPx = Math.max(8, Math.round(dimensions.width * imageScale));
			const imageHeightPx = Math.max(8, Math.round(dimensions.height * imageScale));
			const leftOffsetPx = (headerRegionWidthPx - imageWidthPx) / 2;
			const topOffsetPx = (headerRegionHeightPx - imageHeightPx) / 2;

			// Calculate exact column and row positions with better precision
			const toColCoordinate = (pixelOffset) => {
				let colIndex = 0;
				let accumulatedPx = 0;
				for (let i = 1; i <= 8; i += 1) {
					const colWidth = sheet.getColumn(i).width || 15;
					const colPx = colWidth * 7.5;
					if (accumulatedPx + colPx >= pixelOffset) {
						const offsetInCol = pixelOffset - accumulatedPx;
						return (i - 1) + (offsetInCol / colPx);
					}
					accumulatedPx += colPx;
					colIndex = i;
				}
				return colIndex - 1;
			};

			const toRowCoordinate = (pixelOffset) => {
				let rowIndex = 0;
				let accumulatedPx = 0;
				for (let i = 1; i <= 9; i += 1) {
					const rowPx = Number(sheet.getRow(i).height || 15) * 1.333;
					if (accumulatedPx + rowPx >= pixelOffset) {
						const offsetInRow = pixelOffset - accumulatedPx;
						return (i - 1) + (offsetInRow / rowPx);
					}
					accumulatedPx += rowPx;
					rowIndex = i;
				}
				return rowIndex - 1;
			};

			const imageId = workbook.addImage({ base64: dataUrl, extension: 'png' });
			sheet.addImage(imageId, {
					tl: {
						col: toColCoordinate(leftOffsetPx),
						row: toRowCoordinate(topOffsetPx),
					},
					ext: {
						width: imageWidthPx,
						height: imageHeightPx,
					},
				});

		const titleCell = sheet.getCell('A10');
			titleCell.value = 'STUDENT VIOLATION REPORT';
			titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF000000' } };
			titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

		const subtitleCell = sheet.getCell('A11');
			const generatedDateRaw = new Date();
			const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
			const day = generatedDateRaw.getDate();
			const year = generatedDateRaw.getFullYear();
			const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
			subtitleCell.value = `Generated: ${month} ${day}, ${year}, ${time}`;
			subtitleCell.font = { name: 'Calibri', size: 12, color: { argb: 'FF4B5563' } };
			subtitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

				const headerRowNumber = 12;
				const headerRow = sheet.getRow(headerRowNumber);
				headerRow.values = Object.keys(sheetData[0]);
				headerRow.height = 24;

				headerRow.eachCell((cell) => {
					cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
					cell.fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: 'FF0F172A' },
					};
					cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
					cell.border = {
						top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
					};
				});

				const dataRowStart = headerRowNumber + 1;
				sheetData.forEach((row, index) => {
					const excelRow = sheet.getRow(dataRowStart + index);
					excelRow.values = Object.values(row);
					excelRow.height = 28;

					const shouldAlternate = index % 2 === 1;
					excelRow.eachCell((cell, cellNum) => {
						cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
						if (shouldAlternate) {
							cell.fill = {
								type: 'pattern',
								pattern: 'solid',
								fgColor: { argb: 'FFF8FAFC' },
							};
						}
						// Center align No and Signature columns
						if ([1, 7].includes(cellNum)) {
							cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
						} else {
							cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
						}
						cell.border = {
							top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						};
					});

					// Add signature image if available for this row
					if (signatureImages[index]) {
						const signatureImageId = workbook.addImage({ base64: signatureImages[index], extension: 'png' });
						const signatureColIndex = 7;
						const signatureRowIndex = dataRowStart + index;

						// Calculate position for signature image (centered in the cell)
						const colWidthPx = sheet.getColumn(signatureColIndex).width * 7.5;
						const rowHeightPx = sheet.getRow(signatureRowIndex).height * 1.333;

						// Scale signature to fit in cell (max 80% of cell size)
						const maxWidth = colWidthPx * 0.8;
						const maxHeight = rowHeightPx * 0.8;

						// For now, use fixed size that fits well in the cell
						const sigWidth = Math.min(maxWidth, 80);
						const sigHeight = Math.min(maxHeight, 24);

						const sigLeftOffset = (colWidthPx - sigWidth) / 2;
						const sigTopOffset = (rowHeightPx - sigHeight) / 2;

						const toColCoordinateForSig = (pixelOffset) => {
							let remaining = pixelOffset;
							const colWidth = sheet.getColumn(signatureColIndex).width || 15;
							const colPx = colWidth * 7.5;
							if (remaining <= colPx) {
								return (signatureColIndex - 1) + remaining / colPx;
							}
							return signatureColIndex - 1;
						};

						const toRowCoordinateForSig = (pixelOffset) => {
							let remaining = pixelOffset;
							const rowPx = Number(sheet.getRow(signatureRowIndex).height || 15) * 1.333;
							if (remaining <= rowPx) {
								return (signatureRowIndex - 1) + remaining / rowPx;
							}
							return signatureRowIndex - 1;
						};

						sheet.addImage(signatureImageId, {
							tl: {
								col: toColCoordinateForSig(sigLeftOffset),
								row: toRowCoordinateForSig(sigTopOffset),
							},
							ext: {
								width: sigWidth,
								height: sigHeight,
							},
						});

						// Clear the text in the signature cell since we have an image
						const signatureCell = sheet.getCell(`${String.fromCharCode(65 + signatureColIndex - 1)}${signatureRowIndex}`);
						signatureCell.value = '';
					}
				});

				// Student metadata is now shown above the table.
		} else {
				// Fallback if header image not available
sheet.mergeCells('A1:H3');
		sheet.mergeCells('A4:H4');
		sheet.mergeCells('A5:H5');
		sheet.getRow(1).height = 40;
		sheet.getRow(2).height = 40;
		sheet.getRow(3).height = 40;
		sheet.getRow(4).height = 35;
		sheet.getRow(5).height = 28;
		const titleCell = sheet.getCell('A4');
		titleCell.value = 'STUDENT VIOLATION REPORT';
		titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FF000000' } };
		titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

		const subtitleCell = sheet.getCell('A5');
				const generatedDateRaw = new Date();
				const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
				const day = generatedDateRaw.getDate();
				const year = generatedDateRaw.getFullYear();
				const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
				subtitleCell.value = `Generated: ${month} ${day}, ${year}, ${time}`;
				subtitleCell.font = { name: 'Calibri', size: 12, color: { argb: 'FF4B5563' } };
				subtitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

				sheet.addRow([]);
				sheet.addRow([`Name: ${studentInfo.lastName.toUpperCase()}, ${studentInfo.firstName.toUpperCase()}`]);
				sheet.addRow([`Current Year/Section: ${studentInfo.yearSection || '-'}`]);
				sheet.addRow([]);
				const headerRow = sheet.addRow(Object.keys(sheetData[0]));
				headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
				headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
				headerRow.eachCell((cell) => {
					cell.fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: 'FF0F172A' },
					};
					cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
					cell.border = {
						top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
					};
				});

				const currentRowNumber = sheet.lastRow?.number || 7;
				const dataRowStart = currentRowNumber + 1;
				sheetData.forEach((row, index) => {
					const excelRow = sheet.addRow(Object.values(row));
					excelRow.height = 28;
					const shouldAlternate = index % 2 === 1;
					excelRow.eachCell((cell, cellNum) => {
						cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1F2937' } };
						if (shouldAlternate) {
							cell.fill = {
								type: 'pattern',
								pattern: 'solid',
								fgColor: { argb: 'FFF8FAFC' },
							};
						}
						// Center align No and Signature columns
						if ([1, 7].includes(cellNum)) {
							cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
						} else {
							cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
						}
						cell.border = {
							top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
							right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
						};
					});

					// Add signature image if available for this row
					if (signatureImages[index]) {
						const signatureImageId = workbook.addImage({ base64: signatureImages[index], extension: 'png' });
						const signatureColIndex = 7;
						const signatureRowIndex = dataRowStart + index;

						// Calculate position for signature image (centered in the cell)
						const colWidthPx = sheet.getColumn(signatureColIndex).width * 7.5;
						const rowHeightPx = sheet.getRow(signatureRowIndex).height * 1.333;

						// Scale signature to fit in cell (max 80% of cell size)
						const maxWidth = colWidthPx * 0.8;
						const maxHeight = rowHeightPx * 0.8;

						// For now, use fixed size that fits well in the cell
						const sigWidth = Math.min(maxWidth, 80);
						const sigHeight = Math.min(maxHeight, 24);

						const sigLeftOffset = (colWidthPx - sigWidth) / 2;
						const sigTopOffset = (rowHeightPx - sigHeight) / 2;

						const toColCoordinateForSig = (pixelOffset) => {
							let remaining = pixelOffset;
							const colWidth = sheet.getColumn(signatureColIndex).width || 15;
							const colPx = colWidth * 7.5;
							if (remaining <= colPx) {
								return (signatureColIndex - 1) + remaining / colPx;
							}
							return signatureColIndex - 1;
						};

						const toRowCoordinateForSig = (pixelOffset) => {
							let remaining = pixelOffset;
							const rowPx = Number(sheet.getRow(signatureRowIndex).height || 15) * 1.333;
							if (remaining <= rowPx) {
								return (signatureRowIndex - 1) + remaining / rowPx;
							}
							return signatureRowIndex - 1;
						};

						sheet.addImage(signatureImageId, {
							tl: {
								col: toColCoordinateForSig(sigLeftOffset),
								row: toRowCoordinateForSig(sigTopOffset),
							},
							ext: {
								width: sigWidth,
								height: sigHeight,
							},
						});

						// Clear the text in the signature cell since we have an image
						const signatureCell = sheet.getCell(`${String.fromCharCode(65 + signatureColIndex - 1)}${signatureRowIndex}`);
						signatureCell.value = '';
					}
				});

				// Student metadata is now shown above the table.
			}

			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', filename);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Excel export failed', error);
			alert('Unable to generate Excel download.');
		}
		} else if (format === 'pdf') {
			try {
				// Process signature images for all records
				const signaturePromises = records.map(record => 
					getSignatureImageData(record.signature || record.signature_image || record.signatureImage || '')
				);
				const signatureImages = await Promise.all(signaturePromises);
				
				const [{ jsPDF }, { default: autoTable }, headerImage] = await Promise.all([
					import('jspdf'),
					import('jspdf-autotable'),
					resolveHeaderImage(),
				]);
				const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
				const pageWidth = doc.internal.pageSize.getWidth();
				const tableMarginLeft = 5;
				const tableMarginRight = 5;
				const tableWidth = pageWidth - tableMarginLeft - tableMarginRight;
				const tableCenterX = tableMarginLeft + tableWidth / 2;
			let startY = 20;

			// Add header image if available
			if (headerImage.dataUrl && headerImage.dimensions) {
				const headerWidth = tableWidth;
				const headerHeight = (headerImage.dimensions.height * headerWidth) / headerImage.dimensions.width;
				const headerX = tableMarginLeft;
				doc.addImage(headerImage.dataUrl, 'PNG', headerX, 10, headerWidth, headerHeight);
				startY = 10 + headerHeight + 8;
			}

			const generatedDateRaw = new Date();
			const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
			const day = generatedDateRaw.getDate();
			const year = generatedDateRaw.getFullYear();
			const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
			const generatedAt = `Generated: ${month} ${day}, ${year}, ${time}`;
			
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(18);
			doc.text('STUDENT VIOLATION REPORT', tableCenterX, startY + 5, { align: 'center' });
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(11);
			doc.text(generatedAt, tableCenterX, startY + 13, { align: 'center' });
			doc.setFont('helvetica', 'bold');
			doc.setFontSize(10);
			doc.text(`Name: ${studentInfo.lastName.toUpperCase()}, ${studentInfo.firstName.toUpperCase()}`, tableMarginLeft, startY + 20);
			doc.text(`Current Year/Section: ${studentInfo.yearSection || '-'}`, tableMarginLeft, startY + 26);

			// Add spacing after header before the table
			const tableStartY = startY + 31;
			const body = records.map((record, index) => [
				index + 1,
				formatDisplayDate(record.created_at || record.date),
				`${resolveYearLevelForExport(record, studentInfo)} | ${buildAcademicTermText(record)}`,
				record.violation_label || record.violation_name || '-',
				record.reported_by || '-',
				record.remarks || '-',
				'', // Empty text for signature column since we'll add image
				formatStatusForExport(record),
			]);
				const didDrawCell = (data) => {
					if (data.section === 'body' && data.column.index === 6 && signatureImages[data.row.index]) {
						const cellWidth = data.cell.width;
						const cellHeight = data.cell.height;
						const x = data.cell.x + 1;
						const y = data.cell.y + 1;

						// Scale signature to fit in cell
						const maxWidth = cellWidth - 2;
						const maxHeight = cellHeight - 2;
						const scale = Math.min(maxWidth / 80, maxHeight / 24, 1); // Assuming signature is ~80x24
						const sigWidth = 80 * scale;
						const sigHeight = 24 * scale;

						const sigX = x + (maxWidth - sigWidth) / 2;
						const sigY = y + (maxHeight - sigHeight) / 2;

						doc.addImage(signatureImages[data.row.index], 'PNG', sigX, sigY, sigWidth, sigHeight);
					}
				};

				autoTable(doc, {
					startY: tableStartY,
					head: [['No.', 'Date', 'Year/Semester', 'Violation', 'Reported by', 'Remarks', 'Signature', 'Status']],
					body: body,
					theme: 'grid',
					styles: {
						fontSize: 9,
						cellPadding: 2.5,
						textColor: [31, 41, 55],
						halign: 'left',
						valign: 'middle',
					},
					headStyles: {
						fillColor: [15, 23, 42],
						textColor: [255, 255, 255],
						fontStyle: 'bold',
						halign: 'center',
					},
					alternateRowStyles: {
						fillColor: [248, 250, 252],
					},
					columnStyles: {
						0: { cellWidth: 15, halign: 'center' },
						1: { cellWidth: 23 },
						2: { cellWidth: 40 },
						3: { cellWidth: 62 },
						4: { cellWidth: 30 },
						5: { cellWidth: 58 },
						6: { cellWidth: 24, halign: 'center' },
						7: { cellWidth: 35 },
					},
					margin: { left: tableMarginLeft, right: tableMarginRight },
					didDrawCell,
				});

				// Student metadata is now shown above the table.

				doc.save(filename);
			} catch (error) {
				console.error('PDF export failed', error);
				alert('Unable to generate PDF download.');
			}
		} else if (format === 'jpeg') {
			try {
				const signaturePromises = records.map((record) =>
					getSignatureImageData(record.signature || record.signature_image || record.signatureImage || ''),
				);
				const signatureImages = await Promise.all(signaturePromises);

				const canvas = document.createElement('canvas');
				canvas.width = 2200;
				const rowHeight = 64;
				const tableTop = 260;
				canvas.height = Math.max(900, tableTop + (records.length + 1) * rowHeight + 130);
				const ctx = canvas.getContext('2d');
				if (!ctx) throw new Error('Unable to initialize image canvas.');

				ctx.fillStyle = '#ffffff';
				ctx.fillRect(0, 0, canvas.width, canvas.height);

				const headerImage = await resolveHeaderImage();
				let startY = 20;
				if (headerImage.dataUrl) {
					const headerImg = await loadImageFromDataUrl(headerImage.dataUrl);
					const headerWidth = 2080;
					const headerHeight = Math.round((headerImg.height / headerImg.width) * headerWidth);
					ctx.drawImage(headerImg, 60, startY, headerWidth, headerHeight);
					startY += headerHeight + 22;
				}

				const generatedDateRaw = new Date();
				const month = generatedDateRaw.toLocaleString(undefined, { month: 'long' });
				const day = generatedDateRaw.getDate();
				const year = generatedDateRaw.getFullYear();
				const time = generatedDateRaw.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
				const generatedAt = `Generated: ${month} ${day}, ${year}, ${time}`;

				ctx.textAlign = 'center';
				ctx.fillStyle = '#0f172a';
				ctx.font = 'bold 46px Arial';
				ctx.fillText('STUDENT VIOLATION REPORT', 1100, startY + 42);
				ctx.fillStyle = '#4b5563';
				ctx.font = '28px Arial';
				ctx.fillText(generatedAt, 1100, startY + 84);

				const columns = [
					{ key: 'No', label: 'No.', width: 80 },
					{ key: 'Date', label: 'Date', width: 160 },
					{ key: 'Year/Semester', label: 'Year/Semester', width: 260 },
					{ key: 'Violation', label: 'Violation', width: 300 },
					{ key: 'Reported by', label: 'Reported by', width: 180 },
					{ key: 'Remarks', label: 'Remarks', width: 470 },
					{ key: 'Signature', label: 'Signature', width: 190 },
					{ key: 'Status', label: 'Status', width: 160 },
				];

				const drawWrappedCellText = (text, x, y, width, lineHeight, maxLines = 2) => {
					const words = String(text || '').split(/\s+/).filter(Boolean);
					const lines = [];
					let line = '';
					for (let i = 0; i < words.length; i += 1) {
						const testLine = line ? `${line} ${words[i]}` : words[i];
						if (ctx.measureText(testLine).width > width && line) {
							lines.push(line);
							line = words[i];
						} else {
							line = testLine;
						}
					}
					if (line) lines.push(line);
					const finalLines = lines.slice(0, maxLines);
					if (lines.length > maxLines) {
						finalLines[maxLines - 1] = `${finalLines[maxLines - 1]}...`;
					}
					finalLines.forEach((currentLine, index) => {
						ctx.fillText(currentLine, x, y + index * lineHeight);
					});
				};

				const tableX = 60;
				const headerY = tableTop;
				ctx.fillStyle = '#0f172a';
				ctx.fillRect(tableX, headerY, 2080, rowHeight);
				ctx.strokeStyle = '#cbd5e1';
				ctx.lineWidth = 1.2;

				let xCursor = tableX;
				ctx.font = 'bold 24px Arial';
				ctx.textAlign = 'center';
				ctx.fillStyle = '#ffffff';
				columns.forEach((column) => {
					ctx.strokeRect(xCursor, headerY, column.width, rowHeight);
					ctx.fillText(column.label, xCursor + (column.width / 2), headerY + 41);
					xCursor += column.width;
				});

				for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
					const rowTop = headerY + rowHeight + (rowIndex * rowHeight);
					const rowRecord = sheetData[rowIndex];
					ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
					ctx.fillRect(tableX, rowTop, 2080, rowHeight);

					xCursor = tableX;
					ctx.fillStyle = '#111827';
					ctx.font = '22px Arial';
					ctx.textAlign = 'left';
					columns.forEach((column, colIndex) => {
						ctx.strokeRect(xCursor, rowTop, column.width, rowHeight);
						if (column.key === 'Signature' && signatureImages[rowIndex]) {
							// Draw signature image centered in signature cell.
						} else if (colIndex === 0) {
							ctx.textAlign = 'center';
							ctx.fillText(String(rowRecord[column.key] || ''), xCursor + (column.width / 2), rowTop + 40);
							ctx.textAlign = 'left';
						} else {
							drawWrappedCellText(rowRecord[column.key], xCursor + 8, rowTop + 27, column.width - 16, 22, 2);
						}
						xCursor += column.width;
					});

					if (signatureImages[rowIndex]) {
						try {
							const signatureImage = await loadImageFromDataUrl(signatureImages[rowIndex]);
							const signatureColumnStart = tableX + columns.slice(0, 6).reduce((sum, col) => sum + col.width, 0);
							ctx.drawImage(signatureImage, signatureColumnStart + 18, rowTop + 12, 200, 40);
						} catch (_error) {
							// ignore signature image rendering failures per row
						}
					}
				}

				const footerY = headerY + rowHeight + (records.length * rowHeight) + 56;
				ctx.textAlign = 'right';
				ctx.fillStyle = '#111827';
				ctx.font = 'bold 25px Arial';
				const studentName = `${studentInfo.lastName.toUpperCase()}, ${studentInfo.firstName.toUpperCase()}`.trim();
				ctx.fillText(studentName, 2140, footerY);
				ctx.fillStyle = '#4b5563';
				ctx.font = '22px Arial';
				ctx.fillText(studentInfo.yearSection || '', 2140, footerY + 34);

				downloadCanvasAsJpeg(canvas, filename);
			} catch (error) {
				console.error('JPEG export failed', error);
				alert('Unable to generate JPEG download.');
			}
		}
	}, [records, formatDownloadFileName, getStudentInfo, resolveHeaderImage, formatDisplayDate, normalizeType]);

	const triggerDownloadAllModal = useCallback(() => {
		setDownloadAllFormat('pdf');
		setDownloadAllModalOpen(true);
	}, []);

	const confirmDownloadAll = useCallback(() => {
		createDownloadAll(downloadAllFormat);
		setDownloadAllModalOpen(false);
	}, [createDownloadAll, downloadAllFormat]);

	const handleAttachSignatureFromTable = useCallback((row) => {
		if (!row?.id && !row?.raw?.id) return;
		setSignatureTarget(row.raw || row);
		setShowSignatureModal(true);
	}, []);

	const handleSignatureSave = useCallback(async (signatureImage) => {
		if (!signatureTarget?.id) return;

		const id = signatureTarget.id;
		setSavingSignatureId(id);
		setIsSignatureSaving(true);
		setShowSignatureModal(false); // close right away for quick feedback

		try {
			// Optimistic update: immediately update records with signature for instant feedback
			mergeRecord({ id: id, signature_image: signatureImage });
			
			// Confirm with server
			const response = await fetch(
				`/api/student-violations/${id}/signature`,
				{
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
						...getAuditHeaders(),
					},
					body: JSON.stringify({ signatureImage }),
				},
			);
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result?.message || "Unable to save signature.");
			}
			
			// Use the full record from API response to ensure data consistency
			if (result.record) {
				mergeRecord(result.record);
				// Ensure cached GET /api/student-violations/me is invalidated so lists show fresh data
				try {
					invalidateFetchCache('/api/student-violations/me');
				} catch (_e) {}
			}
			setSignatureTarget(null);
			setSignatureSuccessModal(true);
		} catch (error) {
			setSignatureTarget(null);
			setErrorModalMessage(error.message || "Unable to save signature.");
			setShowErrorModal(true);
			setSignatureSuccessModal(false); // close success modal if there's an error
		} finally {
			setIsSignatureSaving(false);
			setSavingSignatureId(null);
		}
	}, [signatureTarget, mergeRecord]);

	const columns = useMemo(
		() => [
			{ key: 'no', label: 'No.', width: 'w-12' },
			{ key: 'date', label: 'Date Logged', width: 'w-40' },
			{ key: 'yearSemester', label: 'Year/Semester', width: 'w-56' },
			{ key: 'violation', label: 'Violation', width: 'w-[36rem]' },
			{ key: 'reportedBy', label: 'Reported by', width: 'w-40' },
			{ key: 'remarks', label: 'Remarks', width: 'w-44' },
			{
				key: 'signature',
				label: 'Signature',
				width: 'w-48',
				render: (_value, row) => (
					<div className="flex items-center gap-2">
						{_value ? (
							<>
								<img
									src={_value}
									alt="Signature"
									className="h-8 w-24 object-contain bg-white rounded border border-gray-200"
								/>
								<Button
									size="sm"
									variant="secondary"
									className="px-2 py-1 h-7 text-xs gap-1"
									onClick={(e) => {
										e.stopPropagation();
										handleAttachSignatureFromTable(row);
									}}
									title="Update signature"
									disabled={isSignatureSaving && savingSignatureId === row.id}
								>
									<PenTool className="w-3 h-3" />
								</Button>
							</>
						) : (
								<Button
									size="sm"
									variant="secondary"
									className="px-3 py-1 h-7 text-xs gap-1"
									onClick={(e) => {
										e.stopPropagation();
										handleAttachSignatureFromTable(row);
									}}
									title="Add signature"
									disabled={isSignatureSaving && savingSignatureId === row.id}
								>
									<PenTool className="w-3 h-3" />
									{isSignatureSaving && savingSignatureId === row.id ? 'Saving...' : 'Attach signature'}
								</Button>
						)}
					</div>
				),
			},
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
				width: 'w-32',
				align: 'center',
				renderHeader: () => (
					<div className="flex items-center justify-center gap-1.5">
						<button
							type="button"
							className="p-2 rounded-lg bg-white hover:bg-gray-200 text-black transition-colors"
							onClick={(e) => {
								e.stopPropagation();
								triggerDownloadAllModal();
							}}
							aria-label="Export all violations"
							title="Export all violations"
						>
							<Download className="w-4 h-4" />
						</button>
					</div>
				),
				render: (_value, row) => (
					<button
						type="button"
						className="p-2 rounded-lg bg-white hover:bg-gray-200 text-black transition-colors"
						onClick={(e) => {
							e.stopPropagation();
							triggerDownloadModal(row);
						}}
						aria-label="Download violation"
						title="Download this violation"
					>
						<Download className="w-4 h-4" />
					</button>
				),
			},
		],
		[triggerDownloadModal, triggerDownloadAllModal, handleAttachSignatureFromTable],
	);

	const tableData = useMemo(() => {
		const query = searchTerm.trim().toLowerCase();

		const filtered = (records || [])
			.filter((row) => {
				const status = isRecordCleared(row) ? 'Cleared' : 'Active';
				const typeText = normalizeType(row).toLowerCase();
				const violationText = String(row?.violation_label || row?.violation_name || '').toLowerCase();
				const remarksText = String(row?.remarks || '').toLowerCase();
				const yearSemesterText = formatYearSemesterCell(row).toLowerCase();

				const matchesSearch =
					!query ||
					violationText.includes(query) ||
					typeText.includes(query) ||
					remarksText.includes(query) ||
					yearSemesterText.includes(query);

				const matchesStatus = statusFilter === 'All' || status === statusFilter;
				return matchesSearch && matchesStatus;
			});

		return filtered.map((row, index) => {
			const createdAt = new Date(row.created_at);
			const displayDate = Number.isNaN(createdAt.getTime())
				? '-'
				: createdAt.toLocaleDateString();

			return {
				id: row.id,
				no: index + 1,
				date: displayDate,
				yearSemester: formatYearSemesterCell(row),
				violation: row.violation_label || row.violation_name || '-',
				reportedBy: row.reported_by || '-',
				remarks: row.remarks || '-',
				signature: row.signature_image || row.signatureImage || '',
				status: isRecordCleared(row) ? 'Cleared' : 'Active',
				clearedAtRaw: getClearedAtValue(row),
				year_section: row.year_section || row.yearSection || '',
				semester: row.semester || row.current_semester || '',
				school_year: row.school_year || row.current_school_year || '',
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
							<DataTable columns={columns} data={tableData} className="mt-2" />
							<Modal
								isOpen={downloadModalOpen}
								onClose={() => setDownloadModalOpen(false)}
								title={<span className="font-black font-inter">Download Violation Record</span>}
								size="md"
							>
								<p className="text-sm text-gray-300 mb-3">Choose a format for downloading the selected violation.</p>
								<div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 mb-4">
									<p className="text-xs text-gray-300">
										Violation: <span className="font-semibold text-white">{selectedDownloadRecord?.violation ?? 'No violation selected'}</span>
									</p>
								</div>

								<label className="block text-sm font-medium text-white mb-2">Format</label>
								<div className="relative">
									<select
										value={downloadFormat}
										onChange={(e) => setDownloadFormat(e.target.value)}
										className="w-full cursor-pointer backdrop-blur-md border border-white/20 rounded-xl px-4 pr-11 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] focus:outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all appearance-none"
									>
										<option value="pdf">PDF</option>
										<option value="jpeg">JPEG</option>
									</select>
									<ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300" />
								</div>
								<ModalFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => setDownloadModalOpen(false)}
										className="px-6 py-2.5"
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="primary"
										onClick={confirmDownload}
										className="px-6 py-2.5"
									>
										Download
									</Button>
								</ModalFooter>
							</Modal>

							<Modal
								isOpen={downloadAllModalOpen}
								onClose={() => setDownloadAllModalOpen(false)}
								title={<span className="font-black font-inter">Export All Violations</span>}
								size="md"
							>
								<p className="text-sm text-gray-300 mb-3">Choose a format for exporting the current table view.</p>
								<div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 mb-4">
									<p className="text-xs text-gray-300">
										Rows to export: <span className="font-semibold text-white">{records.length}</span>
									</p>
								</div>

								<label className="block text-sm font-medium text-white mb-2">Format</label>
								<div className="relative">
									<select
										value={downloadAllFormat}
										onChange={(e) => setDownloadAllFormat(e.target.value)}
										className="w-full cursor-pointer backdrop-blur-md border border-white/20 rounded-xl px-4 pr-11 py-3 text-[15px] text-white bg-[rgba(45,47,52,0.8)] focus:outline-none focus:border-cyan-300/60 focus:ring-1 focus:ring-cyan-300/30 transition-all appearance-none"
									>
										<option value="pdf">PDF</option>
										<option value="excel">Excel (.xlsx)</option>
									</select>
									<ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-300" />
								</div>
								<ModalFooter>
									<Button
										type="button"
										variant="outline"
										onClick={() => setDownloadAllModalOpen(false)}
										className="px-6 py-2.5"
									>
										Cancel
									</Button>
									<Button
										type="button"
										variant="primary"
										onClick={confirmDownloadAll}
										className="px-6 py-2.5"
									>
										Export
									</Button>
								</ModalFooter>
							</Modal>

						<AlertModal
							isOpen={showDownloadAlertModal}
							onClose={() => setShowDownloadAlertModal(false)}
							title="Export unavailable"
							message={downloadAlertMessage}
							confirmLabel="Okay"
						/>

						<SignaturePadModal
							isOpen={showSignatureModal}
							onClose={() => setShowSignatureModal(false)}
							onSave={handleSignatureSave}
							isLoading={isSignatureSaving}
						/>

						<Modal
							isOpen={signatureSuccessModal}
							onClose={() => setSignatureSuccessModal(false)}
							title={<span className="font-black font-inter flex items-center gap-2">
								<CheckCircle className="w-5 h-5 text-green-400" />
								Signature Saved
							</span>}
							size="sm"
							showCloseButton
						>
							<div className="rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3 mb-4">
								<p className="text-sm font-medium text-green-300">
									The digital signature has been successfully saved. Administrators can now see your signed document.
								</p>
							</div>
							<ModalFooter>
								<Button
									variant="primary"
									onClick={() => setSignatureSuccessModal(false)}
									className="px-6"
								>
									OK
								</Button>
							</ModalFooter>
						</Modal>

						<AlertModal
							isOpen={showErrorModal}
							onClose={() => setShowErrorModal(false)}
							title="Error"
							message={errorModalMessage}
							confirmLabel="Okay"
						/>

						</>
					)}
				</Card>
			</div>
		</AnimatedContent>
	);
};

export default StudentViolations;




