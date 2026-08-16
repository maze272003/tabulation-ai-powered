const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function formatDateTime(timestamp: number): string {
  return dateTimeFormat.format(new Date(timestamp));
}

export function formatDate(timestamp: number): string {
  return dateFormat.format(new Date(timestamp));
}
