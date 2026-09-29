package moviemeta

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRankByYear(t *testing.T) {
	in := []Candidate{{ID: 1, Year: "1984"}, {ID: 2, Year: ""}, {ID: 3, Year: "2020"}, {ID: 4, Year: "2021"}, {ID: 5, Year: "2021"}}
	got := rankByYear(in, "2021")
	want := []int64{4, 5, 3, 1, 2}
	for i, c := range got {
		if c.ID != want[i] {
			t.Fatalf("order = %v, want %v", ids(got), want)
		}
	}
	if in[0].ID != 1 {
		t.Fatal("input slice was reordered in place")
	}
	if r := rankByYear(in, ""); r[0].ID != 1 {
		t.Fatal("no year should keep provider order")
	}
}

func ids(cs []Candidate) []int64 {
	var out []int64
	for _, c := range cs {
		out = append(out, c.ID)
	}
	return out
}

func TestKinopoiskToDetails(t *testing.T) {
	raw := `{"id":409424,"name":"Дюна","alternativeName":"Dune","type":"movie","isSeries":false,"year":2021,
		"description":"Наследник знаменитого дома...","movieLength":155,
		"poster":{"url":"https://img/orig.jpg","previewUrl":"https://img/preview.jpg"},
		"rating":{"kp":7.844,"imdb":8.0},
		"genres":[{"name":"фантастика"},{"name":"боевик"}],
		"countries":[{"name":"США"},{"name":"Канада"}],
		"persons":[{"name":"Тимоти Шаламе","enProfession":"actor"},{"name":"Дени Вильнёв","enProfession":"director"}],
		"externalId":{"imdb":"tt1160419","tmdb":438631}}`
	var m kpMovie
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatal(err)
	}
	d := m.toDetails()
	want := Details{
		Title: "Дюна", OriginalTitle: "Dune", Kind: "movie", Year: "2021", Poster: "https://img/orig.jpg",
		Genres: "фантастика, боевик", Director: "Дени Вильнёв", Countries: "США, Канада",
		Description: "Наследник знаменитого дома...", Runtime: 155,
		KPID: 409424, IMDbID: "tt1160419", TMDBID: 438631, KPRating: 7.8, IMDbRating: 8.0,
	}
	if d != want {
		t.Fatalf("got  %+v\nwant %+v", d, want)
	}
}

func TestKinopoiskSeriesKind(t *testing.T) {
	for _, m := range []kpMovie{{Type: "tv-series"}, {Type: "anime", IsSeries: true}, {Type: "animated-series"}} {
		if m.kind() != "series" {
			t.Errorf("%+v: kind = %s, want series", m.Type, m.kind())
		}
	}
	if (kpMovie{Type: "cartoon"}).kind() != "movie" {
		t.Error("cartoon should be a movie")
	}
}

func TestFillEmptyKeepsExisting(t *testing.T) {
	d := Details{Description: "своё", Runtime: 0}
	fillEmpty(&d, Details{Description: "чужое", Poster: "p", Runtime: 120, TMDBID: 7})
	if d.Description != "своё" || d.Poster != "p" || d.Runtime != 120 || d.TMDBID != 7 {
		t.Fatalf("unexpected merge: %+v", d)
	}
}

// TMDB match gets its Kinopoisk id and ratings filled in through the IMDb id.
func TestDetailsTMDBCrossLinksKinopoisk(t *testing.T) {
	var kpCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/3/movie/438631":
			if r.URL.Query().Get("api_key") != "tmdb-key" || r.URL.Query().Get("language") != "ru-RU" {
				t.Errorf("bad tmdb query: %s", r.URL.RawQuery)
			}
			fmt.Fprint(w, `{"id":438631,"title":"Дюна","original_title":"Dune","release_date":"2021-09-15",
				"overview":"","poster_path":"/p.jpg","runtime":155,"imdb_id":"tt1160419",
				"genres":[{"name":"Фантастика"}],"production_countries":[{"iso_3166_1":"US"}],
				"credits":{"crew":[{"name":"Denis Villeneuve","job":"Director"},{"name":"X","job":"Writer"}]}}`)
		case r.URL.Path == "/3/configuration/countries":
			fmt.Fprint(w, `[{"iso_3166_1":"US","english_name":"United States","native_name":"США"}]`)
		case r.URL.Path == "/v1.5/movie":
			kpCalls++
			if r.Header.Get("X-API-KEY") != "kp-key" || r.URL.Query().Get("externalId.imdb") != "tt1160419" {
				t.Errorf("bad kp request: %v %s", r.Header, r.URL.RawQuery)
			}
			fmt.Fprint(w, `{"docs":[{"id":409424,"name":"Дюна","description":"Описание с КП","rating":{"kp":7.8,"imdb":8.0}}]}`)
		default:
			t.Errorf("unexpected request %s", r.URL)
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	oldKP, oldTMDB := kpBase, tmdbBase
	kpBase, tmdbBase = srv.URL, srv.URL+"/3"
	defer func() { kpBase, tmdbBase = oldKP, oldTMDB }()

	s := New("kp-key", "tmdb-key")
	d, err := s.Details(context.Background(), TMDB, 438631, "movie")
	if err != nil {
		t.Fatal(err)
	}
	if d.KPID != 409424 || d.KPRating != 7.8 || d.IMDbRating != 8.0 || d.Description != "Описание с КП" {
		t.Fatalf("cross-link not applied: %+v", d)
	}
	if d.Director != "Denis Villeneuve" || d.Countries != "США" || d.Genres != "фантастика" || d.Poster != tmdbImg+fullSize+"/p.jpg" {
		t.Fatalf("tmdb mapping wrong: %+v", d)
	}
	if _, err := s.Details(context.Background(), TMDB, 438631, "movie"); err != nil || kpCalls != 1 {
		t.Fatalf("second call should hit the cache (kp calls = %d, err = %v)", kpCalls, err)
	}
}

func TestUpstreamErrorAndNotConfigured(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()
	old := kpBase
	kpBase = srv.URL
	defer func() { kpBase = old }()

	s := New("kp-key", "")
	_, err := s.Search(context.Background(), Kinopoisk, "дюна", "")
	var up *UpstreamError
	if !errors.As(err, &up) || up.Status != http.StatusForbidden {
		t.Fatalf("want UpstreamError 403, got %v", err)
	}
	if _, err := s.Search(context.Background(), TMDB, "дюна", ""); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}
