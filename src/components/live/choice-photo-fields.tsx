'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { UploadField } from '@/components/live/payment-forms';
import { secondaryButton } from '@/components/live/form-styles';
import { resolveImagePath } from '@/lib/media/resolve-image';

export type ChoicePhotoFieldsProps = {
  /** The add-on's current label, used only to identify its photo controls. */
  label: string;
  /** Current choice names; each nonblank string is the stable photo association key. */
  variants: readonly string[];
  imagePaths: Readonly<Record<string, string | null | undefined>>;
  upload: (file: File) => Promise<string | null>;
  onChange: (variant: string, path: string | null) => void;
  /** Lets the containing save action stay disabled until every upload has settled. */
  onUploadsBusyChange?: (busy: boolean) => void;
  /** Locks uploads and removals, for example while the containing form is saving. */
  disabled?: boolean;
};

export function ChoicePhotoFields({
  label,
  variants,
  imagePaths,
  upload,
  onChange,
  onUploadsBusyChange,
  disabled = false
}: ChoicePhotoFieldsProps) {
  const currentVariants = useRef<readonly string[]>(variants);
  const onChangeRef = useRef(onChange);
  const busyCallback = useRef(onUploadsBusyChange);
  const activeUploads = useRef(new Set<symbol>());
  const mounted = useRef(false);
  const reportedBusy = useRef(false);

  useEffect(() => {
    currentVariants.current = variants;
    onChangeRef.current = onChange;
    busyCallback.current = onUploadsBusyChange;
  }, [variants, onChange, onUploadsBusyChange]);

  const reportBusy = useCallback(() => {
    if (!mounted.current) return;
    const next = activeUploads.current.size > 0;
    if (reportedBusy.current === next) return;
    reportedBusy.current = next;
    busyCallback.current?.(next);
  }, []);

  const startUpload = useCallback(() => {
    const token = Symbol('choice-photo-upload');
    activeUploads.current.add(token);
    reportBusy();
    return token;
  }, [reportBusy]);

  const finishUpload = useCallback(
    (token: symbol) => {
      if (activeUploads.current.delete(token)) reportBusy();
    },
    [reportBusy]
  );

  useEffect(() => {
    const uploads = activeUploads.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploads.clear();
      if (reportedBusy.current) {
        reportedBusy.current = false;
        busyCallback.current?.(false);
      }
    };
  }, []);

  // A choice is keyed by its trimmed name, as the save stores it; a repeated name gets one row.
  const choices = [...new Set(variants.map((variant) => variant.trim()).filter(Boolean))];
  if (choices.length === 0) return null;

  return (
    <fieldset aria-label={`${label} choice photos`} className="space-y-2">
      <legend className="text-caption font-semibold text-ink">Photos for each choice</legend>
      {choices.map((variant) => (
        <ChoicePhotoRow
          key={variant}
          label={label}
          variant={variant}
          imagePath={imagePaths[variant] ?? null}
          upload={upload}
          onChange={onChangeRef}
          isCurrent={(choice) =>
            currentVariants.current.some((current) => current.trim() === choice)
          }
          startUpload={startUpload}
          finishUpload={finishUpload}
          disabled={disabled}
        />
      ))}
    </fieldset>
  );
}

function ChoicePhotoRow({
  label,
  variant,
  imagePath,
  upload,
  onChange,
  isCurrent,
  startUpload,
  finishUpload,
  disabled
}: {
  label: string;
  variant: string;
  imagePath: string | null;
  upload: (file: File) => Promise<string | null>;
  onChange: { current: (variant: string, path: string | null) => void };
  isCurrent: (variant: string) => boolean;
  startUpload: () => symbol;
  finishUpload: (token: symbol) => void;
  disabled: boolean;
}) {
  const mounted = useRef(true);
  const uploadToken = useRef<symbol | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const token = uploadToken.current;
      uploadToken.current = null;
      if (token) finishUpload(token);
    };
  }, [finishUpload]);

  const image = imagePath ? resolveImagePath(imagePath) : '';
  const handleBusyChange = (busy: boolean) => {
    if (!mounted.current) return;
    if (busy) {
      if (!uploadToken.current) {
        uploadToken.current = startUpload();
        setUploading(true);
      }
      return;
    }
    const token = uploadToken.current;
    uploadToken.current = null;
    if (token) {
      finishUpload(token);
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface p-3">
      {image ? (
        <Image
          src={image}
          alt={`${label} ${variant}`}
          width={64}
          height={64}
          unoptimized
          className="h-16 w-16 rounded-control border border-line object-cover"
        />
      ) : null}
      <span className="min-w-24 flex-1 text-body text-ink">{variant}</span>
      <UploadField
        upload={upload}
        label={imagePath ? 'Replace photo' : 'Upload photo'}
        hint={`${label} · ${variant}`}
        onBusyChange={handleBusyChange}
        disabled={disabled}
        onUploaded={(path) => {
          if (mounted.current && isCurrent(variant)) onChange.current(variant, path);
        }}
      />
      {imagePath ? (
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => {
            if (disabled) return;
            if (mounted.current && isCurrent(variant) && uploadToken.current === null)
              onChange.current(variant, null);
          }}
          aria-label={`Remove photo for ${label}: ${variant}`}
          style={secondaryButton}
        >
          Remove photo
        </button>
      ) : null}
    </div>
  );
}
