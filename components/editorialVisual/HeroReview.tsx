"use client";

import { useRef, useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/editorialVisual/Field";
import { StatusNote } from "@/components/editorialVisual/StatusNote";
import { stableInputSignature } from "@/lib/visualWorkflow";

export type HeroCrop = { left: number; top: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function sanitizeCrop(crop: { left: number; top: number; width: number; height: number }, sourceWidth: number, sourceHeight: number): HeroCrop {
  const width = clamp(Math.round(crop.width) || 1, 1, sourceWidth);
  const height = clamp(Math.round(crop.height) || 1, 1, sourceHeight);
  return { left: clamp(Math.round(crop.left) || 0, 0, sourceWidth - width), top: clamp(Math.round(crop.top) || 0, 0, sourceHeight - height), width, height };
}

/**
 * Visual crop rectangle over the source image. Drag the body to move it and
 * the corner handles to resize; keyboard and screen-reader users keep the
 * numeric fine-tune fields rendered beside it.
 */
export function CropControl({ sourceWidth, sourceHeight, crop, disabled, onChange, backdropSrc }: { sourceWidth: number; sourceHeight: number; crop: { left: number; top: number; width: number; height: number }; disabled?: boolean; onChange(crop: HeroCrop): void; backdropSrc?: string | null }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  type Mode = "move" | "nw" | "ne" | "sw" | "se";
  function begin(event: React.PointerEvent<HTMLElement>, mode: Mode) {
    if (disabled || event.button !== 0) return;
    // A corner drag must not also start a body drag when the event bubbles to the rectangle.
    if (mode !== "move") event.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    const scaleX = sourceWidth / box.width;
    const scaleY = sourceHeight / box.height;
    const origin = { x: event.clientX, y: event.clientY };
    const start = sanitizeCrop(crop, sourceWidth, sourceHeight);
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - origin.x) * scaleX;
      const dy = (moveEvent.clientY - origin.y) * scaleY;
      if (mode === "move") onChange(sanitizeCrop({ ...start, left: start.left + dx, top: start.top + dy }, sourceWidth, sourceHeight));
      else onChange(sanitizeCrop({
        left: mode.includes("w") ? start.left + dx : start.left,
        top: mode.includes("n") ? start.top + dy : start.top,
        width: mode === "ne" || mode === "se" ? start.width + dx : mode === "nw" || mode === "sw" ? start.width - dx : start.width,
        height: mode === "sw" || mode === "se" ? start.height + dy : mode === "nw" || mode === "ne" ? start.height - dy : start.height,
      }, sourceWidth, sourceHeight));
      moveEvent.preventDefault();
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      target.releasePointerCapture?.(pointerId);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }
  const safe = sanitizeCrop(crop, sourceWidth, sourceHeight);
  const rect = { left: `${(safe.left / sourceWidth) * 100}%`, top: `${(safe.top / sourceHeight) * 100}%`, width: `${(safe.width / sourceWidth) * 100}%`, height: `${(safe.height / sourceHeight) * 100}%` };
  const handles: [Mode, string][] = [["nw", "cursor-nwse-resize -left-1.5 -top-1.5"], ["ne", "cursor-nesw-resize -right-1.5 -top-1.5"], ["sw", "cursor-nesw-resize -bottom-1.5 -left-1.5"], ["se", "cursor-nwse-resize -bottom-1.5 -right-1.5"]];
  return <div className="space-y-1">
    <div ref={boxRef} role="group" aria-label={`Crop selection over ${sourceWidth} × ${sourceHeight} source; fine-tune with the numeric crop fields below`} className="relative w-full select-none overflow-hidden rounded-lg border border-gray-300 bg-gray-100" style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}>
      {/* Decorative backdrop; review always happens on the stored export rendered below. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {backdropSrc && <img src={backdropSrc} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />}
      <div className="absolute border-2 border-sky-600 bg-sky-600/15" style={rect} onPointerDown={event => begin(event, "move")} data-testid="crop-rect">
        {handles.map(([mode, position]) => <div key={mode} aria-hidden="true" data-testid={`crop-handle-${mode}`} onPointerDown={event => begin(event, mode)} className={`absolute h-3 w-3 rounded-sm bg-sky-700 ${position}`} />)}
      </div>
    </div>
    <p className="text-xs text-gray-500">Drag inside the rectangle to reposition it; drag a corner to resize. The numeric fields fine-tune exact pixels.</p>
  </div>;
}

function storedHeroCrop(version: Doc<"v2VisualVersions">): HeroCrop | null {
  try {
    const crop = JSON.parse(version.exportMetadata?.crop ?? "null")?.crop;
    if (crop && [crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger) && crop.left >= 0 && crop.top >= 0 && crop.width > 0 && crop.height > 0 && crop.left + crop.width <= version.width && crop.top + crop.height <= version.height) return { left: crop.left, top: crop.top, width: crop.width, height: crop.height };
  } catch { /* Older presentation fixtures can have a plain descriptive crop string. */ }
  return null;
}

export function HeroReview({ version, disabled, onPrepare, onApprove }: { version: Doc<"v2VisualVersions"> & { url: string | null; exportUrl: string | null }; disabled: boolean; onPrepare(crop?: HeroCrop): void; onApprove(alt: string, hash: string): void }) {
  const [loaded, setLoaded] = useState(false);
  const [alt, setAlt] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const storedCrop = storedHeroCrop(version);
  const [cropMode, setCropMode] = useState(storedCrop ? "manual" : "center");
  const [cropFields, setCropFields] = useState(() => ({ left: String(storedCrop?.left ?? 0), top: String(storedCrop?.top ?? 0), width: String(storedCrop?.width ?? version.width), height: String(storedCrop?.height ?? version.height) }));
  const crop = { left: Number(cropFields.left), top: Number(cropFields.top), width: Number(cropFields.width), height: Number(cropFields.height) };
  const cropValid = cropMode === "center" || Object.values(cropFields).every(value => /^\d+$/.test(value)) && Object.values(crop).every(Number.isSafeInteger) && crop.left >= 0 && crop.top >= 0 && crop.width > 0 && crop.height > 0 && crop.left + crop.width <= version.width && crop.top + crop.height <= version.height;
  const cropMatchesExport = cropValid && stableInputSignature(cropMode === "center" ? null : crop) === stableInputSignature(storedCrop);
  const exportAvailable = Boolean(version.exportHash && version.exportUrl && version.exportMetadata);
  const metadata = version.exportMetadata;
  const ready = exportAvailable && metadata?.width === 1600 && metadata.height === 900 && metadata.format === "webp" && Number.isSafeInteger(metadata.bytes) && metadata.bytes > 0 && metadata.bytes < 150000;
  return <div className="space-y-3 rounded-lg border border-gray-200 p-3">
    <h3 className="text-sm font-semibold">Final hero</h3>
    <p className="text-xs text-gray-500">Prepare a proportional 16:9 crop as 1600 × 900 WebP under 150 KB, then review the stored export.</p>
    <p className="text-xs text-gray-500">Source dimensions: {version.width} × {version.height} pixels</p>
    <label className="block text-xs font-semibold text-gray-600">Crop mode <select className="rounded border border-gray-200 p-1" value={cropMode} disabled={disabled} onChange={event => setCropMode(event.target.value as typeof cropMode)}><option value="center">Centered 16:9 crop</option><option value="manual">Manual pixel rectangle</option></select></label>
    {cropMode === "manual" && <>
      <CropControl sourceWidth={version.width} sourceHeight={version.height} crop={crop} disabled={disabled} backdropSrc={version.url} onChange={next => setCropFields({ left: String(next.left), top: String(next.top), width: String(next.width), height: String(next.height) })} />
      <div className="grid grid-cols-2 gap-2">{(["left", "top", "width", "height"] as const).map(key => <Field key={key} label={`Crop ${key}`} value={cropFields[key]} onChange={value => setCropFields({ ...cropFields, [key]: value })} numericBounds={{ min: key === "width" || key === "height" ? 1 : 0, max: key === "left" ? version.width - 1 : key === "top" ? version.height - 1 : key === "width" ? version.width : version.height }} />)}</div>
    </>}
    {!cropValid && <StatusNote role="alert">Use whole pixels inside the source image, with positive width and height.</StatusNote>}
    {!cropMatchesExport && cropValid && <StatusNote>Prepare this crop, then review its saved export before approval.</StatusNote>}
    <Button type="button" variant="outline" disabled={disabled || !cropValid} onClick={() => { if (cropValid) onPrepare(cropMode === "manual" ? crop : undefined); }}>Prepare final hero crop</Button>
    {exportAvailable && <>
      {/* Display the authorized stored export directly so review cannot see a second optimized rendition. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={version.exportUrl!} alt="Final hero crop preview" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} className="w-full rounded-lg border border-gray-200" />
      <p className="text-xs text-gray-500">{version.exportMetadata!.width} × {version.exportMetadata!.height} · {version.exportMetadata!.bytes} bytes · {version.exportMetadata!.format.toUpperCase()}</p>
      {!ready && <StatusNote role="alert">This export does not meet the 1600 × 900 WebP and below 150,000-byte requirements. Prepare a compliant crop before approval.</StatusNote>}
      <Field label="Descriptive hero alt text" value={alt} onChange={setAlt} multiline />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this crop for identity, story and thumbnail readability.</label>
      {version.approvedAt && version.approvedExportHash === version.exportHash && version.approvedExportMetadataSignature === stableInputSignature(version.exportMetadata) && <p className="text-sm text-green-700">Hero approval is saved.</p>}
    </>}
    <Button type="button" disabled={disabled || !cropMatchesExport || !ready || !loaded || !reviewed || alt.trim().length < 5 || alt.length > 1000} onClick={() => { if (cropMatchesExport && ready && loaded && reviewed && version.exportHash) onApprove(alt.trim(), version.exportHash); }}>Approve hero</Button>
  </div>;
}
