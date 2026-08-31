/// <reference types="node" />
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index > 0) {
          const key = trimmed.slice(0, index).trim();
          let value = trimmed.slice(index + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (err) {
    console.warn(
      "Warning: Failed to load local .env file:",
      err instanceof Error ? err.message : err,
    );
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const CSV_PATH = path.resolve(
  process.cwd(),
  args[0] || "MTC_Staff_Attendance_2026-27_2(Attendance Register).csv",
);
// The register is a fixed grid of consecutive daily columns starting on this
// date (per the sheet's own instructions: "already set up for the full
// year"), so dates are derived positionally rather than parsed from the
// "01-Jul" style header labels, which carry no year and would be ambiguous
// across the Dec->Jan and Jun->Jul wraps.
const START_DATE = args[1] || "2026-07-01";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const STATUS_MAP: Record<string, string> = {
  P: "present",
  A: "absent",
  OD: "on_duty",
  ML: "medical_leave",
  CL: "casual_leave",
  HL: "half_day_leave",
  LA: "late_arrival",
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface StaffCell {
  date: string;
  status: string;
}

interface StaffRow {
  name: string;
  designation: string | null;
  department: string | null;
  cells: StaffCell[];
}

function parseCsv(): StaffRow[] {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);

  const headerIdx = lines.findIndex((l) => l.split(",")[0]?.trim() === "S.No");
  if (headerIdx === -1) throw new Error("Could not find header row (column 'S.No')");
  const headerFields = lines[headerIdx].split(",");
  const numDateCols = headerFields.length - 4;
  if (numDateCols <= 0) throw new Error("No date columns found in header");
  console.log(`Date columns detected: ${numDateCols} (starting ${START_DATE})`);

  const unknownCodes = new Set<string>();
  const rows: StaffRow[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const f = lines[i].split(",");
    if (!f[0] || isNaN(Number(f[0]))) continue;
    const name = f[1]?.trim();
    if (!name) continue;
    const designation = f[2]?.trim() || null;
    const department = f[3]?.trim() || null;

    const cells: StaffCell[] = [];
    for (let col = 4; col < 4 + numDateCols; col++) {
      const raw = (f[col] || "").trim().toUpperCase();
      if (!raw) continue;
      const status = STATUS_MAP[raw];
      if (!status) {
        unknownCodes.add(raw);
        continue;
      }
      cells.push({ date: addDaysISO(START_DATE, col - 4), status });
    }
    rows.push({ name, designation, department, cells });
  }
  if (unknownCodes.size > 0) {
    console.warn(`Warning: ignored unrecognized status codes: ${[...unknownCodes].join(", ")}`);
  }
  return rows;
}

async function upsertStaffMember(row: StaffRow): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from("staff_members")
    .select("id")
    .eq("name", row.name)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) {
    const { error } = await supabase
      .from("staff_members")
      .update({ designation: row.designation, department: row.department })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await supabase
    .from("staff_members")
    .insert({ name: row.name, designation: row.designation, department: row.department })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function main() {
  console.log(`Parsing ${CSV_PATH}...`);
  const rows = parseCsv();

  const statusCounts: Record<string, number> = {};
  let totalCells = 0;
  rows.forEach((r) =>
    r.cells.forEach((c) => {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
      totalCells++;
    }),
  );

  console.log(`Staff: ${rows.length}`);
  console.log(
    `Attendance records to write: ${totalCells} (${Object.entries(statusCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")})`,
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  const attendanceBatch: { staff_id: string; date: string; status: string }[] = [];
  for (const row of rows) {
    const staffId = await upsertStaffMember(row);
    console.log(`✓ ${row.name} -> ${staffId}`);
    for (const cell of row.cells) {
      attendanceBatch.push({ staff_id: staffId, date: cell.date, status: cell.status });
    }
  }

  console.log(`Writing ${attendanceBatch.length} attendance records...`);
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < attendanceBatch.length; i += CHUNK) {
    const chunk = attendanceBatch.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("staff_attendance")
      .upsert(chunk, { onConflict: "staff_id,date" });
    if (error) throw error;
    written += chunk.length;
    console.log(`  ${written}/${attendanceBatch.length}`);
  }

  console.log("\n✅ Import complete.");
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
