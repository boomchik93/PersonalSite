package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"cv-semenov/internal/api"
	"cv-semenov/internal/notify"
	"cv-semenov/internal/spotify"
	"cv-semenov/internal/store"
)

//go:embed all:web
var webFS embed.FS

func main() {
	cfg := loadConfig()

	if err := os.MkdirAll(filepath.Dir(cfg.dbPath), 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	if err := os.MkdirAll(cfg.uploadsDir, 0o755); err != nil {
		log.Fatalf("create uploads dir: %v", err)
	}

	st, err := store.Open(cfg.dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	tg := notify.NewTelegram(cfg.tgToken, cfg.tgChat)
	sc := spotify.New(cfg.spotifyClientID, cfg.spotifyClientSecret, cfg.spotifyRedirectURI)
	srv := api.New(st, tg, sc, cfg.adminPass, cfg.uploadsDir)

	mux := http.NewServeMux()
	srv.Routes(mux)
	mountStatic(mux, cfg.uploadsDir)

	pollerCtx, cancelPoller := context.WithCancel(context.Background())
	go runSpotifyPoller(pollerCtx, st, sc)

	httpServer := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("CV site listening on http://localhost:%s  (admin: /admin)", cfg.port)
		if tg.Enabled() {
			log.Printf("telegram notifications: enabled")
		} else {
			log.Printf("telegram notifications: disabled (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)")
		}
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down…")
	cancelPoller()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

// frontend is embedded in the binary, uploads are not (they change at runtime)
func mountStatic(mux *http.ServeMux, uploadsDir string) {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatalf("embed sub: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))

	// uploads folder on disk, not cached cause files can change
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/",
		noCacheControl(http.FileServer(http.Dir(uploadsDir)))))

	// so /admin works without .html in url
	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "admin.html")
	})
	mux.HandleFunc("GET /admin/", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "admin.html")
	})

	mux.Handle("GET /", fileServer)
}

func serveFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) {
	data, err := fs.ReadFile(fsys, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}

func noCacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		next.ServeHTTP(w, r)
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

type config struct {
	port       string
	dbPath     string
	uploadsDir string
	adminPass  string
	tgToken    string
	tgChat     string

	spotifyClientID     string
	spotifyClientSecret string
	spotifyRedirectURI  string
}

func loadConfig() config {
	c := config{
		port:       env("PORT", "8080"),
		dbPath:     env("DB_PATH", "data/cv.db"),
		uploadsDir: env("UPLOADS_DIR", "data/uploads"),
		adminPass:  env("ADMIN_PASSWORD", "admin"),
		tgToken:    env("TELEGRAM_BOT_TOKEN", ""),
		tgChat:     env("TELEGRAM_CHAT_ID", ""),

		spotifyClientID:     env("SPOTIFY_CLIENT_ID", ""),
		spotifyClientSecret: env("SPOTIFY_CLIENT_SECRET", ""),
		spotifyRedirectURI:  env("SPOTIFY_REDIRECT_URI", ""),
	}
	if c.adminPass == "admin" {
		log.Printf("WARNING: ADMIN_PASSWORD is the default 'admin' — set a strong password via env")
	}
	return c
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
