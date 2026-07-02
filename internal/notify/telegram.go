// sends contact form messages to my telegram
package notify

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// no token/chat id = just disabled, no error
type Telegram struct {
	Token  string
	ChatID string
	client *http.Client
}

func NewTelegram(token, chatID string) *Telegram {
	return &Telegram{
		Token:  strings.TrimSpace(token),
		ChatID: strings.TrimSpace(chatID),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (t *Telegram) Enabled() bool { return t.Token != "" && t.ChatID != "" }

// runs in goroutine so it doesn't slow down the request, errors just get logged
func (t *Telegram) Send(text string) {
	if !t.Enabled() {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		api := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.Token)
		form := url.Values{}
		form.Set("chat_id", t.ChatID)
		form.Set("text", text)
		form.Set("parse_mode", "HTML")
		form.Set("disable_web_page_preview", "true")

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, api, strings.NewReader(form.Encode()))
		if err != nil {
			log.Printf("telegram: build request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		resp, err := t.client.Do(req)
		if err != nil {
			log.Printf("telegram: send: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			log.Printf("telegram: unexpected status %s", resp.Status)
		}
	}()
}
