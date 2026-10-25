import fs from 'node:fs';
import path from 'node:path';
import type { RunSummary } from '../types';
import { buildReportHtml } from './html';

/** Writes the HTML report (creating the folder) and returns the absolute file path. */
export function writeReport(summary: RunSummary, file: string): string {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buildReportHtml(summary), 'utf8');
  return target;
}
