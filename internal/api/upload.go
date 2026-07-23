package api

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxUpload = 12 << 20 // 12 MiB

// fixed filenames so photo/resume url never changes, just gets overwritten
var allowedUploads = map[string]struct {
	filename string
	exts     map[string]bool
}{
	"photo":  {"photo.jpg", map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}},
	"resume": {"resume.pdf", map[string]bool{".pdf": true}},
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "файл слишком большой (макс. 12 МБ)")
		return
	}

	kind := r.FormValue("kind")

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "файл не передан")
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))

	// posters need unique names (many per library), unlike the fixed photo/resume.
	var dstName string
	if kind == "poster" {
		if !allowedPhotoExts[ext] {
			writeError(w, http.StatusUnsupportedMediaType, "недопустимый формат файла")
			return
		}
		dstName = uniqueFilename("poster", ext)
	} else {
		spec, ok := allowedUploads[kind]
		if !ok {
			writeError(w, http.StatusBadRequest, "неизвестный тип загрузки")
			return
		}
		if !spec.exts[ext] {
			writeError(w, http.StatusUnsupportedMediaType, "недопустимый формат файла")
			return
		}
		// keep base name but real ext, so browser can guess content type right
		base := strings.TrimSuffix(spec.filename, filepath.Ext(spec.filename))
		dstName = base + ext
	}
	dstPath := filepath.Join(s.UploadsDir, dstName)

	dst, err := os.Create(dstPath)
	if err != nil {
		s.serverError(w, "create upload", err)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		s.serverError(w, "write upload", err)
		return
	}

	url := fmt.Sprintf("/uploads/%s", dstName)
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// for blog photos - unlike profile/resume above we need unique names
// since a post can have multiple photos
var allowedPhotoExts = map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}

func uniqueFilename(prefix, ext string) string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s-%d-%s%s", prefix, time.Now().UnixNano(), hex.EncodeToString(b), ext)
}
