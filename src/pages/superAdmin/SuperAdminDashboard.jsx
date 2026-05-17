import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ChevronDown, Edit, Loader2, Plus, Shield, Trash2, UserCog, Users } from "lucide-react";
import AnimatedContent from "@/components/ui/AnimatedContent";
import Button from "@/components/ui/Button";
import DataTable, {
  TableCellBadge,
  TableCellText,
} from "@/components/ui/DataTable";
import SearchBar from "@/components/ui/SearchBar";
import AdminAccountModal from "@/components/modals/AdminAccountModal";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import { getAuditHeaders } from "@/lib/auditHeaders";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const roleBadgeVariant = {
  admin: "info",
  super_admin: "warning",
  both: "warning",
};

const statCardStyles =
  "rounded-2xl border border-white/10 bg-[#15181d] p-5 shadow-[0_20px_45px_rgba(0,0,0,0.22)]";

const formatRoleLabel = (role) =>
  role === "super_admin"
    ? "Super Admin"
    : role === "both"
      ? "Admin and Super Admin"
      : "Admin";

const formatCreatedDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently added";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const mapAccount = (account) => ({
  id: Number(account.id),
  username: account.username || "",
  email: account.email || "",
  role: account.role || "admin",
  isActive: Boolean(account.is_active),
  firstName: account.first_name || "",
  middleInitial: account.middle_initial || "",
  lastName: account.last_name || "",
  fullName:
    account.full_name ||
    [account.first_name, account.middle_initial, account.last_name]
      .filter(Boolean)
      .join(" "),
  createdAt: account.created_at || "",
});

const SuperAdminDashboard = () => {
  const currentUser = JSON.parse(localStorage.getItem("svms_user") || "{}");
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    if (currentUser?.role !== "super_admin") {
      return undefined;
    }

    const loadAccounts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/admin-accounts", {
          headers: {
            ...getAuditHeaders(),
          },
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result?.message || "Failed to load admin accounts.");
        }

        setAccounts(
          Array.isArray(result.accounts)
            ? result.accounts.map(mapAccount)
            : [],
        );
      } catch (error) {
        setFeedback({
          type: "error",
          message: error.message || "Unable to load admin accounts.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
    return undefined;
  }, [currentUser?.role]);

  const filteredAccounts = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesRole =
        roleFilter === "all" ? true : account.role === roleFilter;

      const matchesQuery = !query
        ? true
        : [
            account.fullName,
            account.email,
            account.username,
            formatRoleLabel(account.role),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query);

      return matchesRole && matchesQuery;
    });
  }, [accounts, roleFilter, searchQuery]);

  const stats = useMemo(() => {
    const superAdminCount = accounts.filter(
      (account) => account.role === "super_admin" || account.role === "both",
    ).length;
    const adminCount = accounts.filter(
      (account) => account.role === "admin" || account.role === "both",
    ).length;
    const bothCount = accounts.filter(
      (account) => account.role === "both",
    ).length;
    const activeCount = accounts.filter((account) => account.isActive).length;

    return { superAdminCount, adminCount, bothCount, activeCount };
  }, [accounts]);

  const handleCreateAccount = async (formData) => {
    setIsSaving(true);
    setFeedback({ type: "", message: "" });

    try {
      const response = await fetch("/api/admin-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuditHeaders(),
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to create account.");
      }

      if (result.account) {
        setAccounts((prev) => [mapAccount(result.account), ...prev]);
      }

      setSuccessModal({
        isOpen: true,
        title: "Account Created",
        message: result?.emailQueued
          ? "The admin account was created successfully. The credential email is being sent now."
          : "The admin account was created successfully.",
      });
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to create account.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditAccount = async (formData) => {
    if (!selectedAccount?.id) {
      return false;
    }

    setIsSaving(true);
    setFeedback({ type: "", message: "" });

    try {
      const response = await fetch(
        `/api/admin-accounts/${selectedAccount.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuditHeaders(),
          },
          body: JSON.stringify(formData),
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to update account.");
      }

      if (result.account) {
        const mapped = mapAccount(result.account);
        setAccounts((prev) =>
          prev.map((account) =>
            account.id === mapped.id ? mapped : account,
          ),
        );
      }

      setFeedback({
        type: "success",
        message: "Admin account updated successfully.",
      });
      return true;
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to update account.",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteCandidate?.id) {
      return;
    }

    setIsDeleting(true);
    setFeedback({ type: "", message: "" });

    try {
      const response = await fetch(
        `/api/admin-accounts/${deleteCandidate.id}`,
        {
          method: "DELETE",
          headers: {
            ...getAuditHeaders(),
          },
        },
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result?.message || "Failed to delete account.");
      }

      setAccounts((prev) =>
        prev.filter((account) => account.id !== deleteCandidate.id),
      );
      setDeleteCandidate(null);
      setSuccessModal({
        isOpen: true,
        title: "Account Deleted",
        message: "The admin account was removed from the system successfully.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "Unable to delete account.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (currentUser?.role !== "super_admin") {
    return <Navigate to="/admin" replace />;
  }

  const columns = [
    {
      key: "fullName",
      label: "Administrator",
      render: (_value, row) => (
        <div>
          <TableCellText primary={row.fullName} secondary={row.email} />
          <p className="mt-1 text-[12px] font-medium text-gray-500">
            Added {formatCreatedDate(row.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "username",
      label: "Username",
      render: (value) => (
        <span className="text-[14px] font-semibold tracking-[0.02em] text-[#1a1a1a]">
          {value}
        </span>
      ),
    },
    {
      key: "role",
      label: "Type",
      render: (value) => (
        <TableCellBadge
          label={formatRoleLabel(value)}
          variant={roleBadgeVariant[value] || "default"}
        />
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (value) => (
        <TableCellBadge
          label={value ? "Active" : "Inactive"}
          variant={value ? "success" : "danger"}
        />
      ),
    },
  ];

  const actions = [
    {
      label: "Edit Account",
      icon: <Edit className="h-4 w-4" />,
      onClick: (row) => {
        setSelectedAccount(row);
        setIsEditOpen(true);
      },
    },
    {
      label: "Delete Account",
      icon: <Trash2 className="h-4 w-4" />,
      variant: "danger",
      onClick: (row) => {
        setDeleteCandidate(row);
      },
    },
  ];

  return (
    <div className="space-y-6 font-inter">
      <AnimatedContent distance={20} direction="vertical" duration={0.45}>
        <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#14181d] via-[#111418] to-[#0b0d10] p-7 shadow-[0_25px_70px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/75">
                Super Admin Panel
              </p>
              <h1 className="text-3xl font-black text-white">
                Admin Accounts
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-400">
                Manage administrator access with a focused directory for account
                creation, role control, and status updates.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              className="h-11 rounded-xl bg-white px-5 text-[#101214] hover:bg-slate-200"
            >
              <Plus className="h-4 w-4" />
              Add Admin User
            </Button>
          </div>
        </div>
      </AnimatedContent>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={statCardStyles}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-slate-200">
            <Users className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-400">Total Accounts</p>
          <p className="mt-2 text-3xl font-black text-white">
            {accounts.length}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            All administrator-level users in the system.
          </p>
        </div>
        <div className={statCardStyles}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
            <UserCog className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-400">Admins</p>
          <p className="mt-2 text-3xl font-black text-white">
            {stats.adminCount}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Standard administrative accounts.
          </p>
        </div>
        <div className={statCardStyles}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
            <Shield className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-400">Super Admins</p>
          <p className="mt-2 text-3xl font-black text-white">
            {stats.superAdminCount}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Highest-privilege accounts with system control.
          </p>
        </div>
        <div className={statCardStyles}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Shield className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-400">Active Accounts</p>
          <p className="mt-2 text-3xl font-black text-white">
            {stats.activeCount}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Accounts currently allowed to sign in.
          </p>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-[#111418]/92 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.2)]">
        <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Account Directory</h2>
          </div>
          <div className="flex w-full flex-col gap-3 lg:max-w-2xl lg:flex-row lg:items-center lg:justify-end">
            <div className="w-full lg:w-auto lg:flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full min-w-[180px] justify-between border border-white/10 bg-[#1a1d22] text-sm text-white hover:bg-[#23272d]"
                  >
                    {roleFilter === "all"
                      ? "All"
                      : roleFilter === "admin"
                      ? "Admins"
                      : roleFilter === "super_admin"
                        ? "Super Admins"
                        : "Admin + Super Admin"}
                    <ChevronDown className="ml-2 w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[180px]">
                    <DropdownMenuItem onClick={() => setRoleFilter("all")}>All</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRoleFilter("admin")}>Admins</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRoleFilter("super_admin")}>Super Admins</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRoleFilter("both")}>Both</DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="w-full max-w-md">
              <SearchBar
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name, email, username, or role"
              />
            </div>
          </div>
        </div>

        <div className="mb-4 flex justify-end">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
            Solid access control overview
          </p>
        </div>

        {feedback.message ? (
          <div
            className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                : feedback.type === "warning"
                  ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
                  : "border-red-400/25 bg-red-500/10 text-red-300"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-gray-400">
            Loading admin accounts...
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredAccounts}
            actions={actions}
            className="border border-white/10"
          />
        )}
      </div>

      <AdminAccountModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreateAccount}
        isSaving={isSaving}
      />

      <AdminAccountModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedAccount(null);
        }}
        onSave={handleEditAccount}
        isSaving={isSaving}
        mode="edit"
        initialData={selectedAccount}
      />

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteCandidate(null);
          }
        }}
        title={<span className="font-black font-inter">Delete Admin Account</span>}
        size="sm"
        showCloseButton={!isDeleting}
      >
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-300">
            This will permanently remove{" "}
            <span className="font-bold text-white">
              {deleteCandidate?.fullName || "this user"}
            </span>{" "}
            from the system.
          </p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-gray-300">
          Their login will no longer work after deletion.
        </p>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteCandidate(null)}
            disabled={isDeleting}
            className="px-6 py-2.5"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="px-6 py-2.5"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete User"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={successModal.isOpen}
        onClose={() =>
          setSuccessModal({
            isOpen: false,
            title: "",
            message: "",
          })
        }
        title={<span className="font-black font-inter">{successModal.title}</span>}
        size="sm"
        showCloseButton
      >
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-300">
            {successModal.message}
          </p>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              setSuccessModal({
                isOpen: false,
                title: "",
                message: "",
              })
            }
            className="px-6 py-2.5"
          >
            OK
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default SuperAdminDashboard;
