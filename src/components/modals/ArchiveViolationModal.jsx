import React, { useState, useEffect } from 'react';
import Modal, { ModalFooter } from '../ui/Modal';
import Button from '../ui/Button';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { getAuditHeaders } from '@/lib/auditHeaders';
import SelectField from '../ui/SelectField';

const getDisplaySemester = (semester, schoolYear) => {
  const normalizedSemester = String(semester || "").trim().toUpperCase();
  const normalizedSchoolYear = String(schoolYear || "").trim();
  if (normalizedSemester === "1ST SEM" && normalizedSchoolYear === "2025-2026") {
    return "2ND SEM";
  }
  return normalizedSemester || semester || "";
};

const ArchiveViolationModal = ({ isOpen, onClose, onArchive }) => {
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('');
  const [currentSemester, setCurrentSemester] = useState('');
  const [currentSchoolYear, setCurrentSchoolYear] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveResult, setArchiveResult] = useState(null);
  const [error, setError] = useState('');
  const [signatureCheck, setSignatureCheck] = useState({ checked: false, hasAllSignatures: false, violationsWithoutSignature: 0, totalViolations: 0 });
  const [showSignatureWarningModal, setShowSignatureWarningModal] = useState(false);

  // Load current semester/school year on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await fetch('/api/archive/current-settings', {
          headers: { ...getAuditHeaders() },
        });
        const data = await response.json();

        if (response.ok && data.status === 'ok') {
          const displaySemester = getDisplaySemester(data.currentSemester, data.currentSchoolYear);
          const displaySchoolYear = data.currentSchoolYear; // Assuming school year doesn't change for display

          setCurrentSemester(displaySemester);
          setCurrentSchoolYear(displaySchoolYear);

          // Set selected to the current display values
          setSelectedSemester(displaySemester);
          setSelectedSchoolYear(displaySchoolYear);
        } else {
          setError(data.message || 'Unable to load current settings.');
        }
      } catch (err) {
        setError('Failed to load settings: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  // Check signatures when semester/year changes
  useEffect(() => {
    const checkSignatures = async () => {
      if (!selectedSemester || !selectedSchoolYear) {
        setSignatureCheck({ checked: false, hasAllSignatures: false, violationsWithoutSignature: 0, totalViolations: 0 });
        return;
      }

      try {
        const response = await fetch(`/api/archive/check-signatures?semester=${encodeURIComponent(selectedSemester)}&schoolYear=${encodeURIComponent(selectedSchoolYear)}`, {
          headers: { ...getAuditHeaders() },
        });
        const data = await response.json();

        if (response.ok && data.status === 'ok') {
          setSignatureCheck({
            checked: true,
            hasAllSignatures: data.hasAllSignatures,
            violationsWithoutSignature: data.violationsWithoutSignature,
            totalViolations: data.totalViolations,
          });
        } else {
          setSignatureCheck({ checked: false, hasAllSignatures: false, violationsWithoutSignature: 0, totalViolations: 0 });
        }
      } catch (err) {
        console.error('Failed to check signatures:', err);
        setSignatureCheck({ checked: false, hasAllSignatures: false, violationsWithoutSignature: 0, totalViolations: 0 });
      }
    };

    checkSignatures();
  }, [selectedSemester, selectedSchoolYear]);

  const handleArchive = async () => {
    if (!selectedSemester || !selectedSchoolYear) {
      setError('Please select both semester and school year.');
      return;
    }

    if (signatureCheck.checked && !signatureCheck.hasAllSignatures) {
      setShowSignatureWarningModal(true);
      return;
    }

    try {
      setIsArchiving(true);
      setError('');
      setArchiveResult(null);

      const response = await fetch('/api/archive/violations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          semester: selectedSemester,
          schoolYear: selectedSchoolYear,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'ok') {
        setArchiveResult({
          success: true,
          message: data.message,
          nextSemester: data.nextSemester,
          nextSchoolYear: data.nextSchoolYear,
          studentPromotedCount: data.studentPromotedCount,
          archivedCount: data.archivedCount,
        });

        // Update current display
        setCurrentSemester(getDisplaySemester(data.nextSemester, data.nextSchoolYear));
        setCurrentSchoolYear(data.nextSchoolYear);

        // Trigger parent callback
        if (onArchive) {
          onArchive({
            semester: selectedSemester,
            schoolYear: selectedSchoolYear,
            nextSemester: data.nextSemester,
            nextSchoolYear: data.nextSchoolYear,
            studentPromotedCount: data.studentPromotedCount,
            archivedCount: data.archivedCount,
          });
        }
      } else {
        setError(data.message || 'Failed to archive violations.');
      }
    } catch (err) {
      setError('Archive failed: ' + err.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleClose = () => {
    setArchiveResult(null);
    setError('');
    setSignatureCheck({ checked: false, hasAllSignatures: false, violationsWithoutSignature: 0, totalViolations: 0 });
    setShowSignatureWarningModal(false);
    onClose();
  };

  if (!isOpen) return null;

  // Show success state
  if (archiveResult?.success) {
    return (
      <Modal isOpen={true} onClose={handleClose} title="Archive Completed">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-green-400 font-medium">Archive Successful</p>
              <p className="text-sm text-green-300/80 mt-1">{archiveResult.message}</p>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between pt-2 border-t border-slate-700">
              <span className="text-slate-300">Violations Archived:</span>
              <span className="font-medium text-blue-400">{archiveResult.archivedCount || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Previous Semester:</span>
              <span className="font-medium">{selectedSemester} S.Y. {selectedSchoolYear}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">New Semester:</span>
              <span className="font-medium">{archiveResult.nextSemester} S.Y. {archiveResult.nextSchoolYear}</span>
            </div>
            {archiveResult.studentPromotedCount > 0 && (
              <div className="flex justify-between pt-2 border-t border-slate-700">
                <span className="text-slate-300">Students Promoted:</span>
                <span className="font-medium text-blue-400">{archiveResult.studentPromotedCount}</span>
              </div>
            )}
          </div>
        </div>
        <ModalFooter>
          <Button onClick={handleClose} variant="primary">
            Close
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Archive Student Violations">
        <div className="space-y-4 max-w-md">
          {isArchiving && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <div>
                  <p className="font-medium text-blue-300">Archiving records...</p>
                  <p className="text-sm text-blue-200/80">
                    Moving records, updating counts, and preserving archive history safely.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-800/50 p-3 rounded-lg">
            <p className="text-xs text-slate-400 mb-1">Current Semester</p>
            <p className="text-lg font-semibold text-blue-400">
              {currentSemester} S.Y. {currentSchoolYear}
            </p>
          </div>

          <div className="space-y-3">
            <SelectField
              label="Archive Which Semester?"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              disabled={isLoading || isArchiving}
              className="bg-slate-700 border-slate-600 rounded-lg text-slate-100 px-3 py-2 focus:border-blue-500 focus:ring-blue-500/20"
            >
              <option value="">Select Semester...</option>
              <option value="1ST SEM">1ST SEM</option>
              <option value="2ND SEM">2ND SEM</option>
              <option value="SUMMER">SUMMER</option>
            </SelectField>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                School Year
              </label>
              <input
                type="text"
                value={selectedSchoolYear}
                onChange={(e) => setSelectedSchoolYear(e.target.value)}
                placeholder="e.g., 2025-2026"
                disabled={isLoading || isArchiving}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                {(selectedSemester === '2ND SEM' || selectedSemester === 'SUMMER') && selectedSchoolYear
                  ? `Next School Year will be: ${Number(selectedSchoolYear.split('-')[1]) + 1}`
                  : 'Enter the school year (e.g., 2025-2026)'}
              </p>
            </div>
          </div>

          {signatureCheck.checked && signatureCheck.totalViolations > 0 && (
            <div className={`border rounded-lg p-3 ${signatureCheck.hasAllSignatures ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex gap-2">
                {signatureCheck.hasAllSignatures ? (
                  <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className={`text-sm ${signatureCheck.hasAllSignatures ? 'text-green-300' : 'text-red-300'}`}>
                  {signatureCheck.hasAllSignatures ? (
                    'All violations have signatures attached.'
                  ) : (
                    `${signatureCheck.violationsWithoutSignature} violation${signatureCheck.violationsWithoutSignature === 1 ? '' : 's'} are missing signatures. Please attach signatures before archiving.`
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <ModalFooter>
          <Button
            onClick={handleClose}
            variant="secondary"
            disabled={isLoading || isArchiving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleArchive}
            variant="primary"
            disabled={
              isLoading ||
              isArchiving ||
              !selectedSemester ||
              !selectedSchoolYear
            }
          >
            {isArchiving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Archiving...</span>
              </>
            ) : (
              'Archive'
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {showSignatureWarningModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowSignatureWarningModal(false)}
          title="Missing Signatures"
        >
          <div className="p-4 text-sm text-red-200">
            {signatureCheck.violationsWithoutSignature} violation{signatureCheck.violationsWithoutSignature === 1 ? '' : 's'} are missing signatures.
            Please attach signatures before archiving.
          </div>
          <ModalFooter>
            <Button
              onClick={() => setShowSignatureWarningModal(false)}
              variant="primary"
            >
              OK
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );

};

export default ArchiveViolationModal;
