const PX_PER_COL_WIDTH = 7.5;
const PX_PER_ROW_HEIGHT = 1.333;

export const getExcelColumnLetter = (columnNumber) => {
  let dividend = Number(columnNumber);
  let columnName = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName || "A";
};

const getColumnsWidthPx = (sheet, colStart = 1, colEnd = sheet.columns.length) => {
  let total = 0;
  for (let columnIndex = colStart; columnIndex <= colEnd; columnIndex += 1) {
    total += Number(sheet.getColumn(columnIndex).width || 10) * PX_PER_COL_WIDTH;
  }
  return total;
};

const getSheetWidthPx = (sheet) => getColumnsWidthPx(sheet);

const getRowsHeightPx = (sheet, rowStart, rowEnd) => {
  let total = 0;
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    total += Number(sheet.getRow(rowIndex).height || 15) * PX_PER_ROW_HEIGHT;
  }
  return total;
};

const toColumnCoordinate = (sheet, pixelOffset, colStart = 1, colEnd = sheet.columns.length) => {
  let remaining = pixelOffset;
  for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
    const colPx = Number(sheet.getColumn(colIndex)?.width || 10) * PX_PER_COL_WIDTH;
    if (remaining <= colPx) {
      return (colIndex - 1) + remaining / colPx;
    }
    remaining -= colPx;
  }
  return Math.max(colEnd - 1, 0);
};

const toRowCoordinate = (sheet, pixelOffset, rowStart, rowEnd) => {
  let remaining = pixelOffset;
  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    const rowPx = Number(sheet.getRow(rowIndex).height || 15) * PX_PER_ROW_HEIGHT;
    if (remaining <= rowPx) {
      return (rowIndex - 1) + remaining / rowPx;
    }
    remaining -= rowPx;
  }
  return Math.max(rowEnd - 1, 0);
};

export const applyExcelPrintLayout = (sheet, { orientation = "landscape" } = {}) => {
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.3,
      bottom: 0.45,
      header: 0.15,
      footer: 0.15,
    },
  };

  sheet.printOptions = {
    ...sheet.printOptions,
    horizontalCentered: true,
    verticalCentered: false,
  };
};

export const addCenteredExcelHeaderImage = ({
  workbook,
  sheet,
  dataUrl,
  extension = "png",
  dimensions,
  colStart = 1,
  colEnd = sheet.columns.length,
  rowStart = 1,
  rowEnd = 8,
  widthScale = 1,
  heightScale = 0.96,
}) => {
  if (!dataUrl || !dimensions?.width || !dimensions?.height) return;

  const regionWidthPx = getColumnsWidthPx(sheet, colStart, colEnd);
  const regionHeightPx = getRowsHeightPx(sheet, rowStart, rowEnd);
  const targetImageWidthPx = Math.max(8, regionWidthPx * widthScale);
  const maxImageHeightPx = Math.max(8, regionHeightPx * heightScale);

  let imageWidthPx = Math.max(8, Math.round(targetImageWidthPx));
  let imageHeightPx = Math.max(8, Math.round((dimensions.height * imageWidthPx) / dimensions.width));

  if (imageHeightPx > maxImageHeightPx) {
    const heightScaleRatio = maxImageHeightPx / imageHeightPx;
    imageWidthPx = Math.max(8, Math.round(imageWidthPx * heightScaleRatio));
    imageHeightPx = Math.max(8, Math.round(imageHeightPx * heightScaleRatio));
  }

  const leftOffsetPx = Math.max(0, (regionWidthPx - imageWidthPx) / 2);
  const topOffsetPx = Math.max(0, (regionHeightPx - imageHeightPx) / 2);

  const imageId = workbook.addImage({ base64: dataUrl, extension });
  sheet.addImage(imageId, {
    tl: {
      col: toColumnCoordinate(sheet, leftOffsetPx, colStart, colEnd),
      row: toRowCoordinate(sheet, topOffsetPx, rowStart, rowEnd),
    },
    ext: {
      width: imageWidthPx,
      height: imageHeightPx,
    },
  });
};
