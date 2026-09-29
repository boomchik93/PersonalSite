package moviemeta

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// kinopoisk talks to poiskkino.dev (formerly kinopoisk.dev). Free tokens are
// issued by @poiskkinodev_bot and have a small daily quota, hence the cache.
type kinopoisk struct {
	key  string
	http *http.Client
}

var kpBase = "https://api.poiskkino.dev" // var so tests can point it at httptest

type kpMovie struct {
	ID               int64  `json:"id"`
	Name             string `json:"name"`
	AlternativeName  string `json:"alternativeName"`
	EnName           string `json:"enName"`
	Type             string `json:"type"`
	IsSeries         bool   `json:"isSeries"`
	Year             int    `json:"year"`
	Description      string `json:"description"`
	ShortDescription string `json:"shortDescription"`
	MovieLength      int    `json:"movieLength"`
	SeriesLength     int    `json:"seriesLength"`
	Poster           struct {
		URL        string `json:"url"`
		PreviewURL string `json:"previewUrl"`
	} `json:"poster"`
	Rating struct {
		KP   float64 `json:"kp"`
		IMDb float64 `json:"imdb"`
	} `json:"rating"`
	Genres    []struct{ Name string } `json:"genres"`
	Countries []struct{ Name string } `json:"countries"`
	Persons   []struct {
		Name         string `json:"name"`
		EnName       string `json:"enName"`
		EnProfession string `json:"enProfession"`
	} `json:"persons"`
	ExternalID struct {
		IMDb string `json:"imdb"`
		TMDB int64  `json:"tmdb"`
	} `json:"externalId"`
}

func (m kpMovie) kind() string {
	switch m.Type {
	case "tv-series", "animated-series", "tv-show":
		return "series"
	}
	if m.IsSeries {
		return "series"
	}
	return "movie"
}

func (m kpMovie) title() string {
	for _, t := range []string{m.Name, m.AlternativeName, m.EnName} {
		if t != "" {
			return t
		}
	}
	return ""
}

func (m kpMovie) originalTitle() string {
	for _, t := range []string{m.AlternativeName, m.EnName} {
		if t != "" && t != m.title() {
			return t
		}
	}
	return ""
}

func yearStr(y int) string {
	if y <= 0 {
		return ""
	}
	return strconv.Itoa(y)
}

func (k *kinopoisk) get(ctx context.Context, path string, q url.Values, out any) error {
	u := kpBase + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-KEY", k.key)
	req.Header.Set("Accept", "application/json")
	return getJSON(ctx, k.http, Kinopoisk, req, out)
}

func (k *kinopoisk) search(ctx context.Context, q string) ([]Candidate, error) {
	var resp struct {
		Docs []kpMovie `json:"docs"`
	}
	params := url.Values{"query": {q}, "page": {"1"}, "limit": {"15"}}
	if err := k.get(ctx, "/v1.5/movie/search", params, &resp); err != nil {
		return nil, err
	}
	out := make([]Candidate, 0, len(resp.Docs))
	for _, m := range resp.Docs {
		thumb := m.Poster.PreviewURL
		if thumb == "" {
			thumb = m.Poster.URL
		}
		out = append(out, Candidate{
			Source:        Kinopoisk,
			ID:            m.ID,
			Kind:          m.kind(),
			Title:         m.title(),
			OriginalTitle: m.originalTitle(),
			Year:          yearStr(m.Year),
			Thumb:         thumb,
			Rating:        m.Rating.KP,
		})
	}
	return out, nil
}

func (k *kinopoisk) details(ctx context.Context, id int64) (Details, error) {
	var m kpMovie
	if err := k.get(ctx, "/v1.5/movie/"+strconv.FormatInt(id, 10), nil, &m); err != nil {
		return Details{}, err
	}
	return m.toDetails(), nil
}

// findByExternal looks a film up by its IMDb id (or TMDB id as a fallback).
func (k *kinopoisk) findByExternal(ctx context.Context, imdbID string, tmdbID int64, kind string) (Details, bool, error) {
	params := url.Values{"limit": {"1"}}
	switch {
	case imdbID != "":
		params.Set("externalId.imdb", imdbID)
	case tmdbID != 0:
		// tmdb ids overlap between movies and tv, so pin the type too
		params.Set("externalId.tmdb", strconv.FormatInt(tmdbID, 10))
		params.Set("isSeries", strconv.FormatBool(kind == "series"))
	default:
		return Details{}, false, nil
	}
	var resp struct {
		Docs []kpMovie `json:"docs"`
	}
	if err := k.get(ctx, "/v1.5/movie", params, &resp); err != nil {
		return Details{}, false, err
	}
	if len(resp.Docs) == 0 {
		return Details{}, false, nil
	}
	return resp.Docs[0].toDetails(), true, nil
}

func (m kpMovie) toDetails() Details {
	var genres, countries, directors []string
	for _, g := range m.Genres {
		genres = append(genres, g.Name)
	}
	for _, c := range m.Countries {
		countries = append(countries, c.Name)
	}
	for _, p := range m.Persons {
		if p.EnProfession == "director" {
			name := p.Name
			if name == "" {
				name = p.EnName
			}
			directors = append(directors, name)
		}
	}
	runtime := m.MovieLength
	if runtime == 0 {
		runtime = m.SeriesLength
	}
	desc := m.Description
	if desc == "" {
		desc = m.ShortDescription
	}
	return Details{
		Title:         m.title(),
		OriginalTitle: m.originalTitle(),
		Kind:          m.kind(),
		Year:          yearStr(m.Year),
		Poster:        m.Poster.URL,
		Genres:        joinFirst(genres, 4),
		Director:      joinFirst(directors, 2),
		Countries:     joinFirst(countries, 3),
		Description:   desc,
		Runtime:       runtime,
		KPID:          m.ID,
		IMDbID:        m.ExternalID.IMDb,
		TMDBID:        m.ExternalID.TMDB,
		KPRating:      round1(m.Rating.KP),
		IMDbRating:    round1(m.Rating.IMDb),
	}
}

func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }
