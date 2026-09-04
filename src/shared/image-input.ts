export const MAX_IMAGE_ATTACHMENTS = 4;

/** Convert pasted data URIs into Pi's native image content parts. */
export function toPromptImages(images: string[]) {
  return images.filter(Boolean).slice(0, MAX_IMAGE_ATTACHMENTS).map((item) => {
    const match = item.match(/^data:([^;]+);base64,(.+)$/);
    return {
      type: "image" as const,
      mimeType: match?.[1] ?? "image/png",
      data: match?.[2] ?? item.replace(/^data:[^;]+;base64,/, ""),
    };
  });
}
