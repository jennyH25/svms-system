export const DEFAULT_EXPORT_HEADER_PATH = "/plpasig_header.png";

const PDF_HEADER_TOP_MM = 8;
const PDF_HEADER_SIDE_MARGIN_MM = 10;
const PDF_HEADER_GAP_AFTER_MM = 8;
const CANVAS_HEADER_SIDE_MARGIN_PX = 60;
const CANVAS_HEADER_TOP_PX = 20;
const STANDARD_HEADER_ASPECT_RATIO = 772 / 172;
const NORMALIZED_HEADER_WIDTH_PX = 2400;
const NORMALIZED_HEADER_HEIGHT_PX = Math.round(
  NORMALIZED_HEADER_WIDTH_PX / STANDARD_HEADER_ASPECT_RATIO,
);

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const getDataUrlDimensions = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    image.onerror = () => reject(new Error("Unable to load image dimensions."));
    image.src = dataUrl;
  });

const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = dataUrl;
  });

const canvasToDataUrl = (canvas) => canvas.toDataURL("image/png");

const createNormalizedBannerDataUrl = async (
  dataUrl,
  sourceDimensions,
  targetWidth,
  targetHeight,
) => {
  if (!dataUrl || !sourceDimensions?.width || !sourceDimensions?.height) {
    return dataUrl;
  }

  const image = await loadImageFromDataUrl(dataUrl);
  const sourceWidth = image.naturalWidth || image.width || sourceDimensions.width;
  const sourceHeight = image.naturalHeight || image.height || sourceDimensions.height;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const offsetX = Math.round((targetWidth - drawWidth) / 2);
  const offsetY = Math.round((targetHeight - drawHeight) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round(targetHeight));
  const context = canvas.getContext("2d");
  if (!context) {
    return dataUrl;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    offsetX,
    offsetY,
    drawWidth,
    drawHeight,
  );

  return canvasToDataUrl(canvas);
};

export const getExportHeaderPath = (settings) =>
  String(settings?.exportHeaderPath || "").trim() || DEFAULT_EXPORT_HEADER_PATH;

export const resolveExportHeaderImage = async (headerPath = DEFAULT_EXPORT_HEADER_PATH) => {
  const response = await fetch(headerPath);
  if (!response.ok) {
    throw new Error(`Header image not found: ${headerPath}`);
  }

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  const dimensions = await getDataUrlDimensions(dataUrl);
  const extension = String(blob.type || "").toLowerCase().includes("jpeg")
    ? "jpeg"
    : "png";
  const imageFormat = extension === "jpeg" ? "JPEG" : "PNG";

  return { dataUrl, dimensions, extension, imageFormat };
};

export const getStandardPdfHeaderBox = (
  doc,
  {
    left = PDF_HEADER_SIDE_MARGIN_MM,
    right = PDF_HEADER_SIDE_MARGIN_MM,
    top = PDF_HEADER_TOP_MM,
  } = {},
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const width = pageWidth - left - right;
  return {
    x: left,
    y: top,
    width,
    height: width / STANDARD_HEADER_ASPECT_RATIO,
  };
};

export const addStandardPdfHeader = async (doc, headerImage, options = {}) => {
  const {
    top = PDF_HEADER_TOP_MM,
    gapAfter = PDF_HEADER_GAP_AFTER_MM,
  } = options;
  const box = getStandardPdfHeaderBox(doc, options);

  if (!headerImage?.dataUrl || !headerImage?.dimensions) {
    return {
      nextY: top + box.height + gapAfter,
      box,
    };
  }

  const normalizedDataUrl = await createNormalizedBannerDataUrl(
    headerImage.dataUrl,
    headerImage.dimensions,
    NORMALIZED_HEADER_WIDTH_PX,
    NORMALIZED_HEADER_HEIGHT_PX,
  );

  doc.addImage(
    normalizedDataUrl,
    headerImage.imageFormat || "PNG",
    box.x,
    box.y,
    box.width,
    box.height,
  );

  return {
    nextY: box.y + box.height + gapAfter,
    box,
  };
};

export const getStandardCanvasHeaderBox = (canvasWidth) => ({
  x: CANVAS_HEADER_SIDE_MARGIN_PX,
  y: CANVAS_HEADER_TOP_PX,
  width: canvasWidth - CANVAS_HEADER_SIDE_MARGIN_PX * 2,
  height:
    (canvasWidth - CANVAS_HEADER_SIDE_MARGIN_PX * 2) /
    STANDARD_HEADER_ASPECT_RATIO,
});

export const drawStandardCanvasHeader = async (ctx, canvasWidth, loadImageFromDataUrl, headerImage) => {
  const box = getStandardCanvasHeaderBox(canvasWidth);
  if (!headerImage?.dataUrl) {
    return {
      nextY: box.y + box.height + 24,
      box,
    };
  }

  const normalizedDataUrl = await createNormalizedBannerDataUrl(
    headerImage.dataUrl,
    headerImage.dimensions,
    NORMALIZED_HEADER_WIDTH_PX,
    NORMALIZED_HEADER_HEIGHT_PX,
  );
  const image = await loadImageFromDataUrl(normalizedDataUrl);
  ctx.drawImage(image, box.x, box.y, box.width, box.height);

  return {
    nextY: box.y + box.height + 24,
    box,
  };
};
