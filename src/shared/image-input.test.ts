import { describe, expect, it } from "vitest";
import { toPromptImages } from "./image-input";

describe("toPromptImages", () => {
  it("converts data URIs into Pi native image parts", () => {
    expect(toPromptImages(["data:image/png;base64,AAA"])).toEqual([
      { type: "image", mimeType: "image/png", data: "AAA" },
    ]);
  });

  it("limits attachments without changing their content", () => {
    const images = Array.from({ length: 5 }, (_, index) => `data:image/jpeg;base64,image-${index}`);
    expect(toPromptImages(images)).toHaveLength(4);
    expect(toPromptImages(images)[3]).toEqual({ type: "image", mimeType: "image/jpeg", data: "image-3" });
  });
});
