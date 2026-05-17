import React from "react";
import LegalPageLayout from "./LegalPageLayout";

const sections = [
  {
    heading: "Information We Use",
    body:
      "Student Violation Management System uses account details already maintained by the institution, such as your name, school ID, email address, role, program, section, and violation-related records needed to operate the platform.",
  },
  {
    heading: "How Information Is Used",
    body:
      "This information is used to authenticate users, display student or administrator dashboards, manage violation records, send account or alert emails, and maintain audit and notification activity required for school operations.",
  },
  {
    heading: "Google Sign-In",
    body:
      "When you sign in with Google, the app uses your Google account email only to verify that the email belongs to an allowed school domain and already exists in the system database before access is granted.",
  },
  {
    heading: "Sharing and Protection",
    body:
      "Information is not intended for public sharing. Access is limited to authorized users of the system, and data is handled only for academic discipline management, administrative review, and related operational security purposes.",
  },
  {
    heading: "Contact",
    body:
      "If you have questions about this privacy policy or your data in the system, please contact the school office or system administrator responsible for Student Violation Management System.",
  },
];

function PrivacyPolicy() {
  return (
    <LegalPageLayout
      eyebrow="Privacy Policy"
      title="How Student Data Is Used"
      intro="This page describes how Student Violation Management System handles information needed to authenticate users and manage student violation records within the school."
      sections={sections}
    />
  );
}

export default PrivacyPolicy;
