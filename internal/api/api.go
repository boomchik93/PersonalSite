// http handlers, routes everything to store
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"cv-semenov/internal/auth"
	"cv-semenov/internal/notify"
	"cv-semenov/internal/spotify"
	"cv-semenov/internal/store"
)

type Server struct {
	Store      *store.Store
	Telegram   *notify.Telegram
	Spotify    *spotify.Client
	JWT        *auth.JWT
	AdminPass  string
	UploadsDir string

	spotifyMu     sync.Mutex
	spotifyStates map[string]time.Time // oauth CSRF state -> expiry
}

func New(st *store.Store, tg *notify.Telegram, sp *spotify.Client, jwt *auth.JWT, adminPass, uploadsDir string) *Server {
	return &Server{
		Store:         st,
		Telegram:      tg,
		Spotify:       sp,
		JWT:           jwt,
		AdminPass:     adminPass,
		UploadsDir:    uploadsDir,
		spotifyStates: make(map[string]time.Time),
	}
}

func (s *Server) Routes(mux *http.ServeMux) {
	// Public
	mux.HandleFunc("GET /api/site", s.handleSite)
	mux.HandleFunc("POST /api/contact", s.handleContact)

	// Admin auth
	mux.HandleFunc("POST /api/admin/login", s.handleLogin)
	mux.HandleFunc("POST /api/admin/logout", s.handleLogout)
	mux.HandleFunc("GET /api/admin/me", s.requireAuth(s.handleMe))

	// Admin content
	mux.HandleFunc("PUT /api/admin/profile", s.requireAuth(s.handleUpdateProfile))

	mux.HandleFunc("POST /api/admin/skill-groups", s.requireAuth(s.handleSaveSkillGroup))
	mux.HandleFunc("DELETE /api/admin/skill-groups/{id}", s.requireAuth(s.handleDeleteSkillGroup))
	mux.HandleFunc("POST /api/admin/skills", s.requireAuth(s.handleSaveSkill))
	mux.HandleFunc("DELETE /api/admin/skills/{id}", s.requireAuth(s.handleDeleteSkill))

	mux.HandleFunc("POST /api/admin/projects", s.requireAuth(s.handleSaveProject))
	mux.HandleFunc("DELETE /api/admin/projects/{id}", s.requireAuth(s.handleDeleteProject))

	mux.HandleFunc("POST /api/admin/education", s.requireAuth(s.handleSaveEducation))
	mux.HandleFunc("DELETE /api/admin/education/{id}", s.requireAuth(s.handleDeleteEducation))

	mux.HandleFunc("POST /api/admin/interests", s.requireAuth(s.handleSaveInterest))
	mux.HandleFunc("DELETE /api/admin/interests/{id}", s.requireAuth(s.handleDeleteInterest))

	mux.HandleFunc("GET /api/movies", s.handleListMovies)
	mux.HandleFunc("POST /api/admin/movies", s.requireAuth(s.handleSaveMovie))
	mux.HandleFunc("DELETE /api/admin/movies/{id}", s.requireAuth(s.handleDeleteMovie))

	mux.HandleFunc("GET /api/admin/messages", s.requireAuth(s.handleListMessages))
	mux.HandleFunc("POST /api/admin/messages/{id}/read", s.requireAuth(s.handleReadMessage))
	mux.HandleFunc("DELETE /api/admin/messages/{id}", s.requireAuth(s.handleDeleteMessage))

	mux.HandleFunc("POST /api/admin/upload", s.requireAuth(s.handleUpload))

	// Blog — public
	mux.HandleFunc("GET /api/blog/posts", s.handleListPosts)
	mux.HandleFunc("GET /api/blog/posts/{id}", s.handleGetPost)
	mux.HandleFunc("POST /api/blog/posts/{id}/react", s.handleReactToPost)

	// Blog — admin
	mux.HandleFunc("GET /api/admin/blog/posts", s.requireAuth(s.handleAdminListPosts))
	mux.HandleFunc("POST /api/admin/blog/posts", s.requireAuth(s.handleSavePost))
	mux.HandleFunc("DELETE /api/admin/blog/posts/{id}", s.requireAuth(s.handleDeletePost))
	mux.HandleFunc("POST /api/admin/blog/posts/{id}/photos", s.requireAuth(s.handleUploadPostPhotos))
	mux.HandleFunc("DELETE /api/admin/blog/photos/{id}", s.requireAuth(s.handleDeletePostPhoto))
	mux.HandleFunc("POST /api/admin/blog/posts/{id}/photos/reorder", s.requireAuth(s.handleReorderPhotos))

	// Spotify — public
	mux.HandleFunc("GET /api/spotify/now", s.handleSpotifyNow)
	mux.HandleFunc("GET /api/spotify/top", s.handleSpotifyTop)
	mux.HandleFunc("GET /api/spotify/callback", s.handleSpotifyCallback)

	// Spotify — admin
	mux.HandleFunc("GET /api/admin/spotify/status", s.requireAuth(s.handleSpotifyStatus))
	mux.HandleFunc("GET /api/admin/spotify/connect", s.requireAuth(s.handleSpotifyConnect))
	mux.HandleFunc("POST /api/admin/spotify/disconnect", s.requireAuth(s.handleSpotifyDisconnect))
}

// everything the homepage needs in one json
type sitePayload struct {
	Profile   store.Profile      `json:"profile"`
	Skills    []store.SkillGroup `json:"skills"`
	Projects  []store.Project    `json:"projects"`
	Education []store.Education  `json:"education"`
	Interests []store.Interest   `json:"interests"`
}

func (s *Server) handleSite(w http.ResponseWriter, r *http.Request) {
	profile, err := s.Store.GetProfile()
	if err != nil {
		s.serverError(w, "profile", err)
		return
	}
	skills, err := s.Store.SkillGroups()
	if err != nil {
		s.serverError(w, "skills", err)
		return
	}
	projects, err := s.Store.Projects()
	if err != nil {
		s.serverError(w, "projects", err)
		return
	}
	education, err := s.Store.Education()
	if err != nil {
		s.serverError(w, "education", err)
		return
	}
	interests, err := s.Store.Interests()
	if err != nil {
		s.serverError(w, "interests", err)
		return
	}
	writeJSON(w, http.StatusOK, sitePayload{
		Profile:   profile,
		Skills:    skills,
		Projects:  projects,
		Education: education,
		Interests: interests,
	})
}

// handleListMovies returns the whole library; filtering is done client-side.
func (s *Server) handleListMovies(w http.ResponseWriter, r *http.Request) {
	movies, err := s.Store.Movies()
	if err != nil {
		s.serverError(w, "movies", err)
		return
	}
	writeJSON(w, http.StatusOK, movies)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("encode response: %v", err)
		}
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) serverError(w http.ResponseWriter, where string, err error) {
	log.Printf("error (%s): %v", where, err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}

func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

func pathID(r *http.Request) (int64, error) {
	return strconv.ParseInt(r.PathValue("id"), 10, 64)
}

func trim(s string) string { return strings.TrimSpace(s) }
