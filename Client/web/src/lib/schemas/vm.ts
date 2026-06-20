/**
 * VM schemas — Zod 4 with z.uuid() and z.discriminatedUnion for typed VM states.
 *
 * Extracted from CreateVmForm inline schema and VmDetail/VmsPage usage.
 * discriminatedUnion ensures status-specific fields are type-safe (e.g. running VMs
 * have an ip_address while stopped/destroyed VMs don't).
 */
import { z } from "zod";

// ── Create VM form input ──
export const createVmSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  spec_cpu: z.coerce.number().int().min(1).max(8),
  spec_ram_mb: z.coerce.number().int().min(2048).max(16384),
  spec_disk_gb: z.coerce.number().int().min(10).max(200),
  hypervisor: z.enum(["libvirt", "vbox", "mock"]),
});
export type CreateVmInput = z.input<typeof createVmSchema>;
export type CreateVmOutput = z.output<typeof createVmSchema>;

// ── VM base fields (shared across all statuses) ──
const vmBase = z.object({
  id: z.uuid(),
  name: z.string(),
  hypervisor: z.enum(["libvirt", "vbox", "mock"]),
  spec_cpu: z.number().int().positive(),
  spec_ram_mb: z.number().int().positive(),
  spec_disk_gb: z.number().int().positive(),
  created_at: z.string().datetime(),
});

// ── VM discriminated union by status — each status has its own fields ──
export const vmSchema = z.discriminatedUnion("status", [
  // queued: just entered the queue, no resources yet
  vmBase.extend({
    status: z.literal("queued"),
    queue_position: z.number().int().min(0).optional(),
  }),
  // creating: provisioning in progress
  vmBase.extend({
    status: z.literal("creating"),
  }),
  // running: fully operational
  vmBase.extend({
    status: z.literal("running"),
    ip_address: z.string().optional(),
    ssh_port: z.number().int().positive().optional(),
  }),
  // stopped: paused / shut down
  vmBase.extend({
    status: z.literal("stopped"),
    ip_address: z.string().optional(),
  }),
  // error: something went wrong
  vmBase.extend({
    status: z.literal("error"),
    error_message: z.string().optional(),
  }),
  // destroyed: already deleted (archival)
  vmBase.extend({
    status: z.literal("destroyed"),
    destroyed_at: z.string().datetime().optional(),
  }),
]);

export type VM = z.output<typeof vmSchema>;

// ── VM API response (discriminated by __type) ──
export const vmApiResponseSchema = z.discriminatedUnion("__type", [
  z.object({
    __type: z.literal("ok"),
    data: vmSchema,
  }),
  z.object({
    __type: z.literal("ok"),
    data: z.array(vmSchema),
  }),
  z.object({
    __type: z.literal("error"),
    message: z.string(),
    code: z.string().optional(),
  }),
]);
export type VmApiResponse = z.output<typeof vmApiResponseSchema>;

// ── VM status enum for UI labels ──
export const VM_STATUSES = [
  "queued",
  "creating",
  "running",
  "stopped",
  "error",
  "destroyed",
] as const;
export type VmStatus = (typeof VM_STATUSES)[number];
