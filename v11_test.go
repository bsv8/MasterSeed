package masterseed

import (
	"bytes"
	"context"
	"io"
	"math"
	"testing"
)

type pendingEOFReader struct {
	entered chan struct{}
	release chan struct{}
}

func (r *pendingEOFReader) Read([]byte) (int, error) { close(r.entered); <-r.release; return 0, io.EOF }

type trackingReader struct {
	data []byte
	pos  int
}

func (r *trackingReader) Read(p []byte) (int, error) {
	if r.pos == len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.pos:])
	r.pos += n
	return n, nil
}

func makeSeedBytes(t *testing.T, source []byte) ([]byte, SeedInfo) {
	t.Helper()
	var out bytes.Buffer
	info, err := CreateSeed(context.Background(), bytes.NewReader(source), &out)
	if err != nil {
		t.Fatal(err)
	}
	return out.Bytes(), info
}

func TestV11TrustedSeedOperations(t *testing.T) {
	source := bytes.Repeat([]byte{0x5a}, BlockSize+1)
	seed, created := makeSeedBytes(t, source)
	verified, err := VerifySeedForSourceSize(context.Background(), bytes.NewReader(seed), created.SeedHash, uint64(len(source)))
	if err != nil || !verified.SourceSizeKnown || verified.BlockCount != 2 {
		t.Fatalf("verify seed for source size: %+v %v", verified, err)
	}
	if got, err := ExpectedBlockSize(uint64(len(source)), 0); err != nil || got != BlockSize {
		t.Fatalf("first block size: %d %v", got, err)
	}
	if got, err := ExpectedBlockSize(uint64(len(source)), 1); err != nil || got != 1 {
		t.Fatalf("tail block size: %d %v", got, err)
	}
	matches, err := FindBlockHash(context.Background(), bytes.NewReader(seed), created.SeedHash, uint64(len(source)), Sum256(source[:BlockSize]))
	if err != nil || matches.MatchCount != 1 || matches.FirstIndex != 0 || matches.LastIndex != 0 {
		t.Fatalf("find block: %+v %v", matches, err)
	}
	member, err := VerifyBlockInSeed(context.Background(), bytes.NewReader(seed), created.SeedHash, uint64(len(source)), source[:BlockSize])
	if err != nil || member.BlockIndex != 0 || member.BlockSize != BlockSize {
		t.Fatalf("verify member: %+v %v", member, err)
	}
	if _, err := ExpectedBlockSize(0, 0); !IsCode(err, BlockIndexOutOfRange) {
		t.Fatalf("empty source index should be out of range: %v", err)
	}
}

func TestV11BoundariesAndDuplicates(t *testing.T) {
	empty, info := makeSeedBytes(t, nil)
	if _, err := VerifySeedForSourceSize(context.Background(), bytes.NewReader(empty), info.SeedHash, 0); err != nil {
		t.Fatal(err)
	}
	zero, err := FindBlockHash(context.Background(), bytes.NewReader(empty), info.SeedHash, 0, Sum256(nil))
	if err != nil || zero.MatchCount != 0 {
		t.Fatalf("zero matches: %+v %v", zero, err)
	}
	for _, tc := range []struct {
		s, i uint64
		want uint64
		code ErrorCode
	}{
		{0, 0, 0, BlockIndexOutOfRange}, {BlockSize - 1, 0, BlockSize - 1, ErrorCode("")}, {BlockSize, 0, BlockSize, ErrorCode("")}, {BlockSize + 1, 1, 1, ErrorCode("")}, {math.MaxUint64, 0, BlockSize, ErrorCode("")}, {1, 1, 0, BlockIndexOutOfRange},
	} {
		got, e := ExpectedBlockSize(tc.s, tc.i)
		if tc.code != "" {
			if !IsCode(e, tc.code) {
				t.Errorf("%+v: %v", tc, e)
			}
		} else if e != nil || got != tc.want {
			t.Errorf("%+v got %d %v", tc, got, e)
		}
	}
	d := Sum256([]byte{1})
	seed := append(d.Bytes(), d.Bytes()...)
	h := Sum256(seed)
	m, e := FindBlockHash(context.Background(), &chunkReader{data: seed, chunk: 1}, h, BlockSize+1, d)
	if e != nil || m.MatchCount != 2 || m.FirstIndex != 0 || m.LastIndex != 1 {
		t.Fatalf("dups: %+v %v", m, e)
	}
	v, e := VerifyBlockInSeed(context.Background(), bytes.NewReader(seed), h, BlockSize+1, []byte{1})
	if e != nil || v.BlockIndex != 1 || v.BlockSize != 1 {
		t.Fatalf("compat: %+v %v", v, e)
	}
	if _, e := VerifySeedForSourceSize(context.Background(), &errorReader{}, h, 0); !IsCode(e, ReadFailed) {
		t.Fatalf("read failure: %v", e)
	}
	oversized := bytes.Repeat([]byte{9}, BlockSize+1)
	od := Sum256(oversized)
	osd := od.Bytes()
	oh := Sum256(osd)
	if _, e := VerifyBlockInSeed(context.Background(), bytes.NewReader(osd), oh, BlockSize, oversized); !IsCode(e, BlockSizeMismatch) {
		t.Fatalf("oversized classification: %v", e)
	} else if x, ok := e.(*Error); !ok || x.ActualBlockSize == nil || *x.ActualBlockSize != uint64(len(oversized)) {
		t.Fatalf("size context: %#v", e)
	}
	if _, e := VerifyBlockInSeed(context.Background(), bytes.NewReader(osd), Sum256(nil), BlockSize, oversized); !IsCode(e, SeedHashMismatch) {
		t.Fatalf("oversized hash priority: %v", e)
	}
	if _, e := VerifyBlockInSeed(context.Background(), bytes.NewReader(osd), oh, BlockSize, []byte{8}); !IsCode(e, BlockNotInSeed) {
		t.Fatalf("oversized missing digest: %v", e)
	}
	other := bytes.Repeat([]byte{7}, BlockSize+1)
	if _, e := VerifyBlockInSeed(context.Background(), bytes.NewReader(osd), oh, BlockSize, other); !IsCode(e, BlockNotInSeed) {
		t.Fatalf("oversized absent digest: %v", e)
	}
}

func TestV11ErrorPriorityAndMembership(t *testing.T) {
	badSeed := []byte{1}
	if _, err := VerifySeedForSourceSize(context.Background(), bytes.NewReader(badSeed), Sum256(nil), 1); !IsCode(err, InvalidSeedLength) {
		t.Fatalf("invalid structure must win: %v", err)
	}
	single := Sum256([]byte{1})
	var raw bytes.Buffer
	raw.Write(single.Bytes())
	seed := raw.Bytes()
	seedHash := Sum256(seed)
	if _, err := VerifyBlockInSeed(context.Background(), bytes.NewReader(seed), seedHash, BlockSize, []byte{1}); !IsCode(err, BlockSizeMismatch) {
		t.Fatalf("digest match with wrong protocol length: %v", err)
	}
	if _, err := VerifyBlockInSeed(context.Background(), bytes.NewReader(seed), seedHash, BlockSize, []byte{2}); !IsCode(err, BlockNotInSeed) {
		t.Fatalf("missing digest classification: %v", err)
	}
	if _, err := VerifySeedForSourceSize(context.Background(), bytes.NewReader(seed), Sum256(nil), BlockSize+1); !IsCode(err, SeedHashMismatch) {
		t.Fatalf("hash mismatch must precede size mismatch: %v", err)
	}
	if _, err := VerifySeedForSourceSize(context.Background(), bytes.NewReader(seed), seedHash, BlockSize+1); !IsCode(err, SeedSizeMismatch) {
		t.Fatalf("size mismatch expected: %v", err)
	} else if e, ok := err.(*Error); !ok || e.BlockCount == nil || *e.BlockCount != 1 || e.ExpectedBlockCount == nil || *e.ExpectedBlockCount != 2 {
		t.Fatalf("size context incorrect: %#v", err)
	}
	if _, err := FindBlockHash(context.Background(), bytes.NewReader(append(seed, 1)), seedHash, BlockSize, single); !IsCode(err, InvalidSeedLength) {
		t.Fatalf("find must read and validate malformed tail: %v", err)
	}
	tr := &trackingReader{data: append(seed, single.Bytes()...)}
	if _, err := FindBlockHash(context.Background(), tr, Sum256(nil), BlockSize*2, single); !IsCode(err, SeedHashMismatch) || tr.pos != len(tr.data) {
		t.Fatalf("find did not consume complete seed: err=%v pos=%d/%d", err, tr.pos, len(tr.data))
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := FindBlockHash(ctx, bytes.NewReader(seed), seedHash, BlockSize, single); !IsCode(err, Aborted) {
		t.Fatalf("cancelled find: %v", err)
	}
}

func TestV11CancelAfterPendingRead(t *testing.T) {
	r := &pendingEOFReader{entered: make(chan struct{}), release: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := VerifySeedForSourceSize(ctx, r, Sum256(nil), 0); done <- err }()
	<-r.entered
	cancel()
	close(r.release)
	if err := <-done; !IsCode(err, Aborted) {
		t.Fatalf("pending read cancellation: %v", err)
	}
}
