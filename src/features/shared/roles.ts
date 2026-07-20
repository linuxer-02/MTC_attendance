import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MyRole = {
  id: string;
  user_id: string;
  role: "principal" | "hod" | "incharge";
  dept_id: string | null;
  class_id: string | null;
};

export type ClassWithContext = {
  id: string;
  name: string;
  year_id: string;
  year_label: string;
  dept_id: string;
  dept_name: string;
};

export function useMyRoles() {
  return useQuery({
    queryKey: ["my-roles"],
    queryFn: async (): Promise<MyRole[]> => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return (data ?? []) as MyRole[];
    },
  });
}

export function useMyAccessibleClasses() {
  const { data: roles } = useMyRoles();
  return useQuery({
    enabled: !!roles,
    queryKey: ["my-classes", roles?.length ?? 0],
    queryFn: async (): Promise<ClassWithContext[]> => {
      const isPrincipal = roles!.some((r) => r.role === "principal");
      const hodDepts = roles!.filter((r) => r.role === "hod" && r.dept_id).map((r) => r.dept_id!);
      const inchargeClasses = roles!
        .filter((r) => r.role === "incharge" && r.class_id)
        .map((r) => r.class_id!);

      const classIds = new Set<string>();
      let allowAll = false;

      if (isPrincipal) {
        allowAll = true;
      } else {
        if (hodDepts.length > 0) {
          const { data: yrs } = await supabase.from("years").select("id").in("dept_id", hodDepts);
          const yrIds = (yrs ?? []).map((y) => y.id);
          if (yrIds.length > 0) {
            const { data: cls } = await supabase.from("classes").select("id").in("year_id", yrIds);
            (cls ?? []).forEach((c) => classIds.add(c.id));
          }
        }
        inchargeClasses.forEach((c) => classIds.add(c));
      }

      let query = supabase
        .from("classes")
        .select("id, name, year_id, years(id, label, dept_id, departments(id, name))")
        .order("name");

      if (!allowAll) {
        const ids = Array.from(classIds);
        if (ids.length === 0) return [];
        query = query.in("id", ids);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        year_id: r.year_id,
        year_label: r.years?.label ?? "",
        dept_id: r.years?.dept_id ?? "",
        dept_name: r.years?.departments?.name ?? "",
      }));
    },
  });
}
