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
    console.warn("Warning: Failed to load local .env file:", err instanceof Error ? err.message : err);
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const CSV_PATH = path.resolve(process.cwd(), args[0] || "MTC DAILY ATTENDANCE(2YR JULY 2026).csv");
const YEAR_LABEL = args[1] || "2nd Year";
const DRY_RUN = process.argv.includes("--dry-run");

const DATE_HEADER_RE = /^\d{1,2}-[A-Za-z]{3}-\d{2}$/;
const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("ERROR: Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function excelDateLabelToISO(label: string): string {
  const [day, mon, yr] = label.trim().split("-");
  return `20${yr}-${MONTHS[mon]}-${day.padStart(2, "0")}`;
}

interface AttendanceCell {
  date: string;
  status: "present" | "absent";
}

interface StudentRow {
  rollNo: string;
  name: string;
  dept: string;
  cells: AttendanceCell[];
}

function parseCsv(): StudentRow[] {
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/);

  const headerIdx = lines.findIndex((l) => l.split(",")[0]?.trim() === "S.No");
  if (headerIdx === -1) throw new Error("Could not find header row (column 'S.No')");
  const headerFields = lines[headerIdx].split(",");

  const dateCols: number[] = [];
  headerFields.forEach((h, ix) => {
    if (DATE_HEADER_RE.test(h.trim())) dateCols.push(ix);
  });
  if (dateCols.length === 0) throw new Error("No date columns found in header");

  const dateLabels: Record<number, string> = {};
  dateCols.forEach((ix) => {
    dateLabels[ix] = excelDateLabelToISO(headerFields[ix]);
  });
  console.log(`Date columns detected: ${dateCols.map((ix) => headerFields[ix].trim()).join(", ")}`);

  const rows: StudentRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    if (!f[0] || isNaN(Number(f[0]))) continue;
    const name = f[1]?.trim();
    const rollNo = f[2]?.trim();
    const dept = f[4]?.trim();
    if (!name || !rollNo || !dept) continue;

    const cells: AttendanceCell[] = [];
    dateCols.forEach((ix) => {
      const v = (f[ix] || "").trim();
      if (v === "P") cells.push({ date: dateLabels[ix], status: "present" });
      else if (v === "A") cells.push({ date: dateLabels[ix], status: "absent" });
    });
    rows.push({ rollNo, name, dept, cells });
  }
  return rows;
}

async function upsertDepartment(name: string): Promise<string> {
  const { data: existing, error: selErr } = await supabase.from("departments").select("id").eq("name", name).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("departments").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertYear(deptId: string, label: string): Promise<string> {
  const { data: existing, error: selErr } = await supabase.from("years").select("id").eq("dept_id", deptId).eq("label", label).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("years").insert({ dept_id: deptId, label }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertClass(yearId: string, name: string): Promise<string> {
  const { data: existing, error: selErr } = await supabase.from("classes").select("id").eq("year_id", yearId).eq("name", name).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("classes").insert({ year_id: yearId, name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertStudent(classId: string, rollNo: string, name: string): Promise<string> {
  const { data: existing, error: selErr } = await supabase.from("students").select("id").eq("class_id", classId).eq("roll_no", rollNo).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id;
  const { data, error } = await supabase.from("students").insert({ class_id: classId, roll_no: rollNo, name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function main() {
  console.log(`Parsing ${CSV_PATH}...`);
  const rows = parseCsv();

  const byDept = new Map<string, StudentRow[]>();
  for (const r of rows) {
    if (!byDept.has(r.dept)) byDept.set(r.dept, []);
    byDept.get(r.dept)!.push(r);
  }

  const totalPresent = rows.reduce((s, r) => s + r.cells.filter((c) => c.status === "present").length, 0);
  const totalAbsent = rows.reduce((s, r) => s + r.cells.filter((c) => c.status === "absent").length, 0);

  console.log(`Students: ${rows.length}`);
  console.log(`Departments: ${[...byDept.keys()].join(", ")}`);
  for (const [dept, list] of byDept) console.log(`  ${dept}: ${list.length} students`);
  console.log(`Attendance records to write: ${totalPresent + totalAbsent} (present ${totalPresent}, absent ${totalAbsent})`);

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  const classIds = new Map<string, string>();
  const attendanceBatch: { class_id: string; student_id: string; date: string; status: string }[] = [];

  for (const [dept, list] of byDept) {
    const deptId = await upsertDepartment(dept);
    const yearId = await upsertYear(deptId, YEAR_LABEL);
    const classId = await upsertClass(yearId, dept);
    classIds.set(dept, classId);
    console.log(`✓ ${dept} -> class ${classId}`);

    for (const row of list) {
      const studentId = await upsertStudent(classId, row.rollNo, row.name);
      for (const cell of row.cells) {
        attendanceBatch.push({ class_id: classId, student_id: studentId, date: cell.date, status: cell.status });
      }
    }
    console.log(`  ${list.length} students upserted`);
  }

  console.log(`Writing ${attendanceBatch.length} attendance records...`);
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < attendanceBatch.length; i += CHUNK) {
    const chunk = attendanceBatch.slice(i, i + CHUNK);
    const { error } = await supabase.from("attendance").upsert(chunk, { onConflict: "student_id,date" });
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
