import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/db.js';

async function main() {
  const email = (process.env.OWNER_EMAIL || 'admin@example.com').toLowerCase();
  const password = process.env.OWNER_PASSWORD || 'CHANGE_ME_NOW';
  const passwordHash = await bcrypt.hash(password, 12);
  let company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) company = await prisma.company.create({ data: { name: 'ZapModel' } });
  await prisma.user.upsert({
    where: { email },
    update: { name: process.env.OWNER_NAME || 'Administrador', passwordHash, role: UserRole.OWNER, active: true, companyId: company.id },
    create: { email, name: process.env.OWNER_NAME || 'Administrador', passwordHash, role: UserRole.OWNER, active: true, companyId: company.id }
  });
  for (const queue of [{ name: 'Comercial', color: '#22c55e' }, { name: 'Suporte', color: '#3b82f6' }, { name: 'Financeiro', color: '#f59e0b' }]) {
    await prisma.queue.upsert({ where: { companyId_name: { companyId: company.id, name: queue.name } }, update: {}, create: { ...queue, companyId: company.id } });
  }
  console.log(`Seed Turso concluído. Administrador: ${email}`);
}

main().finally(() => prisma.$disconnect());
