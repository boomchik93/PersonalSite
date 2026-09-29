package api

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cv-semenov/internal/moviemeta"
	"cv-semenov/internal/poster"
	"cv-semenov/internal/store"
)

// ---------- Kinopoisk / TMDB lookup for the admin movie form ----------

func (s *Server) handleLookupSources(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.Meta.Sources())
}

func (s *Server) handleLookupSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	title := trim(q.Get("q"))
	if title == "" {
		writeError(w, http.StatusBadRequest, "укажите название")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	res, err := s.Meta.Search(ctx, moviemeta.Source(q.Get("source")), title, q.Get("year"))
	if err != nil {
		s.lookupError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleLookupDetails(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	id, err := strconv.ParseInt(q.Get("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	d, err := s.Meta.Details(ctx, moviemeta.Source(q.Get("source")), id, q.Get("kind"))
	if err != nil {
		s.lookupError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *Server) lookupError(w http.ResponseWriter, err error) {
	var up *moviemeta.UpstreamError
	switch {
	case errors.Is(err, moviemeta.ErrUnknownSource):
		writeError(w, http.StatusBadRequest, "неизвестный источник")
	case errors.Is(err, moviemeta.ErrNotConfigured):
		writeError(w, http.StatusBadRequest, "источник не настроен — добавьте API-ключ в .env")
	case errors.As(err, &up):
		name := map[moviemeta.Source]string{moviemeta.Kinopoisk: "Кинопоиск", moviemeta.TMDB: "TMDB"}[up.Source]
		msg := fmt.Sprintf("%s ответил ошибкой %d", name, up.Status)
		switch up.Status {
		case http.StatusUnauthorized:
			msg = name + ": неверный API-ключ"
		case http.StatusForbidden, http.StatusTooManyRequests:
			msg = name + ": лимит запросов исчерпан, попробуйте позже или другой источник"
		case http.StatusNotFound:
			msg = name + ": не найдено"
		}
		log.Printf("lookup: %v", err)
		writeError(w, http.StatusBadGateway, msg)
	case errors.Is(err, context.DeadlineExceeded):
		writeError(w, http.StatusGatewayTimeout, "источник не ответил вовремя")
	default:
		log.Printf("lookup: %v", err)
		writeError(w, http.StatusBadGateway, "не удалось получить данные")
	}
}

// ---------- posters stored on disk ----------

const posterPrefix = "/uploads/poster-"

// localizePoster downloads a remote poster into uploads. Posters matched from
// Kinopoisk/TMDB get a stable name, so re-applying the same film overwrites
// the file instead of piling up copies.
func (s *Server) localizePoster(ctx context.Context, m store.Movie) (string, error) {
	var name string
	switch {
	case m.KPID != 0:
		name = fmt.Sprintf("poster-kp-%d.jpg", m.KPID)
	case m.TMDBID != 0:
		kind := "movie" // tmdb ids overlap between movies and tv
		if m.Kind == "series" {
			kind = "tv"
		}
		name = fmt.Sprintf("poster-tmdb-%s-%d.jpg", kind, m.TMDBID)
	default:
		name = uniqueFilename("poster", ".jpg")
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second) // stay under the server WriteTimeout (30s)
	defer cancel()
	if err := poster.SaveFromURL(ctx, m.Poster, s.UploadsDir, name); err != nil {
		return "", err
	}
	return "/uploads/" + name, nil
}

// removePosterIfUnused deletes a poster file we own once no movie refers to it.
func (s *Server) removePosterIfUnused(url string) {
	if !strings.HasPrefix(url, posterPrefix) {
		return // external link or someone else's upload
	}
	inUse, err := s.Store.PosterInUse(url)
	if err != nil || inUse {
		return
	}
	name := path.Base(url) // base only: never escape the uploads dir
	if err := os.Remove(filepath.Join(s.UploadsDir, name)); err != nil && !os.IsNotExist(err) {
		log.Printf("remove poster %s: %v", name, err)
	}
}
