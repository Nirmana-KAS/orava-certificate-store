// Labs and report categories, shared by the admin screens and the server.

export const LOGO_MAX_BYTES = 512 * 1024;
/** Logos are resized in the browser to fit this box before they are sent */
export const LOGO_BOX_PX = 480;

export const CATEGORIES = ["individual", "lot"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  individual: "Individual Gem Stone Report",
  lot: "Lot Wise Gem Stones Report",
};

/** "AIGS" + "individual" gives "AIGS Individual Gem Stone Report". */
export function typeNameFor(labShortName: string, category: Category): string {
  return `${labShortName.trim()} ${CATEGORY_LABELS[category]}`.trim();
}
