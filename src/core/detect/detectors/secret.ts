import type { CustomDetector, KeyDetector, Span } from "../../types.ts";
import { generators } from "../../generate/generators.ts";

/**
 * Credential material: passwords, auth headers, cookies, session and CSRF
 * tokens, URL userinfo, private keys. All share `type: 'secret'` — the fake is
 * opaque either way, and one type means one derivation, so the same password
 * seen under two different keys maps to one fake.
 *
 * Header and URL forms need a capture group (the scheme word and the host must
 * survive), which is what `kind: 'custom'` is for: `match` returns the span,
 * not the whole hit.
 */

type Hit = Pick<Span, "start" | "end" | "text">;

// Mirrors the key-context scanner's own guard: a bare literal is not a secret.
const LITERAL = /^(?:null|nil|true|false|undefined|none|\*+|x+|redacted|hidden)$/i;

/** Spans the last capture group, which every pattern here ends on. */
const tail = (input: string, re: RegExp): Hit[] => {
  const out: Hit[] = [];
  for (const m of input.matchAll(re)) {
    const text = m[m.length - 1];
    if (text === undefined || text === "" || LITERAL.test(text)) continue;
    const end = m.index + m[0].length;
    out.push({ start: end - text.length, end, text });
  }
  return out;
};

export const password: KeyDetector = {
  id: "password",
  label: "Password",
  type: "secret",
  kind: "key",
  enabled: true,
  keys: /pass(?:word|phrase|wd)|(?:^|_)pwd(?:$|_)/i,
  generate: generators.secret,
};

export const sessionId: KeyDetector = {
  id: "session-id",
  label: "Session / CSRF token",
  type: "secret",
  kind: "key",
  enabled: true,
  keys: /(?:^|_)(?:session|sess|sid)_?(?:id|key|token)?$|csrf|xsrf/i,
  generate: generators.secret,
};

// `Authorization: Bearer x`, `"authorization": "x"`, `authorization=x`. The
// header name and the scheme word stay; only the credential is replaced.
const AUTH_HEADER =
  /\b(?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:(?:bearer|basic|digest|token|apikey|hmac)\s+)?([^\s"',;}\])]+)/gi;

// A scheme word alone still names a credential. Requiring a digit keeps prose
// ("Basic authentication is required") out.
const BARE_SCHEME = /\b(?:bearer|basic)\s+(?=[^\s"']*\d)([A-Za-z0-9+/=_.~-]{16,})/gi;

export const authHeader: CustomDetector = {
  id: "auth-header",
  label: "Auth credential",
  type: "secret",
  kind: "custom",
  enabled: true,
  match: (input) => [...tail(input, AUTH_HEADER), ...tail(input, BARE_SCHEME)],
  generate: generators.secret,
};

const COOKIE_HEADER = /\b(?:set-)?cookie["']?\s*[:=]\s*["']?([^\r\n"']*)/gi;
const COOKIE_PAIR = /([^=;\s]+)=([^;]*)/g;
// Attributes describe the cookie, they are not its value — scrubbing `Path=/`
// would cost debugging information and hide nothing.
const COOKIE_ATTR =
  /^(?:path|domain|expires|max-age|secure|httponly|samesite|version|comment|priority|partitioned)$/i;

export const cookie: CustomDetector = {
  id: "cookie",
  label: "Cookie value",
  type: "secret",
  kind: "custom",
  enabled: true,
  match: (input) => {
    const out: Hit[] = [];
    for (const header of input.matchAll(COOKIE_HEADER)) {
      const value = header[1];
      if (value === undefined) continue;
      const base = header.index + header[0].length - value.length;
      for (const pair of value.matchAll(COOKIE_PAIR)) {
        const [, name, raw] = pair;
        if (name === undefined || raw === undefined || COOKIE_ATTR.test(name)) continue;
        const text = raw.trimEnd();
        if (text === "" || LITERAL.test(text)) continue;
        const start = base + pair.index + name.length + 1;
        out.push({ start, end: start + text.length, text });
      }
    }
    return out;
  },
  generate: generators.secret,
};

// RFC 3986 userinfo: `scheme://user:pass@host`. Only `user:pass` is spanned, so
// the host stays readable (and stays available to the IP and email detectors).
const URL_USERINFO = /\b[a-z][a-z0-9+.-]*:\/\/([^\s/@:"']*:[^\s/@"']+)(?=@)/gi;

export const urlCredentials: CustomDetector = {
  id: "url-credentials",
  label: "URL credentials",
  type: "secret",
  kind: "custom",
  enabled: true,
  match: (input) => tail(input, URL_USERINFO),
  generate: generators.secret,
};

// One span per base64 body line: the BEGIN/END markers survive, so the reader
// still sees a key was there, and no generator has to emit a newline.
const PEM = /(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)([\s\S]*?)(?=-----END|$)/g;
const PEM_BODY = /[A-Za-z0-9+/=]{16,}/g;

export const privateKey: CustomDetector = {
  id: "private-key",
  label: "Private key",
  type: "secret",
  kind: "custom",
  enabled: true,
  match: (input) => {
    const out: Hit[] = [];
    for (const block of input.matchAll(PEM)) {
      const body = block[2];
      if (body === undefined) continue;
      const base = block.index + (block[1]?.length ?? 0);
      for (const line of body.matchAll(PEM_BODY)) {
        out.push({
          start: base + line.index,
          end: base + line.index + line[0].length,
          text: line[0],
        });
      }
    }
    return out;
  },
  generate: generators.secret,
};
