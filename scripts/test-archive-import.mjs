import assert from "node:assert/strict";

const baseUrl = process.env.ARCHIVE_TEST_BASE_URL || "http://localhost:3001";
const schoolYear = process.env.ARCHIVE_TEST_SCHOOL_YEAR || "2024-2025";
const semesters = ["1ST SEM", "2ND SEM"];

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${text.slice(0, 200)}`);
  }

  assert.ok(response.ok, `Request failed for ${path}: ${response.status} ${text}`);
  return data;
}

async function main() {
  const unresolvedSummary = [];
  const archiveSummary = [];

  for (const semester of semesters) {
    const unresolved = await fetchJson(
      `/api/archive/unresolved/${encodeURIComponent(schoolYear)}/${encodeURIComponent(semester)}`,
    );
    const unresolvedViolations = Array.isArray(unresolved.violations)
      ? unresolved.violations
      : [];
    const importedUnresolved = unresolvedViolations.filter(
      (row) => String(row.remarks || "").trim().toUpperCase() === "IMPORTED",
    );

    assert.equal(
      importedUnresolved.length,
      0,
      `Imported records still appear in unresolved for ${schoolYear} ${semester}`,
    );

    unresolvedSummary.push({
      semester,
      count: unresolvedViolations.length,
    });

    const archived = await fetchJson(
      `/api/archive/violations/${encodeURIComponent(schoolYear)}/${encodeURIComponent(semester)}`,
    );
    const archivedViolations = Array.isArray(archived.violations)
      ? archived.violations
      : [];
    const importedArchived = archivedViolations.filter(
      (row) => String(row.remarks || "").trim().toUpperCase() === "IMPORTED",
    );

    assert.ok(
      importedArchived.length > 0,
      `No imported records loaded for ${schoolYear} ${semester}`,
    );

    for (const row of importedArchived) {
      assert.equal(
        String(row.school_year || ""),
        schoolYear,
        `Imported row ${row.id} has wrong school year`,
      );
      assert.equal(
        String(row.semester || ""),
        semester,
        `Imported row ${row.id} has wrong semester`,
      );
      assert.equal(
        String(row.is_unresolved || false),
        "false",
        `Imported row ${row.id} should not be unresolved`,
      );
    }

    archiveSummary.push({
      semester,
      count: archivedViolations.length,
      imported: importedArchived.length,
    });
  }

  console.log(
    JSON.stringify(
      {
        status: "ok",
        schoolYear,
        unresolvedSummary,
        archiveSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
