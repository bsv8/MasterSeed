// Small incremental SHA-256 implementation for the runtime-neutral core. It
// keeps only the current compression block and hash state in memory.
const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const UINT64_MASK = (1n << 64n) - 1n;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function u32(value: number): number {
  return value >>> 0;
}

export class Sha256 {
  private readonly state: Uint32Array;
  private readonly buffer: Uint8Array;
  private buffered = 0;
  private length = 0n;

  constructor(state?: ArrayLike<number>, buffer?: ArrayLike<number>, buffered = 0, length = 0n) {
    this.state = new Uint32Array(state ?? INITIAL_STATE);
    this.buffer = buffer === undefined ? new Uint8Array(64) : new Uint8Array(buffer);
    this.buffered = buffered;
    this.length = length;
  }

  update(value: Uint8Array): this {
    this.length = (this.length + BigInt(value.byteLength)) & UINT64_MASK;
    let offset = 0;
    while (offset < value.byteLength) {
      const take = Math.min(64 - this.buffered, value.byteLength - offset);
      this.buffer.set(value.subarray(offset, offset + take), this.buffered);
      this.buffered += take;
      offset += take;
      if (this.buffered === 64) {
        this.compress(this.buffer, 0);
        this.buffered = 0;
      }
    }
    return this;
  }

  digest(): Uint8Array {
    const copy = new Sha256(this.state, this.buffer, this.buffered, this.length);
    const bitLength = (this.length * 8n) & UINT64_MASK;
    const paddingLength = copy.buffered < 56 ? 56 - copy.buffered : 120 - copy.buffered;
    const padding = new Uint8Array(paddingLength + 8);
    padding[0] = 0x80;
    new DataView(padding.buffer).setBigUint64(paddingLength, bitLength, false);
    copy.update(padding);

    const result = new Uint8Array(32);
    const view = new DataView(result.buffer);
    for (let i = 0; i < 8; i += 1) view.setUint32(i * 4, copy.state[i]!, false);
    return result;
  }

  private compress(block: Uint8Array, offset: number): void {
    const words = new Uint32Array(64);
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const value15 = words[i - 15]!;
      const value2 = words[i - 2]!;
      const s0 = rotateRight(value15, 7) ^ rotateRight(value15, 18) ^ (value15 >>> 3);
      const s1 = rotateRight(value2, 17) ^ rotateRight(value2, 19) ^ (value2 >>> 10);
      words[i] = u32(words[i - 16]! + s0 + words[i - 7]! + s1);
    }

    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const first = u32(h! + s1 + choose + ROUND_CONSTANTS[i]! + words[i]!);
      const s0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const second = u32(s0 + majority);
      h = g;
      g = f;
      f = e;
      e = u32(d! + first);
      d = c;
      c = b;
      b = a;
      a = u32(first + second);
    }
    this.state[0] = u32(this.state[0]! + a!);
    this.state[1] = u32(this.state[1]! + b!);
    this.state[2] = u32(this.state[2]! + c!);
    this.state[3] = u32(this.state[3]! + d!);
    this.state[4] = u32(this.state[4]! + e!);
    this.state[5] = u32(this.state[5]! + f!);
    this.state[6] = u32(this.state[6]! + g!);
    this.state[7] = u32(this.state[7]! + h!);
  }
}
