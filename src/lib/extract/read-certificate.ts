// Browser only: reads a file, finds its type and fills the fields. Used by "Add from files"
// and by "Test with a sample" in the type editor.

import { readFile, type ReadProgress, type ReadResult } from "@/lib/ocr/engine";
import { rowsToText } from "@/lib/ocr/layout";
import type { FieldDef } from "@/lib/types/schema";

import {
  detectType,
  extractFields,
  mergeExtractions,
  needsReread,
  pagesToRows,
  type Detection,
  type Extraction,
  type TypeForDetect,
} from "./extract";

export interface CertificateReading {
  read: ReadResult;
  detection: Detection;
  /** The text that was read, row by row */
  text: string;
}

export async function readCertificate(
  file: Blob,
  types: TypeForDetect[],
  onProgress?: (p: ReadProgress) => void,
): Promise<CertificateReading> {
  const read = await readFile(file, onProgress);
  return {
    read,
    detection: detectType(read.pages, types),
    text: rowsToText(pagesToRows(read.pages)),
  };
}

/** Fills one type's fields; reads the file a second time only if something important is unclear. */
export async function fillFields(
  reading: CertificateReading,
  fields: FieldDef[],
  onProgress?: (p: ReadProgress) => void,
): Promise<{ extraction: Extraction; reread: boolean }> {
  let extraction = extractFields(reading.read.pages, fields);
  if (!needsReread(extraction, fields)) return { extraction, reread: false };
  const again = await reading.read.reread(onProgress);
  extraction = mergeExtractions(extraction, extractFields(again, fields), fields);
  return { extraction, reread: true };
}
