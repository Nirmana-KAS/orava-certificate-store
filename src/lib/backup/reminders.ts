/** Choices for how often to be reminded about backups (days; 0 = never). */
export const REMIND_CHOICES = [
  { days: 1, label: "Every day" },
  { days: 3, label: "Every 3 days" },
  { days: 7, label: "Every week" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Every month" },
  { days: 0, label: "Never" },
] as const;

export const remindLabel = (days: number) =>
  REMIND_CHOICES.find((c) => c.days === days)?.label ?? `Every ${days} days`;
