import { readFileSync } from 'node:fs';

/** Parse `KEY=value` lines: blank lines and `#` comments ignored, optional `export `, optional quotes. */
export function parseDotEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.replace(/^export\s+/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(["'])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, ''); // trailing comment on unquoted values
    out[m[1]] = value;
  }
  return out;
}

/**
 * Load a .env file into process.env if it exists. Variables already set in the real environment win,
 * so the same code works with a file (Toolforge `~/www/js/.env`, local dev) or with injected variables.
 */
export function loadDotEnv(path, env = process.env) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return false; // no file: fine
  }
  for (const [key, value] of Object.entries(parseDotEnv(text))) if (env[key] === undefined) env[key] = value;
  return true;
}
