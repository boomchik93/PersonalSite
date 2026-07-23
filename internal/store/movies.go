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
	created_at  TEXT NOT NULL DEFAULT ''
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
}

// Movies returns every entry, newest first (by created_at, then id).
func (s *Store) Movies() ([]Movie, error) {
	rows, err := s.db.Query(`SELECT id,title,kind,year,rating,review,poster,genres,status,director,watched_at,favorite,pos,created_at
		FROM movies ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Movie{}
	for rows.Next() {
		var m Movie
		if err := rows.Scan(&m.ID, &m.Title, &m.Kind, &m.Year, &m.Rating, &m.Review, &m.Poster,
			&m.Genres, &m.Status, &m.Director, &m.WatchedAt, &m.Favorite, &m.Pos, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) GetMovie(id int64) (Movie, error) {
	var m Movie
	err := s.db.QueryRow(`SELECT id,title,kind,year,rating,review,poster,genres,status,director,watched_at,favorite,pos,created_at
		FROM movies WHERE id=?`, id).
		Scan(&m.ID, &m.Title, &m.Kind, &m.Year, &m.Rating, &m.Review, &m.Poster,
			&m.Genres, &m.Status, &m.Director, &m.WatchedAt, &m.Favorite, &m.Pos, &m.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// UpsertMovie inserts when ID==0, otherwise updates in place.
func (s *Store) UpsertMovie(m Movie) (int64, error) {
	if m.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO movies
			(title,kind,year,rating,review,poster,genres,status,director,watched_at,favorite,pos,created_at)
			VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			m.Title, m.Kind, m.Year, m.Rating, m.Review, m.Poster, m.Genres, m.Status,
			m.Director, m.WatchedAt, m.Favorite, m.Pos, nowRFC3339())
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.Exec(`UPDATE movies SET title=?,kind=?,year=?,rating=?,review=?,poster=?,genres=?,status=?,director=?,watched_at=?,favorite=?,pos=? WHERE id=?`,
		m.Title, m.Kind, m.Year, m.Rating, m.Review, m.Poster, m.Genres, m.Status,
		m.Director, m.WatchedAt, m.Favorite, m.Pos, m.ID)
	return m.ID, err
}

func (s *Store) DeleteMovie(id int64) error { return s.deleteByID("movies", id) }
