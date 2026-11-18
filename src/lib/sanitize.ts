/**
 * Allow-list HTML sanitizer for admin/AI-authored rich text (product
 * descriptions, CMS pages, blog). Keeps only basic formatting tags; strips
 * every attribute except a safe href on <a>. Prevents stored XSS.
 */
const ALLOWED = new Set(["p", "ul", "ol", "li", "strong", "em", "b", "i", "br", "h2", "h3", "h4", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td"]);

export function sanitizeBasicHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z0-9]+)((?:\s[^>]*)?)>/gi, (m, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return "";
      if (m.startsWith("</")) return `</${t}>`;
      if (t === "a") {
        const href = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        const url = (href?.[2] ?? href?.[3] ?? href?.[4] ?? "").trim();
        const safe = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i.test(url) ? url.replace(/"/g, "&quot;") : null;
        return safe ? `<a href="${safe}" rel="noopener nofollow">` : "<a>";
      }
      return `<${t}>`;
    });
}
