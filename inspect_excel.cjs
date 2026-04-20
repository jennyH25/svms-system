const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
workbook.xlsx.readFile("ViolationRecords.xlsx").then(() => {
    const sheet = workbook.worksheets[0];
    console.log("Worksheets:", workbook.worksheets.length);
    console.log("First Sheet:", sheet.name);
    console.log("Row Count:", sheet.rowCount);
    console.log("Row 1:", JSON.stringify(sheet.getRow(1).values.slice(1)));
    console.log("Row 2:", JSON.stringify(sheet.getRow(2).values.slice(1)));
    console.log("First 5 non-empty rows:");
    let count = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (count < 5) {
            console.log(`Row ${rowNumber}:`, JSON.stringify(row.values.slice(1)));
            count++;
        }
    });
}).catch(err => {
    console.error("Error:", err.message);
    process.exit(1);
});
