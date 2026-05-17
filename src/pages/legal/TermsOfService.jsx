import React from "react";
import LegalPageLayout from "./LegalPageLayout";

const sections = [
  {
    heading: "Authorized Use",
    body:
      "Student Violation Management System is intended only for authorized students, school administrators, and other approved users. Access must be limited to institutional or approved school accounts.",
  },
  {
    heading: "Account Responsibility",
    body:
      "Users are responsible for maintaining the confidentiality of their login credentials and for all activity performed through their account. Attempting to access another user's account or data is prohibited.",
  },
  {
    heading: "Acceptable Conduct",
    body:
      "You agree to use the platform only for legitimate educational and administrative purposes. Misuse of records, tampering with data, unauthorized sharing, or disruption of the service is not allowed.",
  },
  {
    heading: "Data Accuracy",
    body:
      "Violation records, student information, and notifications shown in the platform are managed as part of school operations. Users should report suspected inaccuracies to the proper school authority or system administrator.",
  },
  {
    heading: "Service Changes",
    body:
      "The school or system administrator may update, restrict, or discontinue parts of the service when needed for maintenance, security, compliance, or operational improvements.",
  },
];

function TermsOfService() {
  return (
    <LegalPageLayout
      eyebrow="Terms of Service"
      title="Rules for Using the Platform"
      intro="These terms explain the expected use of Student Violation Management System by students, administrators, and other authorized users."
      sections={sections}
    />
  );
}

export default TermsOfService;
