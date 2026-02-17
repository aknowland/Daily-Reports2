import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, X, Upload, Loader2 } from "lucide-react";

interface PhotoItem {
  id?: string;
  file?: File;
  preview: string;
  caption: string;
}

interface PhotoUploadProps {
  photos: PhotoItem[];
  onPhotosChange: (photos: PhotoItem[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
}

export function PhotoUpload({ photos, onPhotosChange, disabled, maxPhotos = 20 }: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newPhotos: PhotoItem[] = [];

    for (let i = 0; i < files.length && photos.length + newPhotos.length < maxPhotos; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      const preview = URL.createObjectURL(file);
      newPhotos.push({
        file,
        preview,
        caption: "",
      });
    }

    onPhotosChange([...photos, ...newPhotos]);
    setIsUploading(false);
    e.target.value = "";
  }, [photos, onPhotosChange, maxPhotos]);

  const handleRemovePhoto = useCallback((index: number) => {
    const newPhotos = [...photos];
    if (newPhotos[index].preview.startsWith("blob:")) {
      URL.revokeObjectURL(newPhotos[index].preview);
    }
    newPhotos.splice(index, 1);
    onPhotosChange(newPhotos);
  }, [photos, onPhotosChange]);

  const handleCaptionChange = useCallback((index: number, caption: string) => {
    const newPhotos = [...photos];
    newPhotos[index] = { ...newPhotos[index], caption };
    onPhotosChange(newPhotos);
  }, [photos, onPhotosChange]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          disabled={disabled || photos.length >= maxPhotos}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          data-testid="input-photo-upload"
        />
        <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          disabled || photos.length >= maxPhotos
            ? "border-muted bg-muted/20 cursor-not-allowed"
            : "border-primary/30 hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
        }`}>
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Processing photos...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Tap to upload photos</p>
                <p className="text-sm text-muted-foreground">
                  {photos.length} of {maxPhotos} photos added
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <div key={photo.id || index} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                <img
                  src={photo.preview}
                  alt={photo.caption || `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemovePhoto(index)}
                  data-testid={`button-remove-photo-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              <Input
                type="text"
                placeholder="Add caption..."
                value={photo.caption}
                onChange={(e) => handleCaptionChange(index, e.target.value)}
                disabled={disabled}
                className="mt-2 text-sm h-9"
                data-testid={`input-photo-caption-${index}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
