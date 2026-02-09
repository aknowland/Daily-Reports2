import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";

interface Photo {
  id: number | string;
  path: string;
  caption?: string | null;
  projectName?: string;
  reportDate?: string;
  [key: string]: unknown;
}

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhotoLightbox({ photos, initialIndex, open, onOpenChange }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goNext, goPrev, onOpenChange]);

  if (photos.length === 0) return null;

  const photo = photos[currentIndex];
  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-0 border-0 bg-black/95 overflow-visible [&>button]:hidden">
        <div className="relative flex flex-col items-center justify-center w-full h-[90vh]">
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <span className="text-white/70 text-sm" data-testid="text-photo-counter">
              {currentIndex + 1} / {photos.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="text-white"
              onClick={() => {
                const link = document.createElement("a");
                link.href = photo.path;
                link.download = photo.caption || `photo-${photo.id}`;
                link.click();
              }}
              data-testid="button-download-photo"
            >
              <Download className="w-5 h-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-lightbox"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {photos.length > 1 && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white"
                onClick={goPrev}
                data-testid="button-prev-photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white"
                onClick={goNext}
                data-testid="button-next-photo"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            </>
          )}

          <div className="flex-1 flex items-center justify-center w-full p-4">
            <img
              src={photo.path}
              alt={photo.caption || "Photo"}
              className="max-w-full max-h-[75vh] object-contain rounded"
              data-testid={`lightbox-img-${photo.id}`}
            />
          </div>

          {(photo.caption || photo.projectName) && (
            <div className="w-full px-6 pb-4 text-center">
              {photo.caption && (
                <p className="text-white text-sm font-medium" data-testid="text-photo-caption">{photo.caption}</p>
              )}
              {photo.projectName && (
                <p className="text-white/60 text-xs mt-1">
                  {photo.projectName}{photo.reportDate ? ` • ${photo.reportDate}` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
