/** "https://site.bg///" -> "https://site.bg" */
export const trimSlash = (u: string): string => u.replace(/\/+$/, '');

/** The value when it is a web address or a path on this site (never javascript: and the like), else ''. */
export const safeLink = (u: string | undefined | null): string => (u && /^(https?:\/\/|\/)/i.test(u) ? u : '');
