import { json } from "@/lib/http";
import { stats } from "@/lib/repo";

export async function GET() {
  return json(await stats());
}
