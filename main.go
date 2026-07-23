package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/base64"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"cv-semenov/internal/api"
	"cv-semenov/internal/auth"
	"cv-semenov/internal/crypto"
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

	box, err := crypto.NewBox(cfg.encryptionKey)
	if err != nil {
		log.Fatalf("encryption key: %v", err)
	}

	st, err := store.Open(cfg.dbPath, box)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	tg := notify.NewTelegram(cfg.tgToken, cfg.tgChat)
	sc := spotify.New(cfg.spotifyClientID, cfg.spotifyClientSecret, cfg.spotifyRedirectURI)
	jwt := auth.New(cfg.jwtSecret)
	srv := api.New(st, tg, sc, jwt, cfg.adminPass, cfg.uploadsDir)

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

	// /cv serves the resume page on the main domain
	mux.HandleFunc("GET /cv", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "cv.html")
	})
	mux.HandleFunc("GET /cv/", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "cv.html")
	})

	// /films — watched movies & series library
	mux.HandleFunc("GET /films", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "films.html")
	})
	mux.HandleFunc("GET /films/", func(w http.ResponseWriter, r *http.Request) {
		serveFile(w, r, sub, "films.html")
	})

	// on the cv.* subdomain the root path shows the resume instead of the main site
	mux.Handle("GET /", cvSubdomain(sub, fileServer))
}

// if the host starts with "cv." (cv.semenovm.ru) show the resume at "/".
// everything else just goes to the normal file server
func cvSubdomain(fsys fs.FS, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if i := strings.IndexByte(host, ':'); i >= 0 {
			host = host[:i] // strip port
		}
		if r.URL.Path == "/" && strings.HasPrefix(host, "cv.") {
			serveFile(w, r, fsys, "cv.html")
			return
		}
		next.ServeHTTP(w, r)
	})
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
	port          string
	dbPath        string
	uploadsDir    string
	adminPass     string
	tgToken       string
	tgChat        string
	jwtSecret     []byte
	encryptionKey string

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
	c.jwtSecret = loadJWTSecret()
	c.encryptionKey = loadEncryptionKey()
	return c
}

// set JWT_SECRET in prod so logins survive a restart. locally it's fine to
// just make a random one, it only means you get logged out on restart
func loadJWTSecret() []byte {
	if v := os.Getenv("JWT_SECRET"); v != "" {
		secret, err := base64.StdEncoding.DecodeString(v)
		if err != nil || len(secret) < 32 {
			log.Fatalf("JWT_SECRET must be a base64-encoded value of at least 32 bytes")
		}
		return secret
	}
	log.Printf("WARNING: JWT_SECRET not set — generating a random secret, admin sessions won't survive a restart")
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		log.Fatalf("generate random jwt secret: %v", err)
	}
	return secret
}

// ENCRYPTION_KEY has to stay the same every boot - it's what decrypts the spotify
// tokens and my contact info in the db. can't randomize it like the jwt secret or
// all the old encrypted rows become garbage. prints a fresh one on first run so setup is easy
func loadEncryptionKey() string {
	if v := os.Getenv("ENCRYPTION_KEY"); v != "" {
		return v
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatalf("generate encryption key: %v", err)
	}
	encoded := base64.StdEncoding.EncodeToString(key)
	log.Fatalf("ENCRYPTION_KEY is not set. Add this to your environment and restart:\n\nENCRYPTION_KEY=%s\n\nKeep it secret and back it up — losing it makes encrypted data unrecoverable.", encoded)
	return ""
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
