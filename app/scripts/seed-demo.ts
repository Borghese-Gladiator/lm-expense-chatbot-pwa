/** Fill the database with 2 years of fake transactions. Usage: npm run seed (uses DATABASE_URL or PGLITE_DIR). */
import { loadSettings } from "../src/server/config";
import { openDb } from "../src/server/db";
import { seedDemo } from "../src/server/mock";

const db = await openDb(loadSettings());
console.log(`seeded ${await seedDemo(db)} transactions`);
await db.close();
