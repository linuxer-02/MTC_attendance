import Papa from "papaparse";

export type AttendanceStatus = "present" | "absent" | "holiday" | "unmarked";

export interface StudentRow {
  id: string;
  roll_no: string;
  name: string;
}

export interface DayInfo {
  date: string; // YYYY-MM-DD
  dayNum: number;
  label: string;
  isSunday: boolean;
  isHoliday: boolean;
  holidayReason?: string;
}

export interface ExportMatrixParams {
  className: string;
  deptName: string;
  yearLabel: string;
  monthLabel: string;
  students: StudentRow[];
  days: DayInfo[];
  attendanceMap: Map<string, AttendanceStatus>; // `${student_id}|${date}` => status
}

/**
 * Sanitizes text values to prevent CSV / Formula Injection attacks in Microsoft Excel.
 * Prepends a single quote if string starts with formula command characters (=, +, -, @, \t, \r).
 */
export function sanitizeCSVCell(val: string | number): string | number {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return val;
}

export function generateExcelCSV({
  className,
  deptName,
  yearLabel,
  monthLabel,
  students,
  days,
  attendanceMap,
}: ExportMatrixParams): string {
  const rows: (string | number)[][] = [];

  // Header metadata rows
  rows.push(["Smart Attend Hub — Attendance Register"]);
  rows.push([
    "Department:",
    sanitizeCSVCell(deptName),
    "Year:",
    sanitizeCSVCell(yearLabel),
    "Class:",
    sanitizeCSVCell(className),
  ]);
  rows.push(["Period / Month:", sanitizeCSVCell(monthLabel)]);
  rows.push([]);

  // Table Headers: Roll No, Name, Day 1..N, Total Present, Total Absent, Working Days, Attendance %
  const headerRow = [
    "Roll No",
    "Student Name",
    ...days.map((d) => `Day ${d.dayNum} (${d.label})`),
    "Total Present",
    "Total Absent",
    "Working Days",
    "Attendance %",
  ];
  rows.push(headerRow);

  // Student Data Rows
  students.forEach((student) => {
    let presentCount = 0;
    let absentCount = 0;
    let workingDaysCount = 0;

    const dayCells = days.map((d) => {
      if (d.isSunday) return "SUN";
      if (d.isHoliday) return "HOLIDAY";
      workingDaysCount++;
      const status = attendanceMap.get(`${student.id}|${d.date}`);
      if (status === "present") {
        presentCount++;
        return "P";
      } else if (status === "absent") {
        absentCount++;
        return "A";
      }
      return "-";
    });

    const pct = workingDaysCount > 0 ? Math.round((presentCount / workingDaysCount) * 100) + "%" : "0%";

    rows.push([
      sanitizeCSVCell(student.roll_no),
      sanitizeCSVCell(student.name),
      ...dayCells,
      presentCount,
      absentCount,
      workingDaysCount,
      pct,
    ]);
  });

  // Summary Row at bottom
  const summaryPresent = days.map((d) => {
    if (d.isSunday) return "SUN";
    if (d.isHoliday) return "HOLIDAY";
    let p = 0;
    students.forEach((s) => {
      if (attendanceMap.get(`${s.id}|${d.date}`) === "present") p++;
    });
    return p;
  });

  rows.push([]);
  rows.push(["TOTAL PRESENT", "", ...summaryPresent, "", "", "", ""]);

  // Unparse using PapaParse
  const csvContent = Papa.unparse(rows);
  // Prepend UTF-8 BOM for Microsoft Excel compatibility
  return "\uFEFF" + csvContent;
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseImportedCSV(
  file: File,
  onComplete: (parsedData: { rollNo: string; dayNum: number; status: "P" | "A" }[]) => void,
  onError: (errMessage: string) => void
) {
  Papa.parse(file, {
    skipEmptyLines: true,
    complete: (results) => {
      try {
        const data = results.data as string[][];
        // Find header row (starts with Roll No)
        const headerIndex = data.findIndex(
          (row) => row[0]?.toString().trim().toLowerCase() === "roll no"
        );
        if (headerIndex === -1) {
          onError("Invalid CSV format. Header row starting with 'Roll No' was not found.");
          return;
        }

        const headers = data[headerIndex];
        const dayCols: { colIndex: number; dayNum: number }[] = [];
        headers.forEach((h, i) => {
          const match = h.match(/Day\s+(\d+)/i);
          if (match) {
            dayCols.push({ colIndex: i, dayNum: parseInt(match[1], 10) });
          }
        });

        const updates: { rollNo: string; dayNum: number; status: "P" | "A" }[] = [];
        for (let i = headerIndex + 1; i < data.length; i++) {
          const row = data[i];
          const rollNo = row[0]?.toString().trim();
          if (!rollNo || rollNo.toLowerCase().startsWith("total")) continue;

          dayCols.forEach(({ colIndex, dayNum }) => {
            const val = row[colIndex]?.toString().trim().toUpperCase();
            if (val === "P" || val === "PRESENT") {
              updates.push({ rollNo, dayNum, status: "P" });
            } else if (val === "A" || val === "ABSENT") {
              updates.push({ rollNo, dayNum, status: "A" });
            }
          });
        }
        onComplete(updates);
      } catch (err: any) {
        onError("Failed to parse CSV file: " + err.message);
      }
    },
    error: (error) => onError(error.message),
  });
}
