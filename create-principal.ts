/// <reference types="node" />
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env manually
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
const email = process.env.PRINCIPAL_EMAIL;
const password = process.env.PRINCIPAL_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !email || !password) {
  console.error("ERROR: Missing required environment variables.");
  console.error("Set all of the following before running this script:");
  console.error("  SUPABASE_URL (or VITE_SUPABASE_URL)");
  console.error("  SUPABASE_SERVICE_KEY");
  console.error("  PRINCIPAL_EMAIL");
  console.error("  PRINCIPAL_PASSWORD");
  console.error("Example: PRINCIPAL_EMAIL=you@college.edu PRINCIPAL_PASSWORD=... npx tsx create-principal.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  try {
    console.log("Creating principal user...");

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
      email,
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
    console.log(`Principal can now login with the credentials you provided (${email}).`);
  } catch (error) {
    console.error("Fatal error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
