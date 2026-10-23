interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Minimal robots.txt parser (User-agent groups, Allow/Disallow, `*` and `$`
 * wildcards, longest-match wins, Allow wins ties). Returns a function that says
 * whether a path (including the query string) may be fetched.
 */
export function parseRobots(text: string, userAgent: string): (pathWithQuery: string) => boolean {
  const ua = userAgent.toLowerCase();
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if ((field === 'allow' || field === 'disallow') && current && value) {
        current.rules.push({ allow: field === 'allow', pattern: value });
      } // an empty Disallow means "allow everything", i.e. no rule
    }
  }

  // The most specific matching user-agent group wins; "*" is the fallback.
  let best: Group | null = null;
  let bestLen = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent === '*') {
        if (bestLen < 0) {
          best = group;
          bestLen = 0;
        }
      } else if (agent && ua.includes(agent) && agent.length > bestLen) {
        best = group;
        bestLen = agent.length;
      }
    }
  }

  const compiled = (best?.rules ?? []).map((r) => ({ ...r, re: patternToRegex(r.pattern) }));

  return (path: string) => {
    let match: Rule | null = null;
    for (const rule of compiled) {
      if (!rule.re.test(path)) continue;
      if (
        !match ||
        rule.pattern.length > match.pattern.length ||
        (rule.pattern.length === match.pattern.length && rule.allow)
      ) {
        match = rule;
      }
    }
    return match ? match.allow : true;
  };
}
