export function getAuditHeaders() {
  try {
    const currentUser = JSON.parse(localStorage.getItem("svms_user") || "{}");

    return {
      "x-actor-user-id": currentUser?.id ? String(currentUser.id) : "",
      "x-actor-name":
        currentUser?.fullName ||
        [currentUser?.firstName, currentUser?.lastName]
          .filter(Boolean)
          .join(" ") ||
        currentUser?.username ||
        "Admin User",
      "x-actor-role": currentUser?.role || "admin",
    };
  } catch (_error) {
    return {
      "x-actor-user-id": "",
      "x-actor-name": "Admin User",
      "x-actor-role": "admin",
    };
  }
}
