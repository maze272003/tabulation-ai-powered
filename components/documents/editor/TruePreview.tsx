"use client";

import { useEffect, useRef, useState } from "react";
import type { DocumentSpec } from "@/convex/documents/spec";
import { renderPdfBlob } from "@/lib/documents/renderPdf";
import { sampleTokenMap } from "@/lib/documents/tokens";
import { downloadBlobFile } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";

const RENDER_DEBOUNCE_MS = 300;
const SAMPLE_PDF_FILENAME = "certificate-sample.pdf";
const RENDER_FAILURE_MESSAGE = "Failed to render PDF.";

export interface TruePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: DocumentSpec;
  imageUrls: Record<string, string>;
}

/**
 * Shows the real PDF output (not an HTML approximation) by rendering the spec
 * with the production renderer and displaying the blob in an iframe.
 */
export function TruePreview({ open, onOpenChange, spec, imageUrls }: TruePreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Holds the live blob URL so the unmount-only cleanup can revoke it without
  // depending on reactive state (refs are exempt from exhaustive-deps).
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setError(null);
        try {
          const blob = await renderPdfBlob([{ spec, tokens: sampleTokenMap() }], imageUrls);
          if (cancelled) return;
          const previousUrl = urlRef.current;
          const createdUrl = URL.createObjectURL(blob);
          urlRef.current = createdUrl;
          setPdfUrl(createdUrl);
          if (previousUrl) URL.revokeObjectURL(previousUrl);
        } catch (cause) {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : RENDER_FAILURE_MESSAGE);
          }
        }
      })();
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, spec, imageUrls]);

  // Unmount-only revoke; the ref is stable, so no reactive deps are needed.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function downloadSamplePdf() {
    setDownloading(true);
    try {
      const blob = await renderPdfBlob([{ spec, tokens: sampleTokenMap() }], imageUrls);
      downloadBlobFile(SAMPLE_PDF_FILENAME, blob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : RENDER_FAILURE_MESSAGE);
    } finally {
      setDownloading(false);
    }
  }

  // Derived: while open with neither a rendered URL nor an error, the
  // debounced render is in flight. Re-renders keep the previous page visible
  // until the new blob replaces it (progressive, Canva-like).
  const rendering = open && !pdfUrl && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>True preview</DialogTitle>
          <DialogDescription>
            This is the actual PDF output — identical to the downloaded file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-[70vh] flex-col gap-2">
          {rendering ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              Rendering…
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : pdfUrl ? (
            <iframe title="PDF preview" src={pdfUrl} className="flex-1 rounded-md border border-border" />
          ) : null}
          <div className="flex justify-end">
            <Button
              onClick={() => void downloadSamplePdf()}
              disabled={rendering || downloading || Boolean(error)}
            >
              <Download aria-hidden className="size-4" />
              Download sample
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
