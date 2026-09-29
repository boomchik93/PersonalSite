// Package poster downloads film posters and shrinks them before they land in
// the uploads dir. The site only ever shows posters as small cards, so storing
// multi-megabyte originals from Kinopoisk/TMDB would just waste disk.
package poster

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	_ "image/gif"
	_ "image/png"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	// MaxWidth covers the biggest place a poster is shown (modal on a retina screen).
	MaxWidth = 500
	quality  = 82

	maxSourceBytes  = 15 << 20
	maxSourcePixels = 40_000_000 // refuse decompression bombs before decoding
)

// at most 2 images decoded at once: a decoded 2000x3000 poster is ~20 MB of
// RAM, and bulk import would otherwise decode dozens in parallel on a tiny VPS
var decodeSlots = make(chan struct{}, 2)

// IsRemote reports whether the poster value points outside our own uploads.
func IsRemote(u string) bool {
	return strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://")
}

// SaveFromURL downloads rawURL, optimizes it and writes dir/name atomically.
func SaveFromURL(ctx context.Context, rawURL, dir, name string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "cv-site-poster-fetcher/1.0")
	req.Header.Set("Accept", "image/jpeg,image/png,image/webp,image/*;q=0.8")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("poster download: HTTP %d", resp.StatusCode)
	}
	return SaveFromReader(resp.Body, dir, name)
}

// SaveFromReader optimizes the image from r and writes dir/name atomically,
// so a half-written file never gets served.
func SaveFromReader(r io.Reader, dir, name string) error {
	tmp, err := os.CreateTemp(dir, ".poster-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after successful rename
	if err := Optimize(r, tmp); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o644); err != nil { // CreateTemp makes it 0600
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(dir, name))
}

// Optimize decodes any jpeg/png/gif/webp, scales it down to MaxWidth and
// re-encodes as jpeg (which also strips EXIF and other metadata).
func Optimize(r io.Reader, w io.Writer) error {
	data, err := io.ReadAll(io.LimitReader(r, maxSourceBytes+1))
	if err != nil {
		return err
	}
	if len(data) > maxSourceBytes {
		return errors.New("poster: source image too large")
	}

	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("poster: not an image: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxSourcePixels {
		return errors.New("poster: image dimensions out of range")
	}

	decodeSlots <- struct{}{}
	defer func() { <-decodeSlots }()

	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("poster: decode: %w", err)
	}
	data = nil // let GC take the compressed bytes while we scale

	b := src.Bounds()
	dw, dh := b.Dx(), b.Dy()
	if dw > MaxWidth {
		dh = dh * MaxWidth / dw
		dw = MaxWidth
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	// white under transparent png/gif, otherwise jpeg turns it black
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)

	return jpeg.Encode(w, dst, &jpeg.Options{Quality: quality})
}

// client refuses to connect to loopback/private addresses, so a poster URL
// can't be used to poke at services on the host or its internal network.
var client = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout: 10 * time.Second,
			Control: denyPrivate,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		MaxIdleConns:          4,
		IdleConnTimeout:       30 * time.Second,
	},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("poster: too many redirects")
		}
		return nil
	},
}

func denyPrivate(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return fmt.Errorf("poster: refusing to connect to %s", host)
	}
	return nil
}
