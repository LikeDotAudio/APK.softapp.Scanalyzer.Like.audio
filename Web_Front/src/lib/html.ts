/** Escape text for use inside HTML markup built from template strings. */
export function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render an OPTIONAL reading. The engine returns null where it read nothing,
 *  and a template literal prints null as the word "null" — which reads as a
 *  value. An em dash reads as an absence, which is what it is. */
export function unread(value: string | null | undefined): string {
  return value ? escapeHTML(value) : '<span style="color:#64748b;">—</span>';
}
