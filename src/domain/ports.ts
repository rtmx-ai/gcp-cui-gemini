/**
 * Port interfaces (hexagonal architecture).
 * Domain defines these; infrastructure implements them.
 */

import type { ProjectConfig, ResourceOutput, HealthCheck } from "./types.js";
import type { ProtocolEvent } from "./events.js";

/** Emits protocol events to the transport (stdout in production). */
export interface EventEmitter {
  emit(event: ProtocolEvent): void;
}

/** Provisions and manages cloud infrastructure. */
export interface IaCEngine {
  preview(config: ProjectConfig): Promise<void>;
  up(config: ProjectConfig): Promise<ResourceOutput>;
  destroy(config: ProjectConfig): Promise<void>;
}

/** Checks boundary health using actual provisioned resource names. */
export interface HealthChecker {
  checkAll(config: ProjectConfig, outputs?: ResourceOutput): Promise<HealthCheck[]>;
}
