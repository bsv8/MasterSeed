import { ERROR_CODES, MasterSeedError } from "./errors.js";

export const DIGEST_SIZE = 32;
const HEX_LENGTH = DIGEST_SIZE * 2;

/** Immutable fixed-size SHA-256 digest. */
export class Digest {
  private readonly value: Uint8Array;

  private constructor(value: Uint8Array) {
    this.value = value.slice();
  }

  static fromBytes(value: Uint8Array): Digest {
    if (value.byteLength !== DIGEST_SIZE) {
      throw new MasterSeedError(ERROR_CODES.INVALID_HASH_ENCODING, `digest must contain exactly ${DIGEST_SIZE} bytes`);
    }
    return new Digest(value);
  }

  static fromHex(value: string): Digest {
    if (value.length !== HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(value)) {
      throw new MasterSeedError(ERROR_CODES.INVALID_HASH_ENCODING, "digest hex must contain exactly 64 hexadecimal characters");
    }
    const bytes = new Uint8Array(DIGEST_SIZE);
    for (let i = 0; i < DIGEST_SIZE; i += 1) {
      bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return new Digest(bytes);
  }

  toBytes(): Uint8Array {
    return this.value.slice();
  }

  toHex(): string {
    let result = "";
    for (const byte of this.value) result += byte.toString(16).padStart(2, "0");
    return result;
  }

  toString(): string {
    return this.toHex();
  }

  equals(other: Digest): boolean {
    let difference = 0;
    for (let i = 0; i < DIGEST_SIZE; i += 1) difference |= this.value[i]! ^ other.value[i]!;
    return difference === 0;
  }
}

