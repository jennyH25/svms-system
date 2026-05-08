import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function pluralize(word, count) {
  return `${word}${count === 1 ? "" : "s"}`;
}

export function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

export function formatMiddleInitial(middleInitial) {
  const normalized = String(middleInitial || "")
    .replace(/\./g, "")
    .trim();

  if (!normalized) return "";
  return `${normalized.charAt(0).toUpperCase()}.`;
}

export function formatStudentDisplayName({
  firstName,
  first_name,
  middleInitial,
  middle_initial,
  lastName,
  last_name,
  fullName,
  full_name,
} = {}) {
  const first = String(firstName || first_name || "").trim();
  const last = String(lastName || last_name || "").trim();
  const middle = formatMiddleInitial(middleInitial || middle_initial);

  if (last && first) {
    return `${last}, ${[first, middle].filter(Boolean).join(" ")}`.trim();
  }

  const combined = String(fullName || full_name || "").trim();
  if (!combined) return "";
  if (combined.includes(",")) return combined.replace(/\s+/g, " ").trim();

  return combined.replace(/\s+/g, " ").trim();
}
