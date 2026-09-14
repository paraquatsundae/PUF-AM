import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { MAX_PHOTOS_PER_RECORD, TooManyPhotosError } from '../../lib/farmPhoto';
import { PhotoTooLargeError, compressFarmPhoto } from '../../lib/photoCompress';

export type FarmPhotoPreview = {
  id: string;
  src: string;
};

export function IssuePhotoField({
  disabled,
  photos = [],
  max = MAX_PHOTOS_PER_RECORD,
  onAdd,
  onRemove,
  addLabel = 'Add photo',
}: {
  disabled?: boolean;
  /** Existing / pending previews (object URLs or hosted URLs). */
  photos?: FarmPhotoPreview[];
  max?: number;
  onAdd: (photo: Blob) => void | Promise<void>;
  onRemove?: (id: string) => void | Promise<void>;
  addLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      /* caller owns object URLs */
    };
  }, []);

  const atCap = photos.length >= max;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (atCap) {
      setError(new TooManyPhotosError(max).message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressFarmPhoto(file);
      await onAdd(compressed.blob);
    } catch (err) {
      setError(
        err instanceof PhotoTooLargeError || err instanceof TooManyPhotosError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not read that photo',
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled || busy || atCap}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              <img src={photo.src} alt="" className="w-full h-20 object-cover rounded-lg" />
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => void onRemove(photo.id)}
                  disabled={disabled}
                  className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-slate-600"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {atCap ? (
        <p className="text-[11px] text-slate-500">
          {max} photos — remove one to add another
        </p>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="w-full py-2 rounded-lg border border-dashed border-slate-300 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          <Camera className="w-3.5 h-3.5" />
          {busy ? 'Shrinking photo…' : photos.length ? `Add another photo (${photos.length}/${max})` : addLabel}
        </button>
      )}
      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
