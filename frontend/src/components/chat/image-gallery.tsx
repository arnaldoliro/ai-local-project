"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { attachmentUrl, type Attachment } from "@/lib/api";

/**
 * Images of a sent message. Clicking one zooms it with a shared-layout
 * animation (same `layoutId` on the thumbnail and the full view).
 */
export function ImageGallery({ images }: { images: Attachment[] }) {
  const [open, setOpen] = useState<Attachment | null>(null);

  return (
    <>
      <div className={`grid gap-2 ${images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {images.map((image) => (
          <motion.button
            key={image.id}
            type="button"
            layoutId={`image-${image.id}`}
            onClick={() => setOpen(image)}
            className="overflow-hidden rounded-xl border border-white/10"
            aria-label="Ampliar imagem"
          >
            {/* Served by our API, already resized: next/image would add nothing. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachmentUrl(image.id)}
              alt=""
              width={image.width}
              height={image.height}
              loading="lazy"
              className="max-h-60 w-full object-cover"
            />
          </motion.button>
        ))}
      </div>
      <Lightbox image={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Lightbox({ image, onClose }: { image: Attachment | null; onClose: () => void }) {
  useEffect(() => {
    if (!image) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image, onClose]);

  // Portal: an ancestor with a CSS transform (the message's enter animation)
  // would otherwise trap this `position: fixed` overlay inside it.
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {image && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <motion.div layoutId={`image-${image.id}`} className="overflow-hidden rounded-2xl shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachmentUrl(image.id)}
              alt=""
              width={image.width}
              height={image.height}
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
