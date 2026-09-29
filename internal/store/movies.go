package store

import (
	"database/sql"
	"errors"
)

const movieSchema = `
CREATE TABLE IF NOT EXISTS movies (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	title       TEXT NOT NULL,
	kind        TEXT NOT NULL DEFAULT 'movie',   -- movie | series
	year        TEXT NOT NULL DEFAULT '',
	rating      INTEGER NOT NULL DEFAULT 0,       -- 0..10 (0 = not rated)
	review      TEXT NOT NULL DEFAULT '',
	poster      TEXT NOT NULL DEFAULT '',         -- image URL
	genres      TEXT NOT NULL DEFAULT '',         -- comma-separated
	status      TEXT NOT NULL DEFAULT 'watched',  -- watched | dropped | planned
	director    TEXT NOT NULL DEFAULT '',
	watched_at  TEXT NOT NULL DEFAULT '',
	favorite    INTEGER NOT NULL DEFAULT 0,
	pos         INTEGER NOT NULL DEFAULT 0,
	created_at  TEXT NOT NULL DEFAULT '',
	original_title TEXT NOT NULL DEFAULT '',
	description    TEXT NOT NULL DEFAULT '',
	countries      TEXT NOT NULL DEFAULT '',        -- comma-separated
	runtime        INTEGER NOT NULL DEFAULT 0,       -- minutes (per episode for series), 0 = unknown
	kp_id          INTEGER NOT NULL DEFAULT 0,
	imdb_id        TEXT NOT NULL DEFAULT '',         -- tt1234567
	tmdb_id        INTEGER NOT NULL DEFAULT 0,
	kp_rating      REAL NOT NULL DEFAULT 0,
	imdb_rating    REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_movies_kind ON movies(kind);
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
`

type Movie struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Kind      string `json:"kind"`
	Year      string `json:"year"`
	Rating    int    `json:"rating"`
	Review    string `json:"review"`
	Poster    string `json:"poster"`
	Genres    string `json:"genres"`
	Status    string `json:"status"`
	Director  string `json:"director"`
	WatchedAt string `json:"watched_at"`
	Favorite  bool   `json:"favorite"`
	Pos       int    `json:"pos"`
	CreatedAt string `json:"created_at"`

	// filled from Kinopoisk / TMDB lookup
	OriginalTitle string  `json:"original_title"`
	Description   string  `json:"description"`
	Countries     string  `json:"countries"`
	Runtime       int     `json:"runtime"`
	KPID          int64   `json:"kp_id"`
	IMDbID        string  `json:"imdb_id"`
	TMDBID        int64   `json:"tmdb_id"`
	KPRating      float64 `json:"kp_rating"`
	IMDbRating    float64 `json:"imdb_rating"`
}

const movieCols = `id,title,kind,year,rating,review,poster,genres,status,director,watched_at,favorite,pos,created_at,
	original_title,description,countries,runtime,kp_id,imdb_id,tmdb_id,kp_rating,imdb_rating`

func scanMovie(sc interface{ Scan(...any) error }) (Movie, error) {
	var m Movie
	err := sc.Scan(&m.ID, &m.Title, &m.Kind, &m.Year, &m.Rating, &m.Review, &m.Poster,
		&m.Genres, &m.Status, &m.Director, &m.WatchedAt, &m.Favorite, &m.Pos, &m.CreatedAt,
		&m.OriginalTitle, &m.Description, &m.Countries, &m.Runtime, &m.KPID, &m.IMDbID, &m.TMDBID,
		&m.KPRating, &m.IMDbRating)
	return m, err
}

// Movies returns every entry, newest first (by created_at, then id).
func (s *Store) Movies() ([]Movie, error) {
	rows, err := s.db.Query(`SELECT ` + movieCols + ` FROM movies ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Movie{}
	for rows.Next() {
		m, err := scanMovie(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) GetMovie(id int64) (Movie, error) {
	m, err := scanMovie(s.db.QueryRow(`SELECT `+movieCols+` FROM movies WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// UpsertMovie inserts when ID==0, otherwise updates in place.
func (s *Store) UpsertMovie(m Movie) (int64, error) {
	if m.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO movies
			(title,kind,year,rating,review,poster,genres,status,director,watched_at,favorite,pos,created_at,
			 original_title,description,countries,runtime,kp_id,imdb_id,tmdb_id,kp_rating,imdb_rating)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			m.Title, m.Kind, m.Year, m.Rating, m.Review, m.Poster, m.Genres, m.Status,
			m.Director, m.WatchedAt, m.Favorite, m.Pos, nowRFC3339(),
			m.OriginalTitle, m.Description, m.Countries, m.Runtime, m.KPID, m.IMDbID, m.TMDBID, m.KPRating, m.IMDbRating)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.Exec(`UPDATE movies SET title=?,kind=?,year=?,rating=?,review=?,poster=?,genres=?,status=?,director=?,watched_at=?,favorite=?,pos=?,
		original_title=?,description=?,countries=?,runtime=?,kp_id=?,imdb_id=?,tmdb_id=?,kp_rating=?,imdb_rating=? WHERE id=?`,
		m.Title, m.Kind, m.Year, m.Rating, m.Review, m.Poster, m.Genres, m.Status,
		m.Director, m.WatchedAt, m.Favorite, m.Pos,
		m.OriginalTitle, m.Description, m.Countries, m.Runtime, m.KPID, m.IMDbID, m.TMDBID, m.KPRating, m.IMDbRating, m.ID)
	return m.ID, err
}

func (s *Store) DeleteMovie(id int64) error { return s.deleteByID("movies", id) }

// PosterInUse reports whether any movie still points at this poster url,
// so a shared downloaded file isn't deleted from under another entry.
func (s *Store) PosterInUse(url string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM movies WHERE poster=?`, url).Scan(&n)
	return n > 0, err
}
