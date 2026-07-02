package store

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

const blogSchema = `
CREATE TABLE IF NOT EXISTS posts (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	title      TEXT NOT NULL,
	body       TEXT NOT NULL,
	published  INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_photos (
	id      INTEGER PRIMARY KEY AUTOINCREMENT,
	post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	url     TEXT NOT NULL,
	pos     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_reactions (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	emoji      TEXT NOT NULL,
	ip_hash    TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE(post_id, emoji, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_post_photos_post ON post_photos(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);

CREATE TABLE IF NOT EXISTS app_meta (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
`

// ---------- Models ----------

type Post struct {
	ID        int64           `json:"id"`
	Title     string          `json:"title"`
	Body      string          `json:"body"`
	Published bool            `json:"published"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
	Photos    []PostPhoto     `json:"photos"`
	Reactions []ReactionCount `json:"reactions"`
}

type PostPhoto struct {
	ID     int64  `json:"id"`
	PostID int64  `json:"post_id"`
	URL    string `json:"url"`
	Pos    int    `json:"pos"`
}

type ReactionCount struct {
	Emoji   string `json:"emoji"`
	Count   int    `json:"count"`
	Reacted bool   `json:"reacted"`
}

// emojis people can react with, like telegram
var AllowedEmoji = []string{"👍", "❤️", "🔥", "😂", "😮", "😢", "👎", "💩", "🤡", "😡"}

// ---------- posts ----------

func (s *Store) ListPosts(publishedOnly bool, ipHash string, limit, offset int) ([]Post, error) {
	q := `SELECT id,title,body,published,created_at,updated_at FROM posts`
	args := []any{}
	if publishedOnly {
		q += ` WHERE published=1`
	}
	q += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := []Post{}
	for rows.Next() {
		var p Post
		if err := rows.Scan(&p.ID, &p.Title, &p.Body, &p.Published, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range posts {
		photos, err := s.photosForPost(posts[i].ID)
		if err != nil {
			return nil, err
		}
		posts[i].Photos = photos
		reactions, err := s.reactionCounts(posts[i].ID, ipHash)
		if err != nil {
			return nil, err
		}
		posts[i].Reactions = reactions
	}
	return posts, nil
}

func (s *Store) CountPosts(publishedOnly bool) (int, error) {
	q := `SELECT COUNT(*) FROM posts`
	if publishedOnly {
		q += ` WHERE published=1`
	}
	var n int
	err := s.db.QueryRow(q).Scan(&n)
	return n, err
}

func (s *Store) GetPost(id int64, ipHash string) (Post, error) {
	var p Post
	err := s.db.QueryRow(`SELECT id,title,body,published,created_at,updated_at FROM posts WHERE id=?`, id).
		Scan(&p.ID, &p.Title, &p.Body, &p.Published, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	if err != nil {
		return p, err
	}
	photos, err := s.photosForPost(p.ID)
	if err != nil {
		return p, err
	}
	p.Photos = photos
	reactions, err := s.reactionCounts(p.ID, ipHash)
	if err != nil {
		return p, err
	}
	p.Reactions = reactions
	return p, nil
}

func (s *Store) CreatePost(p Post) (int64, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`INSERT INTO posts(title,body,published,created_at,updated_at) VALUES(?,?,?,?,?)`,
		p.Title, p.Body, p.Published, now, now)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) UpdatePost(p Post) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`UPDATE posts SET title=?,body=?,published=?,updated_at=? WHERE id=?`,
		p.Title, p.Body, p.Published, now, p.ID)
	return err
}

func (s *Store) DeletePost(id int64) error { return s.deleteByID("posts", id) }

// ---------- post photos ----------

func (s *Store) photosForPost(postID int64) ([]PostPhoto, error) {
	rows, err := s.db.Query(`SELECT id,post_id,url,pos FROM post_photos WHERE post_id=? ORDER BY pos,id`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PostPhoto{}
	for rows.Next() {
		var ph PostPhoto
		if err := rows.Scan(&ph.ID, &ph.PostID, &ph.URL, &ph.Pos); err != nil {
			return nil, err
		}
		out = append(out, ph)
	}
	return out, rows.Err()
}

func (s *Store) AddPostPhoto(postID int64, url string, pos int) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO post_photos(post_id,url,pos) VALUES(?,?,?)`, postID, url, pos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// returns url too so caller can delete the actual file
func (s *Store) DeletePostPhoto(id int64) (string, error) {
	var url string
	err := s.db.QueryRow(`SELECT url FROM post_photos WHERE id=?`, id).Scan(&url)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if _, err := s.db.Exec(`DELETE FROM post_photos WHERE id=?`, id); err != nil {
		return "", err
	}
	return url, nil
}

// used when deleting a whole post, need urls to clean up files
func (s *Store) PhotoURLsForPost(postID int64) ([]string, error) {
	rows, err := s.db.Query(`SELECT url FROM post_photos WHERE post_id=?`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, rows.Err()
}

func (s *Store) ReorderPostPhotos(postID int64, orderedIDs []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range orderedIDs {
		if _, err := tx.Exec(`UPDATE post_photos SET pos=? WHERE id=? AND post_id=?`, i, id, postID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------- reactions ----------

// adds reaction if not there yet, removes it if already exists (toggle)
func (s *Store) ToggleReaction(postID int64, emoji, ipHash string) (added bool, err error) {
	var exists int
	err = s.db.QueryRow(`SELECT COUNT(*) FROM post_reactions WHERE post_id=? AND emoji=? AND ip_hash=?`,
		postID, emoji, ipHash).Scan(&exists)
	if err != nil {
		return false, err
	}
	if exists > 0 {
		_, err = s.db.Exec(`DELETE FROM post_reactions WHERE post_id=? AND emoji=? AND ip_hash=?`, postID, emoji, ipHash)
		return false, err
	}
	_, err = s.db.Exec(`INSERT INTO post_reactions(post_id,emoji,ip_hash,created_at) VALUES(?,?,?,?)`,
		postID, emoji, ipHash, time.Now().UTC().Format(time.RFC3339))
	return true, err
}

func (s *Store) reactionCounts(postID int64, ipHash string) ([]ReactionCount, error) {
	rows, err := s.db.Query(`SELECT emoji,COUNT(*) FROM post_reactions WHERE post_id=? GROUP BY emoji`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := make(map[string]int)
	for rows.Next() {
		var emoji string
		var n int
		if err := rows.Scan(&emoji, &n); err != nil {
			return nil, err
		}
		counts[emoji] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	mine := make(map[string]bool)
	if ipHash != "" {
		mrows, err := s.db.Query(`SELECT emoji FROM post_reactions WHERE post_id=? AND ip_hash=?`, postID, ipHash)
		if err != nil {
			return nil, err
		}
		defer mrows.Close()
		for mrows.Next() {
			var emoji string
			if err := mrows.Scan(&emoji); err != nil {
				return nil, err
			}
			mine[emoji] = true
		}
		if err := mrows.Err(); err != nil {
			return nil, err
		}
	}

	out := make([]ReactionCount, 0, len(AllowedEmoji))
	for _, e := range AllowedEmoji {
		out = append(out, ReactionCount{Emoji: e, Count: counts[e], Reacted: mine[e]})
	}
	return out, nil
}

// ---------- ip hashing ----------

// hash with salt so we never keep raw ip in db
func (s *Store) IPHash(ip string) (string, error) {
	if ip == "" {
		return "", nil
	}
	salt, err := s.getOrCreateSalt()
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(salt + ip))
	return hex.EncodeToString(sum[:]), nil
}

func (s *Store) getOrCreateSalt() (string, error) {
	var salt string
	err := s.db.QueryRow(`SELECT value FROM app_meta WHERE key='ip_salt'`).Scan(&salt)
	if err == nil {
		return salt, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	salt = hex.EncodeToString(b)
	if _, err := s.db.Exec(`INSERT OR IGNORE INTO app_meta(key,value) VALUES('ip_salt',?)`, salt); err != nil {
		return "", err
	}
	// might have raced with another insert, re-read just in case
	if err := s.db.QueryRow(`SELECT value FROM app_meta WHERE key='ip_salt'`).Scan(&salt); err != nil {
		return "", err
	}
	return salt, nil
}
