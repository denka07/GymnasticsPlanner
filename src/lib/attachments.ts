/*
 * Pure rules for session attachments (docs/data-model.md, "Attachment"):
 * which files are accepted, how they are named and where they are stored.
 * Shared by the server, which enforces them, and the browser, which checks
 * the same rules first to give a quick error.
 */

/** Largest accepted file: 10 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** The accepted media types: photos and PDFs. */
export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** For the file picker's `accept` attribute; the extensions help phones that report no type for HEIC. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_TYPES, ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".pdf"].join(",");

export function isAttachmentType(type: unknown): type is AttachmentType {
  return typeof type === "string" && (ATTACHMENT_TYPES as readonly string[]).includes(type);
}

/** Why a file cannot be attached, or null when it can. */
export type AttachmentProblem = "wrongType" | "tooLarge" | "empty";

const TYPE_BY_EXTENSION: Record<string, AttachmentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

/**
 * The media type a file declares, falling back to its extension when the
 * browser reports none (some phones do so for HEIC photos).
 */
export function declaredType(file: { name: string; type: string }): string {
  if (file.type) {
    return file.type.toLowerCase();
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[extension] ?? "";
}

/** Checks a file's declared type and size before it is uploaded. */
export function checkAttachment(file: { type: string; size: number }): AttachmentProblem | null {
  if (!isAttachmentType(file.type)) {
    return "wrongType";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "empty";
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return "tooLarge";
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

/** HEIF brands in the `ftyp` box: HEIC photos from phones, and plain HEIF. */
const HEIC_BRANDS = ["heic", "heix", "heim", "heis", "hevc", "hevx"];
const HEIF_BRANDS = ["mif1", "msf1"];

/**
 * The accepted media type the file's first bytes show, or null. Needs at
 * least the first 12 bytes. The stored type comes from here, not from what
 * the browser said.
 */
export function sniffType(bytes: Uint8Array): AttachmentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, ascii("%PDF-"))) {
    return "application/pdf";
  }
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (HEIC_BRANDS.includes(brand)) {
      return "image/heic";
    }
    if (HEIF_BRANDS.includes(brand)) {
      return "image/heif";
    }
  }
  return null;
}

/** How many leading bytes sniffType needs. */
export const SNIFF_BYTES = 16;

/** Longest original file name kept, in characters. */
export const FILE_NAME_MAX = 200;

/**
 * The original file name as shown in the list: without any folder part,
 * control characters or surrounding space, at most FILE_NAME_MAX characters.
 */
export function displayFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "fil";
  if (clean.length <= FILE_NAME_MAX) {
    return clean;
  }
  // Shorten the name but keep a short extension.
  const dot = clean.lastIndexOf(".");
  const extension = dot > 0 && clean.length - dot <= 11 ? clean.slice(dot) : "";
  return clean.slice(0, FILE_NAME_MAX - extension.length) + extension;
}

/**
 * A file name safe to use in a storage path and a header: ASCII letters,
 * digits, dot, dash and underscore only, at most 80 characters, keeping the
 * extension. Swedish letters lose their dots and rings (å → a).
 */
export function safeFileName(name: string): string {
  const base = displayFileName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot + 1) : "";
  const cleanStem = stem
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  const cleanExtension = extension.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toLowerCase();
  const maxStem = 80 - (cleanExtension ? cleanExtension.length + 1 : 0);
  const finalStem = (cleanStem || "fil").slice(0, maxStem);
  return cleanExtension ? `${finalStem}.${cleanExtension}` : finalStem;
}

/** A path segment of the environment prefix: lowercase letters, digits and dashes. */
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * The top of every stored file's path, which keeps environments apart in the
 * one Blob store: ATTACHMENTS_PATH_ENV when set (the browser tests use
 * "e2e/<run id>"), otherwise VERCEL_ENV (production, preview), otherwise
 * "development".
 */
export function blobEnvironment(env: Record<string, string | undefined>): string {
  const value = (env.ATTACHMENTS_PATH_ENV || env.VERCEL_ENV || "development").toLowerCase();
  const segments = value.split("/");
  if (segments.length > 2 || !segments.every((s) => SEGMENT.test(s))) {
    throw new Error("ATTACHMENTS_PATH_ENV must be one or two segments of a-z, 0-9 and -.");
  }
  return value;
}

/** The folder of a session's files: `<env>/sessions/<sessionId>/`. */
export function sessionFolder(environment: string, sessionId: string): string {
  return `${environment}/sessions/${sessionId}/`;
}

/**
 * Where a new file of the session is stored:
 * `<env>/sessions/<sessionId>/<random>-<safe file name>`. `random` makes the
 * path unique, so an upload never overwrites another.
 */
export function attachmentPath(
  environment: string,
  sessionId: string,
  random: string,
  fileName: string,
): string {
  return `${sessionFolder(environment, sessionId)}${random}-${safeFileName(fileName)}`;
}

/**
 * True when `pathname` is a file directly in the session's folder with a name
 * attachmentPath could have made. The server only accepts uploads to such
 * paths, so an editor of one session cannot claim another's files.
 */
export function isSessionPath(pathname: string, environment: string, sessionId: string): boolean {
  const folder = sessionFolder(environment, sessionId);
  if (!pathname.startsWith(folder)) {
    return false;
  }
  return /^[A-Za-z0-9]{8,64}-[A-Za-z0-9._-]{1,80}$/.test(pathname.slice(folder.length));
}

/** The stored files among `pathnames` that no attachment refers to any more. */
export function unreferenced(pathnames: Iterable<string>, stillReferenced: Iterable<string>): string[] {
  const kept = new Set(stillReferenced);
  return [...new Set(pathnames)].filter((p) => !kept.has(p));
}

/**
 * A `Content-Disposition` header that shows the file in the browser under its
 * original name: an ASCII fallback plus the UTF-8 name (RFC 6266).
 */
export function inlineDisposition(fileName: string): string {
  const fallback = safeFileName(fileName);
  const encoded = encodeURIComponent(displayFileName(fileName)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** A file size for people: "820 B", "34 kB", "2,4 MB" in Swedish. */
export function formatFileSize(bytes: number, locale: string): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1000 * 1000) {
    return `${Math.round(bytes / 1000)} kB`;
  }
  const mb = bytes / (1000 * 1000);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
}
