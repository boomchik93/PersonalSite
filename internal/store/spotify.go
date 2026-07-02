package store

import (
	"database/sql"
	"errors"
	"time"
)

const spotifySchema = `
CREATE TABLE IF NOT EXISTS spotify_tokens (
	id            INTEGER PRIMARY KEY CHECK (id = 1),
	refresh_token TEXT NOT NULL DEFAULT '',
	access_token  TEXT NOT NULL DEFAULT '',
	expires_at    TEXT NOT NULL DEFAULT '',
	connected_at  TEXT NOT NULL DEFAULT '',
	last_error    TEXT NOT NULL DEFAULT '',
	last_poll_at  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS spotify_now_playing (
	id          INTEGER PRIMARY KEY CHECK (id = 1),
	is_playing  INTEGER NOT NULL DEFAULT 0,
	track_name  TEXT NOT NULL DEFAULT '',
	artist_name TEXT NOT NULL DEFAULT '',
	album_name  TEXT NOT NULL DEFAULT '',
	image_url   TEXT NOT NULL DEFAULT '',
	track_url   TEXT NOT NULL DEFAULT '',
	progress_ms INTEGER NOT NULL DEFAULT 0,
	duration_ms INTEGER NOT NULL DEFAULT 0,
	updated_at  TEXT NOT NULL DEFAULT ''
);

-- Personal listening history: one row per track play, logged by the poller
-- whenever the currently-playing track changes. The monthly top is computed
-- from this table by grouping on (track_name, artist_name) within a month.
CREATE TABLE IF NOT EXISTS spotify_history (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	track_name   TEXT NOT NULL,
	artist_name  TEXT NOT NULL,
	album_name   TEXT NOT NULL DEFAULT '',
	image_url    TEXT NOT NULL DEFAULT '',
	track_url    TEXT NOT NULL DEFAULT '',
	played_month TEXT NOT NULL, -- 'YYYY-MM', UTC
	played_at    TEXT NOT NULL  -- RFC3339, UTC
);
CREATE INDEX IF NOT EXISTS idx_spotify_history_month ON spotify_history(played_month);
`

// ---------- Models ----------

type SpotifyTokens struct {
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	ExpiresAt    string `json:"expires_at"`
	ConnectedAt  string `json:"connected_at"`
	LastError    string `json:"last_error"`
	LastPollAt   string `json:"last_poll_at"`
}

type SpotifyNowPlaying struct {
	IsPlaying  bool   `json:"is_playing"`
	TrackName  string `json:"track_name"`
	ArtistName string `json:"artist_name"`
	AlbumName  string `json:"album_name"`
	ImageURL   string `json:"image_url"`
	TrackURL   string `json:"track_url"`
	ProgressMs int    `json:"progress_ms"`
	DurationMs int    `json:"duration_ms"`
	UpdatedAt  string `json:"updated_at"`
}

// one played track we log
type HistoryPlay struct {
	TrackName  string
	ArtistName string
	AlbumName  string
	ImageURL   string
	TrackURL   string
}

type TopTrack struct {
	TrackName  string `json:"track_name"`
	ArtistName string `json:"artist_name"`
	ImageURL   string `json:"image_url"`
	TrackURL   string `json:"track_url"`
	PlayCount  int    `json:"play_count"`
}

type TopArtist struct {
	ArtistName string `json:"artist_name"`
	ImageURL   string `json:"image_url"`
	PlayCount  int    `json:"play_count"`
}

// ---------- tokens ----------

func (s *Store) GetSpotifyTokens() (SpotifyTokens, error) {
	var t SpotifyTokens
	err := s.db.QueryRow(`SELECT refresh_token,access_token,expires_at,connected_at,last_error,last_poll_at FROM spotify_tokens WHERE id=1`).
		Scan(&t.RefreshToken, &t.AccessToken, &t.ExpiresAt, &t.ConnectedAt, &t.LastError, &t.LastPollAt)
	if errors.Is(err, sql.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

func (s *Store) SaveSpotifyTokens(t SpotifyTokens) error {
	_, err := s.db.Exec(`INSERT INTO spotify_tokens(id,refresh_token,access_token,expires_at,connected_at,last_error,last_poll_at)
		VALUES(1,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET refresh_token=excluded.refresh_token,access_token=excluded.access_token,
			expires_at=excluded.expires_at,connected_at=excluded.connected_at,last_error=excluded.last_error,last_poll_at=excluded.last_poll_at`,
		t.RefreshToken, t.AccessToken, t.ExpiresAt, t.ConnectedAt, t.LastError, t.LastPollAt)
	return err
}

func (s *Store) UpdateSpotifyAccessToken(accessToken, expiresAt string) error {
	_, err := s.db.Exec(`UPDATE spotify_tokens SET access_token=?,expires_at=? WHERE id=1`, accessToken, expiresAt)
	return err
}

// spotify doesn't always send a new refresh token back, only call this when it does
func (s *Store) UpdateSpotifyRefreshToken(refreshToken string) error {
	_, err := s.db.Exec(`UPDATE spotify_tokens SET refresh_token=? WHERE id=1`, refreshToken)
	return err
}

func (s *Store) SetSpotifyError(msg string) error {
	_, err := s.db.Exec(`UPDATE spotify_tokens SET last_error=?,last_poll_at=? WHERE id=1`, msg, nowRFC3339())
	return err
}

func (s *Store) SetSpotifyPolled() error {
	_, err := s.db.Exec(`UPDATE spotify_tokens SET last_error='',last_poll_at=? WHERE id=1`, nowRFC3339())
	return err
}

func (s *Store) ClearSpotifyTokens() error {
	_, err := s.db.Exec(`DELETE FROM spotify_tokens WHERE id=1`)
	if err != nil {
		return err
	}
	return s.SaveNowPlaying(SpotifyNowPlaying{})
}

// ---------- now playing ----------

func (s *Store) GetNowPlaying() (SpotifyNowPlaying, error) {
	var np SpotifyNowPlaying
	err := s.db.QueryRow(`SELECT is_playing,track_name,artist_name,album_name,image_url,track_url,progress_ms,duration_ms,updated_at FROM spotify_now_playing WHERE id=1`).
		Scan(&np.IsPlaying, &np.TrackName, &np.ArtistName, &np.AlbumName, &np.ImageURL, &np.TrackURL, &np.ProgressMs, &np.DurationMs, &np.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return np, ErrNotFound
	}
	return np, err
}

func (s *Store) SaveNowPlaying(np SpotifyNowPlaying) error {
	_, err := s.db.Exec(`INSERT INTO spotify_now_playing(id,is_playing,track_name,artist_name,album_name,image_url,track_url,progress_ms,duration_ms,updated_at)
		VALUES(1,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET is_playing=excluded.is_playing,track_name=excluded.track_name,
			artist_name=excluded.artist_name,album_name=excluded.album_name,image_url=excluded.image_url,
			track_url=excluded.track_url,progress_ms=excluded.progress_ms,duration_ms=excluded.duration_ms,updated_at=excluded.updated_at`,
		np.IsPlaying, np.TrackName, np.ArtistName, np.AlbumName, np.ImageURL, np.TrackURL, np.ProgressMs, np.DurationMs, nowRFC3339())
	return err
}

// ---------- listening history ----------

func (s *Store) RecordPlay(p HistoryPlay) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(`INSERT INTO spotify_history(track_name,artist_name,album_name,image_url,track_url,played_month,played_at) VALUES(?,?,?,?,?,?,?)`,
		p.TrackName, p.ArtistName, p.AlbumName, p.ImageURL, p.TrackURL, now.Format("2006-01"), now.Format(time.RFC3339))
	return err
}

// month format is 'YYYY-MM'
func (s *Store) TopTracksForMonth(month string, limit int) ([]TopTrack, error) {
	rows, err := s.db.Query(`
		SELECT track_name, artist_name,
			(SELECT image_url FROM spotify_history h2 WHERE h2.track_name=h.track_name AND h2.artist_name=h.artist_name AND h2.played_month=? AND h2.image_url<>'' LIMIT 1) AS image_url,
			(SELECT track_url FROM spotify_history h2 WHERE h2.track_name=h.track_name AND h2.artist_name=h.artist_name AND h2.played_month=? AND h2.track_url<>'' LIMIT 1) AS track_url,
			COUNT(*) AS play_count
		FROM spotify_history h
		WHERE played_month=?
		GROUP BY track_name, artist_name
		ORDER BY play_count DESC, MAX(played_at) DESC
		LIMIT ?`, month, month, month, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TopTrack{}
	for rows.Next() {
		var t TopTrack
		var imageURL, trackURL sql.NullString
		if err := rows.Scan(&t.TrackName, &t.ArtistName, &imageURL, &trackURL, &t.PlayCount); err != nil {
			return nil, err
		}
		t.ImageURL = imageURL.String
		t.TrackURL = trackURL.String
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) TopArtistsForMonth(month string, limit int) ([]TopArtist, error) {
	rows, err := s.db.Query(`
		SELECT artist_name,
			(SELECT image_url FROM spotify_history h2 WHERE h2.artist_name=h.artist_name AND h2.played_month=? AND h2.image_url<>'' LIMIT 1) AS image_url,
			COUNT(*) AS play_count
		FROM spotify_history h
		WHERE played_month=?
		GROUP BY artist_name
		ORDER BY play_count DESC, MAX(played_at) DESC
		LIMIT ?`, month, month, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TopArtist{}
	for rows.Next() {
		var a TopArtist
		var imageURL sql.NullString
		if err := rows.Scan(&a.ArtistName, &imageURL, &a.PlayCount); err != nil {
			return nil, err
		}
		a.ImageURL = imageURL.String
		out = append(out, a)
	}
	return out, rows.Err()
}
