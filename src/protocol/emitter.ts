/**
 * JSON-line event emitter conforming to aegis-infra/v1.
 * Implements the EventEmitter port for stdout transport.
 */

import type { EventEmitter } from "../domain/ports.js";
import type { ProtocolEvent } from "../domain/events.js";

/** Emits protocol events as newline-delimited JSON to a writable stream. */
export class StdoutEmitter implements EventEmitter {
  private readonly stream: NodeJS.WritableStream;

  constructor(stream: NodeJS.WritableStream = process.stdout) {
    this.stream = stream;
  }

  emit(event: ProtocolEvent): void {
    this.stream.write(JSON.stringify(event) + "\n");
  }
}
