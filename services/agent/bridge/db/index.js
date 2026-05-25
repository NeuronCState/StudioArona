/**
 * PostgreSQL connection pool for agent bridge handlers.
 *
 * Uses pg (node-postgres). Pool config from env vars.
 * All queries should pass ctx.userId for tenant isolation.
 */

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || "127.0.0.1",
  port: parseInt(process.env.PG_PORT || "5432", 10),
  database: process.env.PG_DATABASE || "javis",
  user: process.env.PG_USER || "javis",
  password: process.env.PG_PASSWORD || "javis",
  max: parseInt(process.env.PG_POOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Get a client from the pool. Use for transactions.
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Execute a single query with parameterized values.
 * ALWAYS use parameterized queries ($1, $2...) — never string interpolation.
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.warn(`[db] slow query (${duration}ms): ${text.slice(0, 120)}`);
  }
  return result;
}

/**
 * Build a tenant-scoped WHERE clause.
 * @param {string} userId - current user UUID
 * @param {string} alias - table alias or column prefix (default: "")
 * @returns {{ clause: string, params: string[] }}
 */
export function tenantScope(userId, alias = "") {
  const col = alias ? `${alias}.user_id` : "user_id";
  return {
    clause: `${col} = $1`,
    params: [userId],
  };
}

/**
 * Ensure ctx.userId is present, throw if not.
 */
export function requireUserId(ctx) {
  const userId = ctx?.userId || ctx?.user_id;
  if (!userId) {
    const err = new Error("NO_USER_CONTEXT: ctx.userId is required");
    err.statusCode = 403;
    throw err;
  }
  return userId;
}

export default pool;
