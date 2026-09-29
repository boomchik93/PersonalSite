// Package moviemeta looks up film metadata on Kinopoisk (through the
// unofficial poiskkino.dev API) and TMDB, so the admin only has to type a
// title and pick the right match instead of filling every field by hand.
package moviemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Source string

const (
	Kinopoisk Source = "kp"
	TMDB      Source = "tmdb"
)

var (
	ErrUnknownSource = errors.New("unknown source")
	ErrNotConfigured = errors.New("source not configured")
)

// UpstreamError is a non-2xx answer from a provider.
type UpstreamError struct {
	Source Source
	Status int
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("%s: HTTP %d", e.Source, e.Status)
}

// Candidate is one search hit, just enough to let the admin pick the right film.
type Candidate struct {
	Source        Source  `json:"source"`
	ID            int64   `json:"id"`
	Kind          string  `json:"kind"` // movie | series
	Title         string  `json:"title"`
	OriginalTitle string  `json:"original_title"`
	Year          string  `json:"year"`
	Thumb         string  `json:"thumb"`
	Rating        float64 `json:"rating"`
}

// Details mirrors the store.Movie fields that can be filled automatically;
// json names match so the admin UI can copy them straight into the form.
type Details struct {
	Title         string  `json:"title"`
	OriginalTitle string  `json:"original_title"`
	Kind          string  `json:"kind"`
	Year          string  `json:"year"`
	Poster        string  `json:"poster"`
	Genres        string  `json:"genres"`
	Director      string  `json:"director"`
	Countries     string  `json:"countries"`
	Description   string  `json:"description"`
	Runtime       int     `json:"runtime"`
	KPID          int64   `json:"kp_id"`
	IMDbID        string  `json:"imdb_id"`
	TMDBID        int64   `json:"tmdb_id"`
	KPRating      float64 `json:"kp_rating"`
	IMDbRating    float64 `json:"imdb_rating"`
}

type Service struct {
	kp    *kinopoisk
	tmdb  *tmdb
	cache *cache
}

// New enables only the providers that have a key.
func New(kpKey, tmdbKey string) *Service {
	s := &Service{cache: newCache(12*time.Hour, 300)}
	httpClient := &http.Client{Timeout: 15 * time.Second}
	if kpKey != "" {
		s.kp = &kinopoisk{key: kpKey, http: httpClient}
	}
	if tmdbKey != "" {
		s.tmdb = &tmdb{key: tmdbKey, http: httpClient}
	}
	return s
}

func (s *Service) Sources() map[Source]bool {
	return map[Source]bool{Kinopoisk: s.kp != nil, TMDB: s.tmdb != nil}
}

// Search returns matches for q; when year is set, hits from that year float up.
func (s *Service) Search(ctx context.Context, src Source, q, year string) ([]Candidate, error) {
	key := fmt.Sprintf("search|%s|%s", src, strings.ToLower(q))
	var res []Candidate
	if v, ok := s.cache.get(key); ok {
		res = v.([]Candidate)
	} else {
		var err error
		switch src {
		case Kinopoisk:
			if s.kp == nil {
				return nil, ErrNotConfigured
			}
			res, err = s.kp.search(ctx, q)
		case TMDB:
			if s.tmdb == nil {
				return nil, ErrNotConfigured
			}
			res, err = s.tmdb.search(ctx, q)
		default:
			return nil, ErrUnknownSource
		}
		if err != nil {
			return nil, err
		}
		s.cache.set(key, res)
	}
	return rankByYear(res, year), nil
}

// Details fetches the full card from src, then fills the gaps (ids, ratings,
// description) from the other provider when it's configured.
func (s *Service) Details(ctx context.Context, src Source, id int64, kind string) (Details, error) {
	key := fmt.Sprintf("details|%s|%d|%s", src, id, kind)
	if v, ok := s.cache.get(key); ok {
		return v.(Details), nil
	}
	var d Details
	var err error
	switch src {
	case Kinopoisk:
		if s.kp == nil {
			return d, ErrNotConfigured
		}
		if d, err = s.kp.details(ctx, id); err != nil {
			return d, err
		}
		if s.tmdb != nil && d.TMDBID != 0 && (d.Poster == "" || d.Description == "") {
			if extra, err := s.tmdb.details(ctx, d.TMDBID, d.Kind); err == nil {
				fillEmpty(&d, extra)
			} else {
				log.Printf("moviemeta: tmdb cross-link for kp %d: %v", id, err)
			}
		}
	case TMDB:
		if s.tmdb == nil {
			return d, ErrNotConfigured
		}
		if d, err = s.tmdb.details(ctx, id, kind); err != nil {
			return d, err
		}
		// TMDB has no Kinopoisk id and no IMDb rating, KP knows both
		if s.kp != nil {
			if extra, ok, err := s.kp.findByExternal(ctx, d.IMDbID, d.TMDBID, d.Kind); err != nil {
				log.Printf("moviemeta: kp cross-link for tmdb %d: %v", id, err)
			} else if ok {
				d.KPID, d.KPRating = extra.KPID, extra.KPRating
				if d.IMDbRating == 0 {
					d.IMDbRating = extra.IMDbRating
				}
				fillEmpty(&d, extra)
			}
		}
	default:
		return d, ErrUnknownSource
	}
	s.cache.set(key, d)
	return d, nil
}

// fillEmpty copies text fields from src into dst only where dst has nothing.
func fillEmpty(dst *Details, src Details) {
	pairs := []struct {
		d *string
		s string
	}{
		{&dst.OriginalTitle, src.OriginalTitle},
		{&dst.Poster, src.Poster},
		{&dst.Genres, src.Genres},
		{&dst.Director, src.Director},
		{&dst.Countries, src.Countries},
		{&dst.Description, src.Description},
		{&dst.IMDbID, src.IMDbID},
	}
	for _, p := range pairs {
		if *p.d == "" {
			*p.d = p.s
		}
	}
	if dst.Runtime == 0 {
		dst.Runtime = src.Runtime
	}
	if dst.TMDBID == 0 {
		dst.TMDBID = src.TMDBID
	}
}

// rankByYear keeps provider relevance order but moves exact-year hits first,
// then ±1 year (release dates differ between countries).
func rankByYear(in []Candidate, year string) []Candidate {
	want, err := strconv.Atoi(strings.TrimSpace(year))
	if err != nil {
		return in
	}
	out := append([]Candidate(nil), in...)
	score := func(c Candidate) int {
		y, err := strconv.Atoi(c.Year)
		switch {
		case err != nil:
			return 3
		case y == want:
			return 0
		case y == want-1 || y == want+1:
			return 1
		}
		return 2
	}
	sort.SliceStable(out, func(i, j int) bool { return score(out[i]) < score(out[j]) })
	return out
}

func getJSON(ctx context.Context, c *http.Client, src Source, req *http.Request, out any) error {
	resp, err := c.Do(req.WithContext(ctx))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &UpstreamError{Source: src, Status: resp.StatusCode}
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// joinFirst joins up to n non-empty, distinct values.
func joinFirst(vals []string, n int) string {
	seen := map[string]bool{}
	var out []string
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
		if len(out) == n {
			break
		}
	}
	return strings.Join(out, ", ")
}

// ---------- tiny TTL cache: saves the daily Kinopoisk quota on repeat lookups ----------

type cacheItem struct {
	v   any
	exp time.Time
}

type cache struct {
	mu    sync.Mutex
	ttl   time.Duration
	max   int
	items map[string]cacheItem
}

func newCache(ttl time.Duration, max int) *cache {
	return &cache{ttl: ttl, max: max, items: make(map[string]cacheItem)}
}

func (c *cache) get(k string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	it, ok := c.items[k]
	if !ok || time.Now().After(it.exp) {
		return nil, false
	}
	return it.v, true
}

func (c *cache) set(k string, v any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.items) >= c.max {
		now := time.Now()
		for key, it := range c.items {
			if now.After(it.exp) {
				delete(c.items, key)
			}
		}
		for key := range c.items { // still full: drop an arbitrary entry
			if len(c.items) < c.max {
				break
			}
			delete(c.items, key)
		}
	}
	c.items[k] = cacheItem{v: v, exp: time.Now().Add(c.ttl)}
}
