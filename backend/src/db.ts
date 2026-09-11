import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL não configurada');
}

if (!authToken && !url.startsWith('file:')) {
  throw new Error('TURSO_AUTH_TOKEN não configurado');
}

const adapter = new PrismaLibSQL({
  url,
  authToken,
});

export const prisma = new PrismaClient({ adapter });
