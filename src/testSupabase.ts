import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_ANON_KEY as string;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("Supabase URL:", supabaseUrl);
  console.log("Connecting...");

  // Ek simple query jo Supabase se poochti hai "kaunse tables hain"
  const { data, error } = await supabase
    .from("nonexistent_table_test")
    .select("*")
    .limit(1);

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      console.log("✅ CONNECTION SUCCESSFUL! Supabase se connect ho gaya hai.");
      console.log("(Ye error normal hai — humne jaan-bujh kar ek fake table poochi thi, bas connection test karne ke liye)");
    } else {
      console.log("❌ Connection mein dikkat hai:", error.message);
    }
  } else {
    console.log("✅ CONNECTION SUCCESSFUL!", data);
  }
}

testConnection();