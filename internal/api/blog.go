package api

import (
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"

	"cv-semenov/internal/store"
)

const (
	maxPostPhotosUpload = 40 << 20 // 40 MiB total per request
	maxPhotosPerPost    = 10
)

// hash ip so we can dedupe reactions without storing raw ip
func (s *Server) clientIPHash(r *http.Request) string {
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			// X-Forwarded-For may be a comma-separated chain; the client is first.
			ip = strings.TrimSpace(strings.Split(fwd, ",")[0])
		}
	}
	if ip == "" {
		if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
			ip = host
		} else {
			ip = r.RemoteAddr
		}
	}
	hash, err := s.Store.IPHash(ip)
	if err != nil {
		return ""
	}
	return hash
}

// ---------- public ----------

func (s *Server) handleListPosts(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 10, 1, 50)
	offset := queryInt(r, "offset", 0, 0, 1<<30)

	posts, err := s.Store.ListPosts(true, s.clientIPHash(r), limit, offset)
	if err != nil {
		s.serverError(w, "list posts", err)
		return
	}
	total, err := s.Store.CountPosts(true)
	if err != nil {
		s.serverError(w, "count posts", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"posts":    posts,
		"total":    total,
		"has_more": offset+len(posts) < total,
	})
}

func (s *Server) handleGetPost(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	p, err := s.Store.GetPost(id, s.clientIPHash(r))
	if err == store.ErrNotFound || (err == nil && !p.Published) {
		writeError(w, http.StatusNotFound, "пост не найден")
		return
	}
	if err != nil {
		s.serverError(w, "get post", err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleReactToPost(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	if !slices.Contains(store.AllowedEmoji, req.Emoji) {
		writeError(w, http.StatusUnprocessableEntity, "недопустимая реакция")
		return
	}
	ipHash := s.clientIPHash(r)
	if ipHash == "" {
		writeError(w, http.StatusInternalServerError, "не удалось определить отправителя")
		return
	}
	if _, err := s.Store.ToggleReaction(id, req.Emoji, ipHash); err != nil {
		s.serverError(w, "toggle reaction", err)
		return
	}
	p, err := s.Store.GetPost(id, ipHash)
	if err != nil {
		s.serverError(w, "get post", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reactions": p.Reactions})
}

// ---------- admin ----------

func (s *Server) handleAdminListPosts(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50, 1, 200)
	offset := queryInt(r, "offset", 0, 0, 1<<30)
	posts, err := s.Store.ListPosts(false, "", limit, offset)
	if err != nil {
		s.serverError(w, "list posts", err)
		return
	}
	writeJSON(w, http.StatusOK, posts)
}

func (s *Server) handleSavePost(w http.ResponseWriter, r *http.Request) {
	var p store.Post
	if err := decodeJSON(r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	p.Title = trim(p.Title)
	p.Body = trim(p.Body)
	if p.Title == "" || p.Body == "" {
		writeError(w, http.StatusUnprocessableEntity, "укажите заголовок и текст")
		return
	}
	if p.ID == 0 {
		id, err := s.Store.CreatePost(p)
		if err != nil {
			s.serverError(w, "create post", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
		return
	}
	if err := s.Store.UpdatePost(p); err != nil {
		s.serverError(w, "update post", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeletePost(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	urls, err := s.Store.PhotoURLsForPost(id)
	if err != nil {
		s.serverError(w, "list post photos", err)
		return
	}
	if err := s.Store.DeletePost(id); err != nil {
		s.serverError(w, "delete post", err)
		return
	}
	for _, u := range urls {
		s.removeUpload(u)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleUploadPostPhotos(w http.ResponseWriter, r *http.Request) {
	postID, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxPostPhotosUpload)
	if err := r.ParseMultipartForm(maxPostPhotosUpload); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "файлы слишком большие (макс. 40 МБ суммарно)")
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeError(w, http.StatusBadRequest, "файлы не переданы")
		return
	}
	if len(files) > maxPhotosPerPost {
		writeError(w, http.StatusBadRequest, "не более 10 фото за раз")
		return
	}

	existing, err := s.Store.PhotoURLsForPost(postID)
	if err != nil {
		s.serverError(w, "list post photos", err)
		return
	}
	pos := len(existing)

	var added []store.PostPhoto
	for _, header := range files {
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if !allowedPhotoExts[ext] {
			continue
		}
		file, err := header.Open()
		if err != nil {
			continue
		}
		name := uniqueFilename("post", ext)
		dstPath := filepath.Join(s.UploadsDir, name)
		dst, err := os.Create(dstPath)
		if err != nil {
			file.Close()
			continue
		}
		_, copyErr := io.Copy(dst, file)
		file.Close()
		dst.Close()
		if copyErr != nil {
			os.Remove(dstPath)
			continue
		}

		url := "/uploads/" + name
		id, err := s.Store.AddPostPhoto(postID, url, pos)
		if err != nil {
			os.Remove(dstPath)
			continue
		}
		added = append(added, store.PostPhoto{ID: id, PostID: postID, URL: url, Pos: pos})
		pos++
	}

	writeJSON(w, http.StatusOK, map[string]any{"photos": added})
}

func (s *Server) handleDeletePostPhoto(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	url, err := s.Store.DeletePostPhoto(id)
	if err == store.ErrNotFound {
		writeError(w, http.StatusNotFound, "фото не найдено")
		return
	}
	if err != nil {
		s.serverError(w, "delete post photo", err)
		return
	}
	s.removeUpload(url)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleReorderPhotos(w http.ResponseWriter, r *http.Request) {
	postID, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	if err := s.Store.ReorderPostPhotos(postID, req.IDs); err != nil {
		s.serverError(w, "reorder photos", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- helpers ----------

// best effort delete, don't care if it fails
func (s *Server) removeUpload(url string) {
	name := strings.TrimPrefix(url, "/uploads/")
	if name == "" || strings.Contains(name, "/") {
		return
	}
	_ = os.Remove(filepath.Join(s.UploadsDir, name))
}

func queryInt(r *http.Request, key string, def, min, max int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
