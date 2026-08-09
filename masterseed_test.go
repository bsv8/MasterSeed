package masterseed

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
)

type vectorFile struct {
	Schema        string       `json:"schema"`
	Format        string       `json:"format"`
	BlockSize     int          `json:"block_size"`
	DigestSize    int          `json:"digest_size"`
	HashAlgorithm string       `json:"hash_algorithm"`
	Vectors       []testVector `json:"vectors"`
}

type sourceRecipe struct {
	Kind     string          `json:"kind"`
	Value    string          `json:"value"`
	Byte     string          `json:"byte"`
	Size     int             `json:"size"`
	Segments []sourceSegment `json:"segments"`
}

type sourceSegment struct {
	Byte string `json:"byte"`
	Size int    `json:"size"`
}

type testVector struct {
	Name           string       `json:"name"`
	Source         sourceRecipe `json:"source"`
	SourceSize     int          `json:"source_size"`
	BlockCount     int          `json:"block_count"`
	BlockHashesHex []string     `json:"block_hashes_hex"`
	SeedSize       int          `json:"seed_size"`
	SeedBytesHex   string       `json:"seed_bytes_hex"`
	SeedHashHex    string       `json:"seed_hash_hex"`
}

func readVectors(t *testing.T) vectorFile {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "v1", "vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var vectors vectorFile
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatal(err)
	}
	return vectors
}

func recipeBytes(t *testing.T, recipe sourceRecipe) []byte {
	t.Helper()
	switch recipe.Kind {
	case "empty":
		return nil
	case "hex":
		value, err := hex.DecodeString(recipe.Value)
		if err != nil {
			t.Fatal(err)
		}
		return value
	case "repeat":
		value, err := hex.DecodeString(recipe.Byte)
		if err != nil || len(value) != 1 {
			t.Fatalf("invalid repeat byte: %q", recipe.Byte)
		}
		return bytes.Repeat(value, recipe.Size)
	case "ramp8":
		value := make([]byte, recipe.Size)
		for i := range value {
			value[i] = byte(i)
		}
		return value
	case "segments":
		var value []byte
		for _, segment := range recipe.Segments {
			part, err := hex.DecodeString(segment.Byte)
			if err != nil || len(part) != 1 {
				t.Fatalf("invalid segment byte: %q", segment.Byte)
			}
			value = append(value, bytes.Repeat(part, segment.Size)...)
		}
		return value
	default:
		t.Fatalf("unknown source recipe %q", recipe.Kind)
		return nil
	}
}

func TestSharedVectors(t *testing.T) {
	vectors := readVectors(t)
	if vectors.Format != Format || vectors.BlockSize != BlockSize || vectors.DigestSize != DigestSize || vectors.HashAlgorithm != HashAlgorithm {
		t.Fatalf("shared vector protocol metadata is inconsistent: %+v", vectors)
	}
	for _, vector := range vectors.Vectors {
		vector := vector
		t.Run(vector.Name, func(t *testing.T) {
			source := recipeBytes(t, vector.Source)
			if len(source) != vector.SourceSize || len(vector.BlockHashesHex) != vector.BlockCount || vector.SeedSize != len(vector.SeedBytesHex)/2 {
				t.Fatalf("invalid vector lengths")
			}
			expectedSeed, err := hex.DecodeString(vector.SeedBytesHex)
			if err != nil {
				t.Fatal(err)
			}
			expectedHash, err := ParseDigestHex(vector.SeedHashHex)
			if err != nil {
				t.Fatal(err)
			}
			var output bytes.Buffer
			info, err := CreateSeed(context.Background(), &chunkReader{data: source, chunk: 1}, &output)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(output.Bytes(), expectedSeed) || info.SeedSize != uint64(vector.SeedSize) || info.BlockCount != uint64(vector.BlockCount) || info.SourceSize != uint64(vector.SourceSize) || info.SeedHash != expectedHash {
				t.Fatalf("generated result differs from vector: info=%+v output=%x", info, output.Bytes())
			}
			if len(output.Bytes()) != vector.BlockCount*DigestSize {
				t.Fatalf("seed is not raw digest concatenation")
			}

			inspected, err := InspectSeed(context.Background(), bytes.NewReader(output.Bytes()))
			if err != nil || inspected.SeedHash != expectedHash || inspected.BlockCount != uint64(vector.BlockCount) {
				t.Fatalf("inspect failed: info=%+v err=%v", inspected, err)
			}
			if _, err := VerifySeed(context.Background(), bytes.NewReader(output.Bytes()), expectedHash); err != nil {
				t.Fatal(err)
			}
			verified, err := VerifySource(context.Background(), &chunkReader{data: source, chunk: 17}, &chunkReader{data: output.Bytes(), chunk: 3})
			if err != nil || verified.BlocksVerified != uint64(vector.BlockCount) {
				t.Fatalf("source verification failed: info=%+v err=%v", verified, err)
			}
			for i, hashHex := range vector.BlockHashesHex {
				expectedBlock, err := ParseDigestHex(hashHex)
				if err != nil {
					t.Fatal(err)
				}
				actual, err := ReadBlockHash(context.Background(), bytes.NewReader(output.Bytes()), uint64(len(output.Bytes())), uint64(i))
				if err != nil || actual != expectedBlock {
					t.Fatalf("block %d read failed: %v", i, err)
				}
			}
		})
	}
}

func TestDigestParsingAndImmutability(t *testing.T) {
	digest := Sum256([]byte("abc"))
	copyOfBytes := digest.Bytes()
	copyOfBytes[0] ^= 0xff
	if digest.Hex() != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" {
		t.Fatal("digest was mutable through returned bytes")
	}
	for _, value := range []string{"", "0x" + digest.Hex(), " " + digest.Hex(), digest.Hex()[:63], digest.Hex() + "00", "zz" + digest.Hex()[2:]} {
		if _, err := ParseDigestHex(value); !IsCode(err, InvalidHashEncoding) {
			t.Fatalf("expected invalid encoding for %q, got %v", value, err)
		}
	}
	upper := "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"
	parsed, err := ParseDigestHex(upper)
	if err != nil || parsed.Hex() != digest.Hex() {
		t.Fatalf("upper-case digest parsing failed: %v", err)
	}
	if _, err := DigestFromBytes(make([]byte, DigestSize-1)); !IsCode(err, InvalidHashEncoding) {
		t.Fatalf("wrong digest length was accepted")
	}
}

func TestSeedLengthAndVerificationFailures(t *testing.T) {
	for _, size := range []int{1, 31, 33, 63} {
		_, err := InspectSeed(context.Background(), bytes.NewReader(make([]byte, size)))
		if !IsCode(err, InvalidSeedLength) {
			t.Fatalf("size %d: expected INVALID_SEED_LENGTH, got %v", size, err)
		}
	}
	seed := []byte{1, 2, 3}
	if _, err := VerifySeed(context.Background(), bytes.NewReader(seed), Sum256(nil)); !IsCode(err, InvalidSeedLength) {
		t.Fatalf("invalid structure should be checked before hash")
	}
	if _, err := VerifySeed(context.Background(), bytes.NewReader([]byte{0}), Sum256(nil)); !IsCode(err, InvalidSeedLength) {
		t.Fatal(err)
	}
	valid := Sum256([]byte("abc")).Bytes()
	if _, err := VerifySeed(context.Background(), bytes.NewReader(valid), Sum256(nil)); !IsCode(err, SeedHashMismatch) {
		t.Fatalf("expected seed hash mismatch, got %v", err)
	}
}

func TestSourceFailureClassification(t *testing.T) {
	seed := Sum256([]byte("abc")).Bytes()
	if _, err := VerifySource(context.Background(), bytes.NewReader(nil), bytes.NewReader(seed)); !IsCode(err, SourceTooShort) {
		t.Fatalf("expected source too short, got %v", err)
	}
	if _, err := VerifySource(context.Background(), bytes.NewReader([]byte("abcd")), bytes.NewReader(seed)); !IsCode(err, BlockHashMismatch) {
		t.Fatalf("expected block mismatch, got %v", err)
	}
	var seedForZero bytes.Buffer
	zeroBlock := make([]byte, BlockSize)
	_, _ = CreateSeed(context.Background(), bytes.NewReader(zeroBlock), &seedForZero)
	if _, err := VerifySource(context.Background(), bytes.NewReader(append(zeroBlock, 1)), bytes.NewReader(seedForZero.Bytes())); !IsCode(err, SourceTooLong) {
		t.Fatalf("expected source too long, got %v", err)
	}
	if _, err := VerifySource(context.Background(), bytes.NewReader(zeroBlock), bytes.NewReader(append(seedForZero.Bytes(), 1))); !IsCode(err, InvalidSeedLength) {
		t.Fatalf("expected truncated seed classification, got %v", err)
	}
}

func TestShortReadWriteAndCancellation(t *testing.T) {
	var output bytes.Buffer
	info, err := CreateSeed(context.Background(), &chunkReader{data: []byte("abc"), chunk: 1}, &shortWriter{writer: &output, chunk: 1})
	if err != nil || info.SeedSize != DigestSize || output.Len() != DigestSize {
		t.Fatalf("short read/write failed: info=%+v err=%v", info, err)
	}
	if _, err := CreateSeed(context.Background(), &errorReader{}, io.Discard); !IsCode(err, ReadFailed) {
		t.Fatalf("expected read failure, got %v", err)
	}
	var eofOutput bytes.Buffer
	if _, err := CreateSeed(context.Background(), &eofReader{data: []byte("abc")}, &eofOutput); err != nil || eofOutput.Len() != DigestSize {
		t.Fatalf("(n > 0, EOF) reader was mishandled: %v", err)
	}
	if _, err := CreateSeed(context.Background(), bytes.NewReader([]byte("abc")), &errorWriter{}); !IsCode(err, WriteFailed) {
		t.Fatalf("expected write failure, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CreateSeed(ctx, bytes.NewReader([]byte("abc")), io.Discard); !IsCode(err, Aborted) {
		t.Fatalf("expected cancellation, got %v", err)
	}
}

func TestOffsetChecks(t *testing.T) {
	if got := BlockCountForSourceSize(0); got != 0 {
		t.Fatal(got)
	}
	if got := BlockCountForSourceSize(BlockSize); got != 1 {
		t.Fatal(got)
	}
	if got := BlockCountForSourceSize(BlockSize + 1); got != 2 {
		t.Fatal(got)
	}
	if _, err := SeedSizeForBlockCount(^uint64(0)); !IsCode(err, IntegerOverflow) {
		t.Fatal(err)
	}
	if _, err := ReadBlockHash(context.Background(), bytes.NewReader(make([]byte, DigestSize)), DigestSize, 1); !IsCode(err, BlockIndexOutOfRange) {
		t.Fatal(err)
	}
}

func TestPathAtomicPublish(t *testing.T) {
	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "source.bin")
	seedPath := filepath.Join(directory, "seed.bin")
	if err := os.WriteFile(sourcePath, []byte("abc"), 0o600); err != nil {
		t.Fatal(err)
	}
	info, err := CreateSeedFile(context.Background(), sourcePath, seedPath, CreateSeedFileOptions{})
	if err != nil || info.SeedSize != DigestSize {
		t.Fatalf("path generation failed: %+v %v", info, err)
	}
	seedBytes, err := os.ReadFile(seedPath)
	if err != nil || len(seedBytes) != DigestSize {
		t.Fatalf("seed was not published as raw bytes: %v", err)
	}
	if _, err := CreateSeedFile(context.Background(), sourcePath, seedPath, CreateSeedFileOptions{}); !IsCode(err, TargetExists) {
		t.Fatalf("expected target exists, got %v", err)
	}
	if _, err := CreateSeedFile(context.Background(), sourcePath, sourcePath, CreateSeedFileOptions{Overwrite: true}); !IsCode(err, InvalidArgument) {
		t.Fatalf("same source/target should be rejected, got %v", err)
	}
	if _, err := VerifySourceFile(context.Background(), sourcePath, seedPath, info.SeedHash); err != nil {
		t.Fatal(err)
	}
	if _, err := CreateSeedFile(context.Background(), filepath.Join(directory, "missing"), filepath.Join(directory, "new.seed"), CreateSeedFileOptions{}); !IsCode(err, ReadFailed) {
		t.Fatal(err)
	}
}

type chunkReader struct {
	data  []byte
	pos   int
	chunk int
}

func (r *chunkReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	n := len(r.data) - r.pos
	if n > r.chunk {
		n = r.chunk
	}
	if n > len(p) {
		n = len(p)
	}
	copy(p, r.data[r.pos:r.pos+n])
	r.pos += n
	return n, nil
}

type shortWriter struct {
	writer io.Writer
	chunk  int
}

func (w *shortWriter) Write(p []byte) (int, error) {
	if len(p) > w.chunk {
		p = p[:w.chunk]
	}
	return w.writer.Write(p)
}

type errorReader struct{}

func (*errorReader) Read([]byte) (int, error) { return 0, errors.New("read boom") }

type eofReader struct {
	data []byte
	done bool
}

func (r *eofReader) Read(p []byte) (int, error) {
	if r.done {
		return 0, io.EOF
	}
	n := copy(p, r.data)
	r.done = true
	return n, io.EOF
}

type errorWriter struct{}

func (*errorWriter) Write([]byte) (int, error) { return 0, errors.New("write boom") }

func TestIndependentSeedHashVector(t *testing.T) {
	raw := sha256.Sum256([]byte("abc"))
	seedHash := sha256.Sum256(raw[:])
	if hex.EncodeToString(seedHash[:]) != "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358" {
		t.Fatal("independent vector calculation changed")
	}
}
