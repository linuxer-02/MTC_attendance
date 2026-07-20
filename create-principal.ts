/// <reference types="node" />
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://yazlbclgbbjgqtxedktj.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("ERROR: SUPABASE_SERVICE_KEY environment variable is required!");
  console.error("Set it with: export SUPABASE_SERVICE_KEY='your-service-role-key'");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  try {
    console.log("Creating principal user...");
    const email = "principal@mtcchennai.com";
    const password = "Principal@SmartAttend2026!";

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      // If user exists, fetch them instead
      if (authError.message.includes("already exists")) {
        console.log("User already exists, fetching user ID...");
        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const user = users?.users.find((u) => u.email === email);
        if (!user) throw new Error("User not found");
        console.log("Found existing user. User ID:", user.id);
        await assignRole(user.id);
      } else {
        throw authError;
      }
      return;
    }

    console.log("✓ Principal account created. User ID:", authData.user?.id);
    await assignRole(authData.user?.id);
  } catch (error) {
    console.error("ERROR:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function assignRole(userId: string | undefined) {
  if (!userId) {
    console.error("ERROR: No user ID provided");
    return;
  }

  try {
    console.log("Setting up profile...");
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      full_name: "Principal",
      email: "principal@mtcchennai.com",
    });

    if (profileError) {
      console.warn("Warning: Could not create profile:", profileError.message);
    }

    console.log("Assigning principal role...");
    const { data, error } = await supabase
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "principal",
      })
      .select();

    if (error) {
      console.error("Error assigning role:", error.message);
      console.log("\n❌ Setup incomplete. Run this SQL in Supabase dashboard:");
      console.log(`INSERT INTO user_roles (user_id, role) VALUES ('${userId}', 'principal');`);
      throw error;
    }

    console.log("✓ Role assigned successfully!");
    console.log("\n✅ SETUP COMPLETE!");
    console.log("Principal can now login with:");
    console.log("  Email: principal@mtcchennai.com");
    console.log("  Password: Principal@SmartAttend2026!");
  } catch (error) {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
