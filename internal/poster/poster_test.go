package poster

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"math/rand/v2"
	"testing"
)

func TestOptimizeShrinksToJPEG(t *testing.T) {
	// noisy pixels, like a photo: a flat gradient compresses too well in png
	rnd := rand.New(rand.NewPCG(1, 2))
	src := image.NewRGBA(image.Rect(0, 0, 1200, 1800))
	for y := 0; y < 1800; y++ {
		for x := 0; x < 1200; x++ {
			src.Set(x, y, color.RGBA{uint8(x + rnd.IntN(40)), uint8(y + rnd.IntN(40)), 90, 255})
		}
	}
	var in bytes.Buffer
	if err := png.Encode(&in, src); err != nil {
		t.Fatal(err)
	}
	inLen := in.Len()

	var out bytes.Buffer
	if err := Optimize(&in, &out); err != nil {
		t.Fatal(err)
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(out.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if format != "jpeg" || cfg.Width != MaxWidth || cfg.Height != 750 {
		t.Fatalf("got %s %dx%d, want jpeg %dx750", format, cfg.Width, cfg.Height, MaxWidth)
	}
	if out.Len() >= inLen {
		t.Fatalf("output %d bytes not smaller than input %d", out.Len(), inLen)
	}
}

func TestOptimizeKeepsSmallImageSize(t *testing.T) {
	var in bytes.Buffer
	_ = png.Encode(&in, image.NewRGBA(image.Rect(0, 0, 300, 450)))
	var out bytes.Buffer
	if err := Optimize(&in, &out); err != nil {
		t.Fatal(err)
	}
	cfg, _, _ := image.DecodeConfig(bytes.NewReader(out.Bytes()))
	if cfg.Width != 300 || cfg.Height != 450 {
		t.Fatalf("got %dx%d, want 300x450 (no upscaling)", cfg.Width, cfg.Height)
	}
}

func TestOptimizeRejectsGarbage(t *testing.T) {
	if err := Optimize(bytes.NewReader([]byte("<html>not an image</html>")), &bytes.Buffer{}); err == nil {
		t.Fatal("expected error for non-image input")
	}
}

func TestDenyPrivate(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:80", "10.0.0.5:443", "192.168.1.1:80", "[::1]:80", "169.254.169.254:80", "0.0.0.0:80"} {
		if denyPrivate("tcp", addr, nil) == nil {
			t.Errorf("%s should be refused", addr)
		}
	}
	if err := denyPrivate("tcp", "93.184.216.34:443", nil); err != nil {
		t.Errorf("public address refused: %v", err)
	}
}
