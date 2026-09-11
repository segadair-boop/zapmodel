import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) throw new Error('TURSO_DATABASE_URL não configurada');
if (!authToken && !url.startsWith('file:')) throw new Error('TURSO_AUTH_TOKEN não configurado');

const sqlPath = path.resolve('prisma/turso-init.sql');
const sql = await fs.readFile(sqlPath, 'utf8');
const statements = sql
  .split(/;\s*(?:\r?\n|$)/g)
  .map(statement => statement.trim())
  .filter(Boolean);

const client = createClient({ url, authToken });
for (const statement of statements) {
  await client.execute(statement);
}
client.close();
console.log(`Schema Turso inicializado (${statements.length} comandos).`);
