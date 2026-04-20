const ExcelJS = require("exceljs");
async function inspect() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile("ViolationRecords1.xlsx");
  const sheet = workbook.worksheets[0];
  console.log("Worksheet Count:", workbook.worksheets.length);
  console.log("Row Count:", sheet.rowCount);
  console.log("Row 1:", JSON.stringify(sheet.getRow(1).values));
  console.log("Row 2:", JSON.stringify(sheet.getRow(2).values));
  console.log("First 3 non-empty rows:");
  let count = 0;
  sheet.eachRow((row, rowNumber) => {
    if (count < 3) {
      console.log(`Row ${rowNumber}:`, JSON.stringify(row.values));
      count++;
    }
  });
}
inspect().catch(console.error);
