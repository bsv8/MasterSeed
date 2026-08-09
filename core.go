package masterseed

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"
	"math"
)

// SeedInfo describes a seed file. SourceSizeKnown is false for HashSeed and
// InspectSeed because a seed file does not encode source length.
type SeedInfo struct {
	Format          string
	BlockSize       uint64
	BlockCount      uint64
	SourceSize      uint64
	SourceSizeKnown bool
	SeedSize        uint64
	SeedHash        Digest
	SeedHashHex     string
}

// VerifyInfo describes a successful complete source verification.
type VerifyInfo struct {
	SeedInfo
	BlocksVerified uint64
}

func makeSeedInfo(blockCount, sourceSize, seedSize uint64, sourceKnown bool, seedHash Digest) SeedInfo {
	return SeedInfo{
		Format:          Format,
		BlockSize:       BlockSize,
		BlockCount:      blockCount,
		SourceSize:      sourceSize,
		SourceSizeKnown: sourceKnown,
		SeedSize:        seedSize,
		SeedHash:        seedHash,
		SeedHashHex:     seedHash.Hex(),
	}
}

func checkedAdd(a, b uint64) (uint64, error) {
	if b > math.MaxUint64-a {
		return 0, &Error{Code: IntegerOverflow, Message: "uint64 addition overflow"}
	}
	return a + b, nil
}

func checkedMul(a, b uint64) (uint64, error) {
	if a != 0 && b > math.MaxUint64/a {
		return 0, &Error{Code: IntegerOverflow, Message: "uint64 multiplication overflow"}
	}
	return a * b, nil
}

// BlockCountForSourceSize applies the V1 empty-file and aligned-file rules.
func BlockCountForSourceSize(sourceSize uint64) uint64 {
	if sourceSize == 0 {
		return 0
	}
	return (sourceSize-1)/BlockSize + 1
}

// SeedSizeForBlockCount checks the block-count multiplication used by callers
// that work with untrusted metadata.
func SeedSizeForBlockCount(blockCount uint64) (uint64, error) {
	return checkedMul(blockCount, DigestSize)
}

// SourceOffset returns blockIndex*BLOCK_SIZE after checking overflow.
func SourceOffset(blockIndex uint64) (uint64, error) {
	return checkedMul(blockIndex, BlockSize)
}

// SeedOffset returns blockIndex*DIGEST_SIZE after checking overflow.
func SeedOffset(blockIndex uint64) (uint64, error) {
	return checkedMul(blockIndex, DigestSize)
}

// fill reads until buffer is full or the reader reports EOF. A short read is
// normal; (n > 0, io.EOF) bytes are included in the result.
func fill(ctx context.Context, reader io.Reader, buffer []byte) (n int, eof bool, err error) {
	ctx = contextOrBackground(ctx)
	zeroReads := 0
	for n < len(buffer) {
		if contextErr := checkContext(ctx); contextErr != nil {
			return n, false, contextErr
		}
		read, readErr := reader.Read(buffer[n:])
		if read < 0 || read > len(buffer)-n {
			return n, false, readError("read", fmt.Errorf("reader returned invalid byte count %d", read))
		}
		if read > 0 {
			n += read
			zeroReads = 0
		} else {
			zeroReads++
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return n, true, nil
			}
			return n, false, readError("read", readErr)
		}
		if zeroReads >= 100 {
			return n, false, readError("read", io.ErrNoProgress)
		}
	}
	return n, false, nil
}

func writeFull(ctx context.Context, writer io.Writer, value []byte) error {
	ctx = contextOrBackground(ctx)
	for written := 0; written < len(value); {
		if contextErr := checkContext(ctx); contextErr != nil {
			return contextErr
		}
		n, err := writer.Write(value[written:])
		if n < 0 || n > len(value)-written {
			return writeError("write", fmt.Errorf("writer returned invalid byte count %d", n))
		}
		written += n
		if err != nil {
			return writeError("write", err)
		}
		if n == 0 {
			return writeError("write", io.ErrShortWrite)
		}
	}
	return nil
}

// CreateSeed hashes source in protocol-sized blocks and writes raw 32-byte
// digests to sink. It never writes hexadecimal text to the sink.
func CreateSeed(ctx context.Context, source io.Reader, sink io.Writer) (SeedInfo, error) {
	ctx = contextOrBackground(ctx)
	buffer := make([]byte, BlockSize)
	seedHasher := sha256.New()
	var blockCount, sourceSize, seedSize uint64

	for {
		n, eof, err := fill(ctx, source, buffer)
		if err != nil {
			return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), err
		}
		if n == 0 && eof {
			break
		}
		newSourceSize, overflowErr := checkedAdd(sourceSize, uint64(n))
		if overflowErr != nil {
			return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), overflowErr
		}
		sourceSize = newSourceSize
		blockHash := sha256.Sum256(buffer[:n])
		if err := writeFull(ctx, sink, blockHash[:]); err != nil {
			return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), err
		}
		_, _ = seedHasher.Write(blockHash[:])
		newSeedSize, overflowErr := checkedAdd(seedSize, DigestSize)
		if overflowErr != nil {
			return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), overflowErr
		}
		seedSize = newSeedSize
		newBlockCount, blockCountErr := checkedAdd(blockCount, 1)
		if blockCountErr != nil {
			return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), blockCountErr
		}
		blockCount = newBlockCount
		if eof {
			break
		}
	}

	seedHash, err := DigestFromBytes(seedHasher.Sum(nil))
	if err != nil {
		return makeSeedInfo(blockCount, sourceSize, seedSize, true, Digest{}), err
	}
	return makeSeedInfo(blockCount, sourceSize, seedSize, true, seedHash), nil
}

func hashStream(ctx context.Context, seed io.Reader) (Digest, uint64, error) {
	buffer := make([]byte, 64*1024)
	hasher := sha256.New()
	var size uint64
	for {
		n, eof, err := fill(ctx, seed, buffer)
		if n > 0 {
			_, _ = hasher.Write(buffer[:n])
			var addErr error
			size, addErr = checkedAdd(size, uint64(n))
			if addErr != nil {
				return Digest{}, size, addErr
			}
		}
		if err != nil {
			return Digest{}, size, err
		}
		if eof {
			break
		}
	}
	digest, err := DigestFromBytes(hasher.Sum(nil))
	return digest, size, err
}

// HashSeed computes SHA-256 over any seed bytes without validating its length.
func HashSeed(ctx context.Context, seed io.Reader) (Digest, error) {
	digest, _, err := hashStream(ctx, seed)
	return digest, err
}

// InspectSeed computes seed_hash and requires the seed length to be a multiple
// of the raw digest size.
func InspectSeed(ctx context.Context, seed io.Reader) (SeedInfo, error) {
	digest, size, err := hashStream(ctx, seed)
	if err != nil {
		return SeedInfo{}, err
	}
	if size%DigestSize != 0 {
		return makeSeedInfo(size/DigestSize, 0, size, false, digest), &Error{
			Code:     InvalidSeedLength,
			Message:  fmt.Sprintf("seed size %d is not a multiple of %d", size, DigestSize),
			SeedSize: uint64Pointer(size),
		}
	}
	return makeSeedInfo(size/DigestSize, 0, size, false, digest), nil
}

// VerifySeed strictly inspects a seed and compares its raw-byte hash with the
// caller's expected digest using a constant-time comparison.
func VerifySeed(ctx context.Context, seed io.Reader, expected Digest) (SeedInfo, error) {
	info, err := InspectSeed(ctx, seed)
	if err != nil {
		return info, err
	}
	if subtle.ConstantTimeCompare(info.SeedHash.bytes[:], expected.bytes[:]) != 1 {
		return info, &Error{Code: SeedHashMismatch, Message: "seed hash does not match expected digest", Expected: digestPointer(expected), Actual: digestPointer(info.SeedHash), SeedSize: uint64Pointer(info.SeedSize)}
	}
	return info, nil
}

func uint64Pointer(value uint64) *uint64 { return &value }

// VerifySource validates every source block against the raw digests in seed,
// then checks that neither stream contains extra data.
func VerifySource(ctx context.Context, source io.Reader, seed io.Reader) (VerifyInfo, error) {
	ctx = contextOrBackground(ctx)
	seedBuffer := make([]byte, DigestSize)
	sourceBuffer := make([]byte, BlockSize)
	seedHasher := sha256.New()
	var seedSize, sourceSize, blockCount uint64

	for {
		n, eof, err := fill(ctx, seed, seedBuffer)
		if n > 0 {
			_, _ = seedHasher.Write(seedBuffer[:n])
			var addErr error
			seedSize, addErr = checkedAdd(seedSize, uint64(n))
			if addErr != nil {
				return VerifyInfo{}, addErr
			}
		}
		if err != nil {
			return VerifyInfo{}, err
		}
		if n == 0 && eof {
			break
		}
		if n != DigestSize {
			return VerifyInfo{}, &Error{Code: InvalidSeedLength, Message: "seed ended in the middle of a digest", SeedSize: uint64Pointer(seedSize)}
		}

		blockIndex := blockCount
		offset, offsetErr := SourceOffset(blockIndex)
		if offsetErr != nil {
			return VerifyInfo{}, offsetErr
		}
		sourceN, sourceEOF, sourceErr := fill(ctx, source, sourceBuffer)
		if sourceErr != nil {
			return VerifyInfo{}, sourceErr
		}
		if sourceN == 0 && sourceEOF {
			return VerifyInfo{}, &Error{Code: SourceTooShort, Message: "source ended before the seed described block", BlockIndex: uint64Pointer(blockIndex), SourceOffset: uint64Pointer(offset)}
		}
		newSourceSize, addErr := checkedAdd(sourceSize, uint64(sourceN))
		if addErr != nil {
			return VerifyInfo{}, addErr
		}
		sourceSize = newSourceSize
		actual := Sum256(sourceBuffer[:sourceN])
		var expectedBytes [DigestSize]byte
		copy(expectedBytes[:], seedBuffer[:DigestSize])
		expected := Digest{bytes: expectedBytes}
		if subtle.ConstantTimeCompare(expected.bytes[:], actual.bytes[:]) != 1 {
			return VerifyInfo{}, &Error{Code: BlockHashMismatch, Message: "source block hash does not match seed", BlockIndex: uint64Pointer(blockIndex), SourceOffset: uint64Pointer(offset), Expected: digestPointer(expected), Actual: digestPointer(actual)}
		}
		newBlockCount, blockCountErr := checkedAdd(blockCount, 1)
		if blockCountErr != nil {
			return VerifyInfo{}, blockCountErr
		}
		blockCount = newBlockCount
		if sourceEOF && sourceN < BlockSize {
			// The source is at EOF. A later seed digest will report SOURCE_TOO_SHORT.
			continue
		}
	}

	var extra [1]byte
	extraN, _, extraErr := fill(ctx, source, extra[:])
	if extraErr != nil {
		return VerifyInfo{}, extraErr
	}
	if extraN > 0 {
		return VerifyInfo{}, &Error{Code: SourceTooLong, Message: "source contains bytes not described by seed", BlockIndex: uint64Pointer(blockCount), SourceOffset: uint64Pointer(sourceSize)}
	}
	seedHash, digestErr := DigestFromBytes(seedHasher.Sum(nil))
	if digestErr != nil {
		return VerifyInfo{}, digestErr
	}
	info := makeSeedInfo(blockCount, sourceSize, seedSize, true, seedHash)
	return VerifyInfo{SeedInfo: info, BlocksVerified: blockCount}, nil
}

func readAtFull(ctx context.Context, reader io.ReaderAt, buffer []byte, offset int64) error {
	for read := 0; read < len(buffer); {
		if err := checkContext(ctx); err != nil {
			return err
		}
		n, err := reader.ReadAt(buffer[read:], offset+int64(read))
		if n < 0 || n > len(buffer)-read {
			return readError("read-at", fmt.Errorf("reader returned invalid byte count %d", n))
		}
		read += n
		if err != nil {
			if errors.Is(err, io.EOF) && read == len(buffer) {
				return nil
			}
			return readError("read-at", err)
		}
		if n == 0 {
			return readError("read-at", io.ErrNoProgress)
		}
	}
	return nil
}

// ReadBlockHash reads one raw digest from a random-access seed file.
func ReadBlockHash(ctx context.Context, seed io.ReaderAt, seedSize, blockIndex uint64) (Digest, error) {
	if seedSize%DigestSize != 0 {
		return Digest{}, &Error{Code: InvalidSeedLength, Message: "seed size is not a multiple of the digest size", SeedSize: uint64Pointer(seedSize)}
	}
	blockCount := seedSize / DigestSize
	if blockIndex >= blockCount {
		return Digest{}, &Error{Code: BlockIndexOutOfRange, Message: "block index is outside the seed", BlockIndex: uint64Pointer(blockIndex), BlockCount: uint64Pointer(blockCount)}
	}
	offset, err := SeedOffset(blockIndex)
	if err != nil || offset > math.MaxInt64-DigestSize {
		return Digest{}, &Error{Code: IntegerOverflow, Message: "seed offset cannot be represented as an int64"}
	}
	var raw [DigestSize]byte
	if err := readAtFull(ctx, seed, raw[:], int64(offset)); err != nil {
		return Digest{}, err
	}
	return Digest{bytes: raw}, nil
}

// VerifyBlock hashes one caller-provided block. A short block is accepted; an
// API caller needs source-length context to decide whether it is the last one.
func VerifyBlock(ctx context.Context, block []byte, expected Digest) (Digest, error) {
	if err := checkContext(ctx); err != nil {
		return Digest{}, err
	}
	if len(block) > BlockSize {
		return Digest{}, invalidArgument("a block cannot exceed BLOCK_SIZE")
	}
	actual := Sum256(block)
	if subtle.ConstantTimeCompare(actual.bytes[:], expected.bytes[:]) != 1 {
		return actual, &Error{Code: BlockHashMismatch, Message: "block hash does not match expected digest", Expected: digestPointer(expected), Actual: digestPointer(actual)}
	}
	return actual, nil
}
