// src/lib/excel-brand/image.ts
// ─────────────────────────────────────────────────────────────────────
// Environment-aware RusSilica logo loading and workbook registration.
// Reuses a single registered image ID across all worksheets in a workbook.
// ─────────────────────────────────────────────────────────────────────

import type ExcelJS from "exceljs";

export const LOGO_CANONICAL_PATH = "public/brand/russilica-logo.png";
export const LOGO_ASPECT_RATIO = 372 / 369; // ~1.00813 (original dimensions 372x369 px)

let cachedLogoBuffer: Uint8Array | null = null;
let logoBufferPromise: Promise<Uint8Array | null> | null = null;

/**
 * Loads the canonical RusSilica logo PNG buffer in both Node.js (SSR, Vitest)
 * and browser environments.
 */
export async function getRusSilicaLogoBuffer(): Promise<Uint8Array | null> {
  if (cachedLogoBuffer) {
    return cachedLogoBuffer;
  }
  if (logoBufferPromise) {
    return logoBufferPromise;
  }

  logoBufferPromise = (async () => {
    // 1. Node.js environment (Vitest, server-side Next.js, scripts, including Vitest jsdom)
    const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
    if (isNode) {
      try {
        const req = (globalThis as any).__non_webpack_require__ ?? eval("require");
        const fs = req("fs");
        const path = req("path");
        const localPath = path.join(process.cwd(), LOGO_CANONICAL_PATH);
        if (fs.existsSync(localPath)) {
          const buffer = fs.readFileSync(localPath);
          cachedLogoBuffer = new Uint8Array(buffer);
          return cachedLogoBuffer;
        }
      } catch (err) {
        // Fall through to browser fetch
      }
    }

    // 2. Browser environment
    if (typeof window !== "undefined" && typeof fetch === "function") {
      try {
        const res = await fetch("/brand/russilica-logo.png");
        if (res.ok) {
          const ab = await res.arrayBuffer();
          cachedLogoBuffer = new Uint8Array(ab);
          return cachedLogoBuffer;
        }
      } catch (err) {
        // Logo fetch failed or offline
      }
    }

    return null;
  })();

  return logoBufferPromise;
}

/**
 * Registers the RusSilica logo in the workbook exactly once.
 * Reuses the returned image ID across all worksheets.
 */
export async function registerBrandLogo(workbook: ExcelJS.Workbook): Promise<number | null> {
  const existingId = (workbook as any).__russilica_logo_id__;
  if (typeof existingId === "number") {
    return existingId;
  }

  const buffer = await getRusSilicaLogoBuffer();
  if (!buffer) {
    return null;
  }

  const imageId = workbook.addImage({
    buffer: buffer as any,
    extension: "png",
  });

  (workbook as any).__russilica_logo_id__ = imageId;
  return imageId;
}

export interface AddLogoOptions {
  height?: number;
  width?: number;
  col?: number;
  row?: number;
}

/**
 * Adds the registered brand logo to a worksheet preserving aspect ratio.
 */
export function addBrandLogo(
  worksheet: ExcelJS.Worksheet,
  imageId: number,
  options?: AddLogoOptions
): void {
  const height = options?.height ?? 56;
  const width = options?.width ?? Math.round(height * LOGO_ASPECT_RATIO);
  const col = options?.col ?? 0.15;
  const row = options?.row ?? 0.15;

  worksheet.addImage(imageId, {
    tl: { col, row },
    ext: { width, height },
    editAs: "oneCell",
  });
}
