import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_MAX_BYTES,
  attachmentPath,
  blobEnvironment,
  checkAttachment,
  declaredType,
  displayFileName,
  formatFileSize,
  inlineDisposition,
  isSessionPath,
  safeFileName,
  sniffType,
  unreferenced,
} from "./attachments";

const SESSION = "6f1c2a4e-1b2c-4d5e-8f90-0123456789ab";

function bytes(...parts: (number[] | string)[]): Uint8Array {
  return new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
}

describe("checkAttachment", () => {
  it("accepts photos and PDFs up to 10 MB", () => {
    expect(checkAttachment({ type: "image/png", size: 1 })).toBeNull();
    expect(checkAttachment({ type: "application/pdf", size: ATTACHMENT_MAX_BYTES })).toBeNull();
    expect(checkAttachment({ type: "image/heic", size: 5_000_000 })).toBeNull();
  });

  it("refuses other types, empty and too large files", () => {
    expect(checkAttachment({ type: "video/mp4", size: 10 })).toBe("wrongType");
    expect(checkAttachment({ type: "image/svg+xml", size: 10 })).toBe("wrongType");
    expect(checkAttachment({ type: "", size: 10 })).toBe("wrongType");
    expect(checkAttachment({ type: "image/png", size: 0 })).toBe("empty");
    expect(checkAttachment({ type: "image/png", size: ATTACHMENT_MAX_BYTES + 1 })).toBe("tooLarge");
  });
});

describe("declaredType", () => {
  it("uses the browser's type, else the extension", () => {
    expect(declaredType({ name: "a.png", type: "IMAGE/PNG" })).toBe("image/png");
    expect(declaredType({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(declaredType({ name: "noext", type: "" })).toBe("");
  });
});

describe("sniffType", () => {
  it("recognises the accepted formats by their first bytes", () => {
    expect(sniffType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffType(bytes([0, 0, 0, 24], "ftypheic", [0, 0, 0, 0]))).toBe("image/heic");
    expect(sniffType(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0]))).toBe("image/heif");
  });

  it("refuses anything else, whatever its name says", () => {
    expect(sniffType(bytes("<svg xmlns="))).toBeNull();
    expect(sniffType(bytes("<!DOCTYPE html>"))).toBeNull();
    expect(sniffType(bytes([0, 0, 0, 24], "ftypisom", [0, 0, 0, 0]))).toBeNull(); // MP4 video
    expect(sniffType(bytes("RIFF", [1, 2, 3, 4], "AVI "))).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });
});

describe("file names", () => {
  it("keeps the shown name readable but drops folders and control characters", () => {
    expect(displayFileName("C:\\Users\\x\\Övning 1.pdf")).toBe("Övning 1.pdf");
    expect(displayFileName("../../etc/passwd")).toBe("passwd");
    expect(displayFileName(" a\u0000b.png ")).toBe("ab.png");
    expect(displayFileName("   ")).toBe("fil");
    expect(displayFileName("x".repeat(300))).toHaveLength(200);
  });

  it("makes a safe ASCII name for paths and headers", () => {
    expect(safeFileName("Övningar för hopp.PDF")).toBe("Ovningar-for-hopp.pdf");
    expect(safeFileName("bild (1).jpeg")).toBe("bild-1.jpeg");
    expect(safeFileName('a"b;c.png')).toBe("a-b-c.png");
    expect(safeFileName("...")).toBe("fil");
    expect(safeFileName("åäö")).toBe("aao");
    expect(safeFileName("💪.png")).toBe("fil.png");
    const long = safeFileName(`${"a".repeat(200)}.pdf`);
    expect(long).toHaveLength(80);
    expect(long.endsWith(".pdf")).toBe(true);
  });
});

describe("storage paths", () => {
  it("separates environments", () => {
    expect(blobEnvironment({})).toBe("development");
    expect(blobEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(blobEnvironment({ VERCEL_ENV: "production", ATTACHMENTS_PATH_ENV: "e2e/ab12" })).toBe("e2e/ab12");
    expect(() => blobEnvironment({ ATTACHMENTS_PATH_ENV: "../x" })).toThrow();
    expect(() => blobEnvironment({ ATTACHMENTS_PATH_ENV: "a/b/c" })).toThrow();
  });

  it("builds a path in the session's folder that isSessionPath accepts", () => {
    const path = attachmentPath("development", SESSION, "0123456789abcdef", "Plan för v.12.pdf");
    expect(path).toBe(`development/sessions/${SESSION}/0123456789abcdef-Plan-for-v-12.pdf`);
    expect(isSessionPath(path, "development", SESSION)).toBe(true);
  });

  it("refuses paths of another session, environment or shape", () => {
    const other = "11111111-1b2c-4d5e-8f90-0123456789ab";
    const path = attachmentPath("development", SESSION, "0123456789abcdef", "a.png");
    expect(isSessionPath(path, "development", other)).toBe(false);
    expect(isSessionPath(path, "production", SESSION)).toBe(false);
    expect(isSessionPath(`development/sessions/${SESSION}/x/0123456789abcdef-a.png`, "development", SESSION)).toBe(false);
    expect(isSessionPath(`development/sessions/${SESSION}/a.png`, "development", SESSION)).toBe(false);
    expect(isSessionPath(`development/sessions/${SESSION}/0123456789abcdef-../a`, "development", SESSION)).toBe(false);
  });
});

describe("unreferenced", () => {
  it("lists each stored file that nothing refers to any more, once", () => {
    expect(unreferenced(["a", "b", "a", "c"], ["b"])).toEqual(["a", "c"]);
    expect(unreferenced([], ["b"])).toEqual([]);
  });
});

describe("inlineDisposition", () => {
  it("gives an ASCII fallback and the UTF-8 name", () => {
    expect(inlineDisposition("Övning (1).pdf")).toBe(
      `inline; filename="Ovning-1.pdf"; filename*=UTF-8''%C3%96vning%20%281%29.pdf`,
    );
  });
});

describe("formatFileSize", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatFileSize(820, "sv")).toBe("820 B");
    expect(formatFileSize(34_400, "sv")).toBe("34 kB");
    expect(formatFileSize(2_430_000, "sv")).toBe("2,4 MB");
  });
});
