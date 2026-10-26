// Build-time validation of non-secret vars in wrangler.toml.
// wrangler.toml [vars] is deployed to production as-is, so it is the source of truth to check.
// Only top-level [vars] is validated ([env.<name>.vars] is not used in this project).
import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import {
  D1_SIZE_REPORT_FREQUENCIES,
  parseD1SizeReportFrequency,
} from '../src/worker/lib/d1SizeReport.ts';

function validateVars(vars: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (parseD1SizeReportFrequency(vars.D1_SIZE_REPORT_FREQUENCY) === null) {
    errors.push(
      `D1_SIZE_REPORT_FREQUENCY must be one of ${D1_SIZE_REPORT_FREQUENCIES.map((f) => `"${f}"`).join(', ')} (exact match), got ${JSON.stringify(vars.D1_SIZE_REPORT_FREQUENCY)}`,
    );
  }
  return errors;
}

const config = parse(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'));
const vars =
  typeof config.vars === 'object' && config.vars !== null
    ? Object.fromEntries(Object.entries(config.vars))
    : {};
const errors = validateVars(vars);

if (errors.length > 0) {
  console.error('wrangler.toml [vars] validation failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
