import { classLabel, type ClassWithContext } from "@/features/shared/roles";
import { cn } from "@/lib/utils";

type Props = {
  classes: ClassWithContext[] | undefined;
  value: string | null | undefined;
  onChange: (classId: string) => void;
  /** Adds a leading blank option — for screens where "no class" is valid. */
  placeholder?: string;
  className?: string;
};

/**
 * The Dept · Year · Class picker shared by Home, Mark, Analytics, Register,
 * Report, Holiday and the Admin students tab.
 */
export function ClassSelect({ classes, value, onChange, placeholder, className }: Props) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={cn("rounded-xl border bg-card px-3 py-2.5 text-sm shadow-sm", className)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {classes?.map((c) => (
        <option key={c.id} value={c.id}>
          {classLabel(c)}
        </option>
      ))}
    </select>
  );
}
