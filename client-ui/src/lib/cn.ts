/**
 * Join class names, dropping falsy entries. Keeps conditional classes readable.
 *
 * It joins; it does not resolve conflicts. Two Tailwind utilities for the same
 * property are settled by the order they appear in the generated stylesheet,
 * not by the order they appear here — so passing `px-2` to a component whose
 * base class is `px-2.5` silently does nothing, because Tailwind emits `px-2`
 * first and the later rule wins. Several call sites had made exactly that
 * assumption and none of them were getting what they asked for.
 *
 * So: use `className` to add properties a component does not set — layout,
 * margins, flex behaviour — and change the ones it does set by giving it a
 * prop. A component's own size and colour are its business.
 *
 * If overriding ever becomes common enough that this rule is a burden,
 * `tailwind-merge` resolves conflicts properly and is the point at which a
 * dependency would be worth it. It isn't yet.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
