package moviemeta

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
)

// tmdb talks to The Movie Database API v3. Accepts either the short v3
// "API key" or the long v4 "read access token" from the TMDB settings page.
type tmdb struct {
	key  string
	http *http.Client

	countriesMu sync.Mutex
	countries   map[string]string // ISO 3166-1 -> russian name
}

var tmdbBase = "https://api.themoviedb.org/3" // var so tests can point it at httptest

const (
	tmdbImg   = "https://image.tmdb.org/t/p/"
	tmdbLang  = "ru-RU"
	thumbSize = "w154"
	fullSize  = "w500"
)

func (t *tmdb) get(ctx context.Context, path string, q url.Values, out any) error {
	if q == nil {
		q = url.Values{}
	}
	q.Set("language", tmdbLang)
	bearer := strings.HasPrefix(t.key, "eyJ") // v4 tokens are JWTs
	if !bearer {
		q.Set("api_key", t.key)
	}
	req, err := http.NewRequest(http.MethodGet, tmdbBase+path+"?"+q.Encode(), nil)
	if err != nil {
		return err
	}
	if bearer {
		req.Header.Set("Authorization", "Bearer "+t.key)
	}
	req.Header.Set("Accept", "application/json")
	return getJSON(ctx, t.http, TMDB, req, out)
}

func img(size, path string) string {
	if path == "" {
		return ""
	}
	return tmdbImg + size + path
}

func year4(date string) string {
	if len(date) >= 4 {
		return date[:4]
	}
	return ""
}

func (t *tmdb) search(ctx context.Context, q string) ([]Candidate, error) {
	var resp struct {
		Results []struct {
			ID            int64   `json:"id"`
			MediaType     string  `json:"media_type"`
			Title         string  `json:"title"`
			Name          string  `json:"name"`
			OriginalTitle string  `json:"original_title"`
			OriginalName  string  `json:"original_name"`
			ReleaseDate   string  `json:"release_date"`
			FirstAirDate  string  `json:"first_air_date"`
			PosterPath    string  `json:"poster_path"`
			VoteAverage   float64 `json:"vote_average"`
		} `json:"results"`
	}
	params := url.Values{"query": {q}, "include_adult": {"false"}}
	if err := t.get(ctx, "/search/multi", params, &resp); err != nil {
		return nil, err
	}
	out := []Candidate{}
	for _, r := range resp.Results {
		c := Candidate{Source: TMDB, ID: r.ID, Thumb: img(thumbSize, r.PosterPath), Rating: round1(r.VoteAverage)}
		switch r.MediaType {
		case "movie":
			c.Kind, c.Title, c.OriginalTitle, c.Year = "movie", r.Title, r.OriginalTitle, year4(r.ReleaseDate)
		case "tv":
			c.Kind, c.Title, c.OriginalTitle, c.Year = "series", r.Name, r.OriginalName, year4(r.FirstAirDate)
		default:
			continue // people etc.
		}
		if c.OriginalTitle == c.Title {
			c.OriginalTitle = ""
		}
		out = append(out, c)
	}
	return out, nil
}

type tmdbDetails struct {
	ID            int64  `json:"id"`
	Title         string `json:"title"`
	Name          string `json:"name"`
	OriginalTitle string `json:"original_title"`
	OriginalName  string `json:"original_name"`
	ReleaseDate   string `json:"release_date"`
	FirstAirDate  string `json:"first_air_date"`
	Overview      string `json:"overview"`
	PosterPath    string `json:"poster_path"`
	Runtime       int    `json:"runtime"`
	EpisodeRun    []int  `json:"episode_run_time"`
	IMDbID        string `json:"imdb_id"`
	Genres        []struct {
		Name string `json:"name"`
	} `json:"genres"`
	ProductionCountries []struct {
		ISO string `json:"iso_3166_1"`
	} `json:"production_countries"`
	OriginCountry []string `json:"origin_country"`
	CreatedBy     []struct {
		Name string `json:"name"`
	} `json:"created_by"`
	Credits struct {
		Crew []struct {
			Name string `json:"name"`
			Job  string `json:"job"`
		} `json:"crew"`
	} `json:"credits"`
	ExternalIDs struct {
		IMDbID string `json:"imdb_id"`
	} `json:"external_ids"`
}

func (t *tmdb) details(ctx context.Context, id int64, kind string) (Details, error) {
	path := "/movie/"
	if kind == "series" {
		path = "/tv/"
	}
	var r tmdbDetails
	params := url.Values{"append_to_response": {"credits,external_ids"}}
	if err := t.get(ctx, path+strconv.FormatInt(id, 10), params, &r); err != nil {
		return Details{}, err
	}

	d := Details{
		Kind:        "movie",
		TMDBID:      r.ID,
		Description: r.Overview,
		Poster:      img(fullSize, r.PosterPath),
		IMDbID:      r.IMDbID,
	}
	if d.IMDbID == "" {
		d.IMDbID = r.ExternalIDs.IMDbID
	}

	var directors, isoCodes []string
	if kind == "series" {
		d.Kind, d.Title, d.OriginalTitle, d.Year = "series", r.Name, r.OriginalName, year4(r.FirstAirDate)
		if len(r.EpisodeRun) > 0 {
			d.Runtime = r.EpisodeRun[0]
		}
		for _, c := range r.CreatedBy {
			directors = append(directors, c.Name)
		}
		isoCodes = r.OriginCountry
	} else {
		d.Title, d.OriginalTitle, d.Year = r.Title, r.OriginalTitle, year4(r.ReleaseDate)
		d.Runtime = r.Runtime
		for _, c := range r.Credits.Crew {
			if c.Job == "Director" {
				directors = append(directors, c.Name)
			}
		}
		for _, c := range r.ProductionCountries {
			isoCodes = append(isoCodes, c.ISO)
		}
	}
	if d.OriginalTitle == d.Title {
		d.OriginalTitle = ""
	}

	var genres []string
	for _, g := range r.Genres {
		genres = append(genres, strings.ToLower(g.Name))
	}
	d.Genres = joinFirst(genres, 4)
	d.Director = joinFirst(directors, 2)
	d.Countries = joinFirst(t.countryNames(ctx, isoCodes), 3)
	return d, nil
}

// countryNames maps ISO codes to russian names. The list is fetched once per
// process (retried next time if it failed); meanwhile ISO codes are returned.
func (t *tmdb) countryNames(ctx context.Context, codes []string) []string {
	t.countriesMu.Lock()
	defer t.countriesMu.Unlock()
	if t.countries == nil && len(codes) > 0 {
		var list []struct {
			ISO    string `json:"iso_3166_1"`
			Native string `json:"native_name"`
		}
		if err := t.get(ctx, "/configuration/countries", nil, &list); err == nil {
			t.countries = make(map[string]string, len(list))
			for _, c := range list {
				t.countries[c.ISO] = c.Native
			}
		}
	}
	out := make([]string, 0, len(codes))
	for _, c := range codes {
		if name := t.countries[c]; name != "" {
			out = append(out, name)
		} else {
			out = append(out, c)
		}
	}
	return out
}
