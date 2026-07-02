package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"cv-semenov/internal/spotify"
	"cv-semenov/internal/store"
)

const (
	spotifyStateTTL     = 10 * time.Minute
	spotifyOAuthCookie  = "spotify_oauth"
	spotifyTopMonthSize = 10
)

// ---------- public ----------

func (s *Server) handleSpotifyNow(w http.ResponseWriter, r *http.Request) {
	np, err := s.Store.GetNowPlaying()
	if err == store.ErrNotFound {
		writeJSON(w, http.StatusOK, store.SpotifyNowPlaying{})
		return
	}
	if err != nil {
		s.serverError(w, "get now playing", err)
		return
	}
	writeJSON(w, http.StatusOK, np)
}

// top tracks/artists for current month, built from history we logged ourselves
func (s *Server) handleSpotifyTop(w http.ResponseWriter, r *http.Request) {
	month := time.Now().UTC().Format("2006-01")
	tracks, err := s.Store.TopTracksForMonth(month, spotifyTopMonthSize)
	if err != nil {
		s.serverError(w, "get top tracks", err)
		return
	}
	artists, err := s.Store.TopArtistsForMonth(month, spotifyTopMonthSize)
	if err != nil {
		s.serverError(w, "get top artists", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"month": month, "tracks": tracks, "artists": artists})
}

// no auth check here on purpose - spotify redirects here from their site
// so our strict cookie won't be sent anyway. state param handles the csrf part
func (s *Server) handleSpotifyCallback(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: spotifyOAuthCookie, Value: "", Path: "/", MaxAge: -1})

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		http.Redirect(w, r, "/admin?spotify=error", http.StatusFound)
		return
	}
	state := r.URL.Query().Get("state")
	if !s.consumeSpotifyState(state) {
		http.Redirect(w, r, "/admin?spotify=error", http.StatusFound)
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, "/admin?spotify=error", http.StatusFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	tok, err := s.Spotify.Exchange(ctx, code)
	if err != nil {
		s.serverError(w, "spotify exchange", err)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.Store.SaveSpotifyTokens(store.SpotifyTokens{
		RefreshToken: tok.RefreshToken,
		AccessToken:  tok.AccessToken,
		ExpiresAt:    spotify.ExpiresAtRFC3339(tok.ExpiresIn),
		ConnectedAt:  now,
	}); err != nil {
		s.serverError(w, "save spotify tokens", err)
		return
	}
	http.Redirect(w, r, "/admin?spotify=ok", http.StatusFound)
}

// ---------- admin ----------

func (s *Server) handleSpotifyStatus(w http.ResponseWriter, r *http.Request) {
	t, err := s.Store.GetSpotifyTokens()
	if err == store.ErrNotFound {
		writeJSON(w, http.StatusOK, map[string]any{"connected": false, "enabled": s.Spotify.Enabled()})
		return
	}
	if err != nil {
		s.serverError(w, "get spotify tokens", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connected":    true,
		"enabled":      s.Spotify.Enabled(),
		"connected_at": t.ConnectedAt,
		"last_poll_at": t.LastPollAt,
		"last_error":   t.LastError,
	})
}

func (s *Server) handleSpotifyConnect(w http.ResponseWriter, r *http.Request) {
	if !s.Spotify.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Spotify не настроен (нет client id/secret)")
		return
	}
	state := s.newSpotifyState()
	http.SetCookie(w, &http.Cookie{
		Name:     spotifyOAuthCookie,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
		MaxAge:   int(spotifyStateTTL.Seconds()),
	})
	http.Redirect(w, r, s.Spotify.AuthURL(state), http.StatusFound)
}

func (s *Server) handleSpotifyDisconnect(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.ClearSpotifyTokens(); err != nil {
		s.serverError(w, "disconnect spotify", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- oauth state ----------

func (s *Server) newSpotifyState() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)
	s.spotifyMu.Lock()
	s.spotifyStates[state] = time.Now().Add(spotifyStateTTL)
	s.spotifyMu.Unlock()
	return state
}

func (s *Server) consumeSpotifyState(state string) bool {
	if state == "" {
		return false
	}
	s.spotifyMu.Lock()
	defer s.spotifyMu.Unlock()
	exp, ok := s.spotifyStates[state]
	if ok {
		delete(s.spotifyStates, state)
	}
	if !ok || time.Now().After(exp) {
		return false
	}
	return true
}
