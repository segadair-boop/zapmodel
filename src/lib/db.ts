import { supabase } from "@/integrations/supabase/client";

// Cliente do Lovable Cloud usado pelos módulos de CRUD.
// Tipagem relaxada porque as tabelas legadas usam nomes CamelCase do Prisma.
export const db = supabase as any;

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function friendlyDbError(error: any): string {
  const raw = String(error?.message || error?.details || error || "");
  const code = String(error?.code || "");
  const text = raw.toLowerCase();
  if (code === "42501" || text.includes("row-level security") || text.includes("permission denied") || text.includes("permissão insuficiente")) {
    return "Você não tem permissão para realizar esta ação.";
  }
  if (code === "23505" || text.includes("duplicate key") || text.includes("unique constraint")) {
    return "Já existe um registro com estes dados.";
  }
  if (code === "23503" || text.includes("foreign key")) {
    return "Este registro está sendo usado por outra funcionalidade e não pode ser excluído.";
  }
  if (text.includes("failed to fetch") || text.includes("network") || text.includes("fetch")) {
    return "Não foi possível comunicar com o banco de dados.";
  }
  if (text.includes("jwt") || text.includes("not authenticated") || text.includes("não autenticado")) {
    return "Sua sessão expirou. Entre novamente no sistema.";
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

export function fail(error: any): never {
  console.error("[db] operação rejeitada", error);
  throw new Error(friendlyDbError(error));
}

export async function selectAll(
  table: string,
  select = "*",
  orderBy: string | null = "createdAt",
  ascending = false,
): Promise<any[]> {
  let q = db.from(table).select(select);
  if (orderBy) q = q.order(orderBy, { ascending });
  const { data, error } = await q;
  if (error) fail(error);
  return data || [];
}

export async function countRows(table: string, filters: Record<string, any> = {}): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) fail(error);
  return count || 0;
}

export async function insertRow(table: string, values: Record<string, any>): Promise<any> {
  const { data, error } = await db.from(table).insert({ id: newId(), ...values }).select().single();
  if (error) fail(error);
  return data;
}

export async function updateRow(table: string, id: string, values: Record<string, any>): Promise<any> {
  const { data, error } = await db
    .from(table)
    .update({ ...values, updatedAt: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) fail(error);
  return data;
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) fail(error);
}
