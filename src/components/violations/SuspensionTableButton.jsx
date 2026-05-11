import React, { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import Modal, { ModalFooter } from '@/components/ui/Modal'
import { getAuditHeaders } from '@/lib/auditHeaders'
import { cachedFetchJSON, invalidateFetchCache } from '@/lib/fetchHelper'
import { CheckCircle, SquarePen } from 'lucide-react'
import violationTableImage from '../../../VIOLATION-TABLE.png'

const DEFAULT_HANDBOOK_TITLE = 'PLP Student Handbook 2025'
const DEFAULT_HANDBOOK_URL = 'https://online.fliphtml5.com/befok/lfwi/'

const Spinner = ({ className = 'w-4 h-4' }) => (
  <span
    className={`${className} inline-block rounded-full border-2 border-current border-t-transparent animate-spin`}
    aria-hidden="true"
  />
)

const SuspensionTableButton = ({ className = '', canEdit = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: '',
    message: '',
  })
  const [handbookSettings, setHandbookSettings] = useState({
    title: DEFAULT_HANDBOOK_TITLE,
    url: DEFAULT_HANDBOOK_URL,
  })
  const [formState, setFormState] = useState({
    title: DEFAULT_HANDBOOK_TITLE,
    url: DEFAULT_HANDBOOK_URL,
  })

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const result = await cachedFetchJSON('/api/settings', {
          headers: { ...getAuditHeaders() },
        }, {
          ttlMs: 30000,
          staleWhileRevalidate: true,
        })
        const data = result.data || {}
        if (!isMounted || result.status !== 'ok' || data.status !== 'ok') {
          return
        }

        const nextSettings = {
          title: data.settings?.offensesHandbookTitle || DEFAULT_HANDBOOK_TITLE,
          url: data.settings?.offensesHandbookUrl || DEFAULT_HANDBOOK_URL,
        }

        setHandbookSettings(nextSettings)
        setFormState(nextSettings)
      } catch (error) {
        console.error('Error loading handbook settings:', error)
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [])

  const openEditModal = () => {
    setFormState(handbookSettings)
    setEditError('')
    setIsEditModalOpen(true)
  }

  const handleSave = async () => {
    const nextTitle = String(formState.title || '').trim()
    const nextUrl = String(formState.url || '').trim()

    if (!nextTitle) {
      setEditError('Title is required.')
      return
    }

    if (!nextUrl) {
      setEditError('Link is required.')
      return
    }

    try {
      new URL(nextUrl)
    } catch (_error) {
      setEditError('Please enter a valid URL.')
      return
    }

    setEditError('')
    setIsSaving(true)

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuditHeaders(),
        },
        body: JSON.stringify({
          offensesHandbookTitle: nextTitle,
          offensesHandbookUrl: nextUrl,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || data.status !== 'ok') {
        throw new Error(data.message || 'Failed to update the handbook link.')
      }

      const nextSettings = {
        title: data.settings?.offensesHandbookTitle || nextTitle,
        url: data.settings?.offensesHandbookUrl || nextUrl,
      }

      invalidateFetchCache('/api/settings')
      setHandbookSettings(nextSettings)
      setFormState(nextSettings)
      setIsEditModalOpen(false)
      setSuccessModal({
        isOpen: true,
        title: 'Link Updated',
        message: 'The handbook title and link were updated successfully.',
      })
    } catch (error) {
      console.error('Error updating handbook settings:', error)
      setEditError(error.message || 'Unable to update the handbook link.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => setIsOpen(true)}
      >
        Degrees of Offenses
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Degrees of Offenses"
        size="2xl"
      >
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-[#d7dbe3] bg-[#f7f8fa] shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
            <img
              src={violationTableImage}
              alt="Suspension table"
              className="max-h-[70vh] w-full object-contain bg-white"
              loading="lazy"
            />
          </div>

          <div className="rounded-2xl border border-[#d7dbe3] bg-[linear-gradient(180deg,#f9fafb_0%,#eef2f7_100%)] px-6 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
            <div className="space-y-5">
              <div>
                <h4 className="text-lg font-bold tracking-[0.02em] text-[#1f2937]">Permanent Record of Sanctions</h4>
                <p className="mt-3 text-[15px] leading-8 text-justify text-[#374151] sm:text-base">
                All disciplinary sanctions imposed on a student, whether minor or major, shall be recorded and maintained as part of the student&apos;s permanent school records. These records are cumulative and do not reset at the end of each academic year. They may be considered in the evaluation of future offenses, conduct clearances, or other official matters as deemed necessary by PLP.
                </p>
              </div>

              <div className="border-t border-[#d7dbe3] pt-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm italic text-[#4b5563]">
                    Press this link to see the{' '}
                    <a
                      href={handbookSettings.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#355c8a] underline underline-offset-4 hover:text-[#24476f]"
                    >
                      {handbookSettings.title}
                    </a>
                    .
                  </p>

                  {canEdit ? (
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="rounded-full border border-[#cdd5df] bg-white p-2 text-[#355c8a] transition hover:border-[#355c8a] hover:bg-[#edf3fb] hover:text-[#24476f]"
                      aria-label="Edit handbook title and link"
                      title="Edit handbook title and link"
                    >
                      <SquarePen className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="primary" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          if (isSaving) return
          setIsEditModalOpen(false)
          setEditError('')
        }}
        title="Edit Handbook Link"
        size="lg"
      >
        {editError ? (
          <div className="mb-4 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {editError}
          </div>
        ) : null}

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-white">Link Title</label>
            <input
              type="text"
              value={formState.title}
              onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-600 bg-[#3a3a3a] px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter handbook title"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white">Link URL</label>
            <input
              type="url"
              value={formState.url}
              onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))}
              className="w-full rounded-lg border border-gray-600 bg-[#3a3a3a] px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
              disabled={isSaving}
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsEditModalOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Spinner />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ isOpen: false, title: '', message: '' })}
        title={
          <span className="flex items-center gap-2 font-black font-inter">
            <CheckCircle className="h-5 w-5 text-green-400" />
            {successModal.title || 'Success'}
          </span>
        }
        size="sm"
      >
        <div className="mb-4 rounded-lg border border-green-400/25 bg-green-500/10 px-4 py-3">
          <p className="text-sm font-medium text-green-300">{successModal.message}</p>
        </div>
        <ModalFooter>
          <Button variant="primary" onClick={() => setSuccessModal({ isOpen: false, title: '', message: '' })}>
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )
}

export default SuspensionTableButton
