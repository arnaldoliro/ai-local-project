"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, deleteAttachment, uploadAttachment, type Attachment } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { isImageFile, prepareImage } from "@/lib/images";

/** Same limit as the backend (MAX_IMAGES_PER_MESSAGE). */
export const MAX_ATTACHMENTS = 3;

export type PendingAttachment = {
  localId: string;
  /** Local object URL, so the thumbnail shows before the upload finishes. */
  previewUrl: string;
  status: "processing" | "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
};

/**
 * Images attached to the message being written. Each one is resized in the
 * browser, then uploaded right away (one at a time), so sending the message
 * only has to reference ids.
 */
export function useAttachments() {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [limitError, setLimitError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Free the local previews when the chat view goes away.
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl)), []);

  const patch = useCallback((localId: string, change: Partial<PendingAttachment>) => {
    setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...change } : i)));
  }, []);

  const add = useCallback(
    (files: File[]) => {
      const images = files.filter(isImageFile);
      const room = MAX_ATTACHMENTS - itemsRef.current.length;
      setLimitError(images.length > room ? `Até ${MAX_ATTACHMENTS} imagens por mensagem.` : null);

      for (const file of images.slice(0, Math.max(0, room))) {
        const localId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        const item: PendingAttachment = { localId, previewUrl, status: "processing" };
        itemsRef.current = [...itemsRef.current, item];
        setItems((list) => [...list, item]);

        // Uploads are chained: one at a time, in the order they were added.
        chainRef.current = chainRef.current.then(async () => {
          if (!itemsRef.current.some((i) => i.localId === localId)) return; // removed meanwhile
          try {
            const prepared = await prepareImage(file);
            patch(localId, { status: "uploading" });
            const attachment = await uploadAttachment(prepared);
            if (itemsRef.current.some((i) => i.localId === localId)) {
              patch(localId, { status: "ready", attachment });
            } else {
              void deleteAttachment(attachment.id); // removed while uploading
            }
          } catch (error) {
            patch(localId, {
              status: "error",
              error: error instanceof ApiError ? errorMessage(error.code) : "Não foi possível ler a imagem.",
            });
          }
        });
      }
    },
    [patch],
  );

  const remove = useCallback((localId: string) => {
    const item = itemsRef.current.find((i) => i.localId === localId);
    if (!item) return;
    URL.revokeObjectURL(item.previewUrl);
    if (item.attachment) void deleteAttachment(item.attachment.id);
    itemsRef.current = itemsRef.current.filter((i) => i.localId !== localId);
    setItems((list) => list.filter((i) => i.localId !== localId));
    setLimitError(null);
  }, []);

  /** After a successful send: the uploads now belong to the message. */
  const clear = useCallback(() => {
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    itemsRef.current = [];
    setItems([]);
    setLimitError(null);
  }, []);

  return {
    items,
    ready: items.flatMap((i) => (i.status === "ready" && i.attachment ? [i.attachment] : [])),
    busy: items.some((i) => i.status === "processing" || i.status === "uploading"),
    hasErrors: items.some((i) => i.status === "error"),
    limitError,
    add,
    remove,
    clear,
  };
}
