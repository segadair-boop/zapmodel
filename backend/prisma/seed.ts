import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/db.js';

const SYSTEM_OWNER_EMAIL = 'seg.adair@gmail.com';

async function main() {
  const email = SYSTEM_OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD || 'CHANGE_ME_NOW';
  const passwordHash = await bcrypt.hash(password, 12);
  let company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) company = await prisma.company.create({ data: { name: 'ZapModel' } });

  await prisma.user.upsert({
    where: { email },
    update: { name: process.env.OWNER_NAME || 'Adair', passwordHash, role: UserRole.OWNER, active: true, companyId: company.id },
    create: { email, name: process.env.OWNER_NAME || 'Adair', passwordHash, role: UserRole.OWNER, active: true, companyId: company.id }
  });

  // Garante que o proprietário principal nunca perca o perfil OWNER.
  await prisma.user.updateMany({ where: { email: SYSTEM_OWNER_EMAIL }, data: { role: UserRole.OWNER, active: true } });

  for (const queue of [{ name: 'Comercial', color: '#22c55e' }, { name: 'Suporte', color: '#3b82f6' }, { name: 'Financeiro', color: '#f59e0b' }]) {
    await prisma.queue.upsert({ where: { companyId_name: { companyId: company.id, name: queue.name } }, update: {}, create: { ...queue, companyId: company.id } });
  }
  console.log(`Seed Turso concluído. Proprietário: ${email}`);
}

main().finally(() => prisma.$disconnect());
