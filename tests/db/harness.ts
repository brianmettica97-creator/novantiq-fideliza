// Entorno de pruebas de base de datos: PostgreSQL real (PGlite/WASM) con las
// migraciones de producción y una réplica del esquema auth de Supabase.
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

export type Db = PGlite;

export async function createDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(__dirname, 'supabase-shim.sql'), 'utf8'));
  // Storage es exclusivo de Supabase: se omite aquí.
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql') && !f.includes('storage')).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migración ${f} falló: ${(e as Error).message}`);
    }
  }
  return db;
}

let counter = 0;
export async function createUser(db: Db, opts: { email?: string; name?: string; confirmed?: boolean } = {}): Promise<string> {
  counter += 1;
  const email = opts.email ?? `user${counter}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id`,
    [email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify({ full_name: opts.name ?? `Usuario ${counter}` })],
  );
  return r.rows[0].id;
}

/** Ejecuta fn como un usuario autenticado (o anon si userId es null), con RLS activo. */
export async function as<T>(db: Db, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ]);
    return fn(tx);
  });
}

/** Llama a una función RPC con argumentos nombrados, igual que PostgREST. */
export async function rpc<T = any>(db: Db, userId: string | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const names = Object.keys(args);
  const params = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
  return as(db, userId, async (tx) => {
    const r = await tx.query<{ r: T }>(`select public.${fn}(${params}) as r`, names.map((n) => args[n] as any));
    return r.rows[0]?.r as T;
  });
}

/** Igual que rpc pero devuelve el error (código) en lugar de lanzarlo. */
export async function rpcError(db: Db, userId: string | null, fn: string, args: Record<string, unknown> = {}): Promise<string> {
  try {
    await rpc(db, userId, fn, args);
  } catch (e) {
    return (e as Error).message;
  }
  return 'NO_ERROR';
}

export async function sqlAs<T = any>(db: Db, userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(db, userId, async (tx) => (await tx.query<T>(sql, params as any[])).rows);
}

export async function sqlErrorAs(db: Db, userId: string | null, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await sqlAs(db, userId, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  return 'NO_ERROR';
}

export const key = () => `k_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/** Crea un comercio completo con un programa de sellos publicado. */
export async function setupMerchant(db: Db, name = 'Café Central', opts: { stamps?: number; daily?: number } = {}) {
  const owner = await createUser(db, { name: `Titular ${name}` });
  const merchantId = await rpc<string>(db, owner, 'create_merchant', { p_name: name, p_category: 'cafeteria' });
  const [branch] = await sqlAs<{ id: string }>(db, owner, `select id from public.branches where merchant_id = $1`, [merchantId]);
  const [program] = await sqlAs<{ id: string; join_code: string }>(
    db, owner,
    `insert into public.programs (merchant_id, type, name, stamps_required, max_units_per_tx, daily_limit_per_card)
     values ($1, 'stamps', 'Café Frecuente', $2, least(3, $2), $3) returning id, join_code`,
    [merchantId, opts.stamps ?? 8, opts.daily ?? 5],
  );
  const [reward] = await sqlAs<{ id: string }>(
    db, owner,
    `insert into public.rewards (merchant_id, program_id, name, cost) values ($1, $2, 'Café gratis', $3) returning id`,
    [merchantId, program.id, opts.stamps ?? 8],
  );
  await rpc(db, owner, 'set_program_status', { p_program: program.id, p_status: 'active' });
  return { owner, merchantId, branchId: branch.id, programId: program.id, joinCode: program.join_code, rewardId: reward.id };
}

export async function addMember(db: Db, ownerId: string, merchantId: string, role: 'admin' | 'manager' | 'staff', opts: { allBranches?: boolean; branchIds?: string[] } = {}) {
  const email = `${role}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const userId = await createUser(db, { email, name: `Persona ${role}` });
  const inv = await rpc<{ token: string }>(db, ownerId, 'invite_member', {
    p_merchant: merchantId, p_email: email, p_role: role, p_full_name: '',
    p_all_branches: opts.allBranches ?? true, p_branch_ids: opts.branchIds ?? [],
  });
  await rpc(db, userId, 'accept_invitation', { p_token: inv.token });
  return userId;
}

export async function joinAsCustomer(db: Db, joinCode: string, name = 'Cliente') {
  const customer = await createUser(db, { name });
  const res = await rpc<{ ok: boolean; card_id: string }>(db, customer, 'join_program', { p_join_code: joinCode });
  if (!res.ok) throw new Error(`join falló: ${JSON.stringify(res)}`);
  const [card] = await sqlAs<{ code: string; public_token: string }>(db, customer, `select code, public_token from public.cards where id = $1`, [res.card_id]);
  const [secret] = await sqlAs<{ secret: string }>(db, customer, `select secret from public.card_secrets where card_id = $1`, [res.card_id]);
  return { customer, cardId: res.card_id, code: card.code, token: card.public_token, secret: secret.secret };
}
