import React, { useEffect, useRef, useState } from "react";
import Modal, { ModalFooter } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 220;

function SignaturePadModal({ isOpen, onClose, onSave }) {
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const lastMidPointRef = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const logicalWidth = Math.max(canvas.clientWidth || CANVAS_WIDTH, 1);
    const logicalHeight = Math.max(canvas.clientHeight || CANVAS_HEIGHT, 1);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.floor(logicalWidth * dpr);
    canvas.height = Math.floor(logicalHeight * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    return ctx;
  };

  useEffect(() => {
    if (!isOpen) return;
    setupCanvas();
    isDrawingRef.current = false;
    lastPointRef.current = null;
    lastMidPointRef.current = null;
    setHasSignature(false);
  }, [isOpen]);

  const getPosition = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const point = event.touches?.[0]
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
      : { x: event.clientX, y: event.clientY };

    return {
      x: point.x - rect.left,
      y: point.y - rect.top,
    };
  };

  const midpoint = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const startDrawing = (event) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const pos = getPosition(event);
    const dotSize = ctx.lineWidth / 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();

    lastPointRef.current = pos;
    lastMidPointRef.current = pos;
    isDrawingRef.current = true;
    setHasSignature(true);
  };

  const draw = (event) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const pos = getPosition(event);
    const lastPoint = lastPointRef.current;
    const lastMidPoint = lastMidPointRef.current;
    if (!lastPoint || !lastMidPoint) {
      lastPointRef.current = pos;
      lastMidPointRef.current = pos;
      return;
    }

    const mid = midpoint(lastPoint, pos);
    ctx.beginPath();
    ctx.moveTo(lastMidPoint.x, lastMidPoint.y);
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, mid.x, mid.y);
    ctx.stroke();

    lastPointRef.current = pos;
    lastMidPointRef.current = mid;
    setHasSignature(true);
  };

  const stopDrawing = (event) => {
    if (event) event.preventDefault();
    isDrawingRef.current = false;
    lastPointRef.current = null;
    lastMidPointRef.current = null;
  };

  const clearCanvas = () => {
    const ctx = setupCanvas();
    if (!ctx) return;

    isDrawingRef.current = false;
    lastPointRef.current = null;
    lastMidPointRef.current = null;
    setHasSignature(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    // Export a compressed JPEG data URL (smaller payload than PNG)
    try {
      const MAX_WIDTH = 900;
      const MAX_HEIGHT = 300;
      let exportCanvas = canvas;

      const logicalW = canvas.width || CANVAS_WIDTH;
      const logicalH = canvas.height || CANVAS_HEIGHT;
      const scale = Math.min(1, MAX_WIDTH / logicalW, MAX_HEIGHT / logicalH);

      if (scale < 1) {
        const off = document.createElement('canvas');
        off.width = Math.floor(logicalW * scale);
        off.height = Math.floor(logicalH * scale);
        const offCtx = off.getContext('2d');
        offCtx.drawImage(canvas, 0, 0, off.width, off.height);
        exportCanvas = off;
      }

      const image = exportCanvas.toDataURL('image/jpeg', 0.8);
      onSave?.(image);
    } catch (_err) {
      const image = canvas.toDataURL('image/png');
      onSave?.(image);
    }

    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<span className="font-black font-inter">Attach Signature</span>}
      size="2xl"
      showCloseButton
    >
      <div>
        <p className="text-sm text-gray-300 mb-4">
          Draw the student signature using your mouse or touchpad.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <canvas
            ref={canvasRef}
            className="w-full h-[220px] rounded-lg cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        <ModalFooter className="pt-4">
          <Button
            variant="secondary"
            type="button"
            className="px-6"
            onClick={clearCanvas}
          >
            Clear Pad
          </Button>
          <Button
            variant="outline"
            type="button"
            className="px-6 bg-white text-[#1a1a1a] border-0 hover:bg-gray-100"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            className="px-6 bg-[#556987] text-white hover:bg-[#3d4654]"
            onClick={handleSave}
            disabled={!hasSignature}
          >
            Save Signature
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default SignaturePadModal;
