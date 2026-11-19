import { imageSize } from "@/lib/plan-reading";

/*
 * Saving a drawn plan as a PNG in the browser (docs/implementation-plan.md,
 * step 11). The SVG on the page is copied with the styles it is drawn with
 * (its classes come from the page's stylesheet, which an image does not
 * see), its images are fetched and inlined as data URLs (an image drawn from
 * a URL would be missing or taint the canvas), and the copy is drawn on a
 * canvas on a white background.
 */

/** The styles that decide how SVG content looks, copied from the page. */
const STYLES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "dominant-baseline",
  "text-anchor",
  "rotate",
  "transform-box",
  "transform-origin",
  "visibility",
  "display",
  "paint-order",
] as const;

function copyStyles(source: Element, target: Element) {
  const computed = getComputedStyle(source);
  const style = (target as SVGElement).style;
  for (const name of STYLES) {
    const value = computed.getPropertyValue(name);
    if (value) {
      // The page's web fonts are not loaded in an image: fall back to a common sans-serif.
      style.setProperty(name, name === "font-family" ? `${value}, Arial, Helvetica, sans-serif` : value);
    }
  }
  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < sourceChildren.length; i++) {
    copyStyles(sourceChildren[i], targetChildren[i]);
  }
}

async function dataUrl(href: string): Promise<string> {
  const response = await fetch(href, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`image ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Replaces every image's address with its data, each address fetched once. */
async function inlineImages(svg: SVGSVGElement) {
  const images = [...svg.querySelectorAll("image")];
  const cache = new Map<string, Promise<string>>();
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
      if (!href || href.startsWith("data:")) {
        return;
      }
      if (!cache.has(href)) {
        cache.set(href, dataUrl(href));
      }
      image.setAttribute("href", await cache.get(href)!);
      image.removeAttribute("xlink:href");
    }),
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("svg image"));
    image.src = url;
  });
}

/** The drawing as a PNG blob, its long side `longSide` pixels. */
export async function planPng(svg: SVGSVGElement, longSide?: number): Promise<Blob> {
  const viewBox = svg.viewBox.baseVal;
  const size = imageSize({ width: viewBox.width, height: viewBox.height }, longSide);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copyStyles(svg, copy);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(size.width));
  copy.setAttribute("height", String(size.height));
  copy.removeAttribute("class");
  copy.style.removeProperty("display");
  await inlineImages(copy);

  const markup = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Hands a blob to the browser as a download. */
export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
