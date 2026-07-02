package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"time"

	"cv-semenov/internal/store"
)

const sessionCookie = "cv_admin"
const sessionTTL = 12 * time.Hour

// ---------- auth ----------

func (s *Server) newSession() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	token := hex.EncodeToString(b)
	s.mu.Lock()
	s.sessions[token] = time.Now().Add(sessionTTL)
	s.mu.Unlock()
	return token
}

func (s *Server) validSession(token string) bool {
	if token == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.sessions[token]
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		delete(s.sessions, token)
		return false
	}
	return true
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil || !s.validSession(c.Value) {
			writeError(w, http.StatusUnauthorized, "требуется вход")
			return
		}
		next(w, r)
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	// use ConstantTimeCompare so we don't leak password length/timing
	if subtle.ConstantTimeCompare([]byte(req.Password), []byte(s.AdminPass)) != 1 {
		writeError(w, http.StatusUnauthorized, "неверный пароль")
		return
	}
	token := s.newSession()
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
		MaxAge:   int(sessionTTL.Seconds()),
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		s.mu.Lock()
		delete(s.sessions, c.Value)
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"authenticated": true})
}

// ---------- profile ----------

func (s *Server) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var p store.Profile
	if err := decodeJSON(r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	if err := s.Store.UpdateProfile(p); err != nil {
		s.serverError(w, "update profile", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- skill groups & skills ----------

func (s *Server) handleSaveSkillGroup(w http.ResponseWriter, r *http.Request) {
	var g store.SkillGroup
	if err := decodeJSON(r, &g); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	if g.ID == 0 {
		id, err := s.Store.CreateSkillGroup(g.Title, g.Pos)
		if err != nil {
			s.serverError(w, "create skill group", err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
		return
	}
	if err := s.Store.UpdateSkillGroup(g.ID, g.Title, g.Pos); err != nil {
		s.serverError(w, "update skill group", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteSkillGroup(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteSkillGroup(id); err != nil {
		s.serverError(w, "delete skill group", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleCreateSkill(w http.ResponseWriter, r *http.Request) {
	var sk store.Skill
	if err := decodeJSON(r, &sk); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	id, err := s.Store.CreateSkill(sk)
	if err != nil {
		s.serverError(w, "create skill", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (s *Server) handleDeleteSkill(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteSkill(id); err != nil {
		s.serverError(w, "delete skill", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- projects ----------

func (s *Server) handleSaveProject(w http.ResponseWriter, r *http.Request) {
	var p store.Project
	if err := decodeJSON(r, &p); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	id, err := s.Store.UpsertProject(p)
	if err != nil {
		s.serverError(w, "save project", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"id": id})
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteProject(id); err != nil {
		s.serverError(w, "delete project", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- education ----------

func (s *Server) handleSaveEducation(w http.ResponseWriter, r *http.Request) {
	var e store.Education
	if err := decodeJSON(r, &e); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	id, err := s.Store.UpsertEducation(e)
	if err != nil {
		s.serverError(w, "save education", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"id": id})
}

func (s *Server) handleDeleteEducation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteEducation(id); err != nil {
		s.serverError(w, "delete education", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- interests ----------

func (s *Server) handleSaveInterest(w http.ResponseWriter, r *http.Request) {
	var it store.Interest
	if err := decodeJSON(r, &it); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	id, err := s.Store.UpsertInterest(it)
	if err != nil {
		s.serverError(w, "save interest", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"id": id})
}

func (s *Server) handleDeleteInterest(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteInterest(id); err != nil {
		s.serverError(w, "delete interest", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------- messages ----------

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	msgs, err := s.Store.Messages()
	if err != nil {
		s.serverError(w, "list messages", err)
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

func (s *Server) handleReadMessage(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.MarkMessageRead(id); err != nil {
		s.serverError(w, "read message", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "некорректный id")
		return
	}
	if err := s.Store.DeleteMessage(id); err != nil {
		s.serverError(w, "delete message", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
