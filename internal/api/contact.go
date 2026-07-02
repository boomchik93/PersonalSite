package api

import (
	"fmt"
	"html"
	"net/http"
	"strings"

	"cv-semenov/internal/store"
)

type contactRequest struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Message string `json:"message"`
}

func (s *Server) handleContact(w http.ResponseWriter, r *http.Request) {
	var req contactRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "некорректный запрос")
		return
	}
	req.Name = trim(req.Name)
	req.Email = trim(req.Email)
	req.Message = trim(req.Message)

	if req.Name == "" || req.Message == "" {
		writeError(w, http.StatusUnprocessableEntity, "укажите имя и сообщение")
		return
	}
	if len(req.Name) > 120 || len(req.Email) > 160 || len(req.Message) > 4000 {
		writeError(w, http.StatusUnprocessableEntity, "слишком длинное поле")
		return
	}
	if req.Email != "" && !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusUnprocessableEntity, "некорректный email")
		return
	}

	id, err := s.Store.CreateMessage(store.Message{
		Name:  req.Name,
		Email: req.Email,
		Body:  req.Message,
	})
	if err != nil {
		s.serverError(w, "create message", err)
		return
	}

	s.Telegram.Send(fmt.Sprintf(
		"<b>📨 Новое сообщение с сайта</b>\n\n<b>Имя:</b> %s\n<b>Email:</b> %s\n\n%s",
		html.EscapeString(req.Name),
		html.EscapeString(orDash(req.Email)),
		html.EscapeString(req.Message),
	))

	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "id": id})
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
