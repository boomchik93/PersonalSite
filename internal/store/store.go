// all db stuff for the site lives here
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(ON)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // sqlite doesn't like concurrent writes, so just 1 conn
	if err := db.Ping(); err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := s.seed(); err != nil {
		return nil, fmt.Errorf("seed: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

const schema = `
CREATE TABLE IF NOT EXISTS profile (
	id           INTEGER PRIMARY KEY CHECK (id = 1),
	first_name   TEXT NOT NULL,
	last_name    TEXT NOT NULL,
	role         TEXT NOT NULL,
	location     TEXT NOT NULL,
	tagline      TEXT NOT NULL,
	about_ru     TEXT NOT NULL,
	about_en     TEXT NOT NULL,
	age          TEXT NOT NULL DEFAULT '',
	email        TEXT NOT NULL,
	phone        TEXT NOT NULL,
	telegram     TEXT NOT NULL,
	github       TEXT NOT NULL,
	photo        TEXT NOT NULL DEFAULT '',
	resume       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS skill_groups (
	id    INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL,
	pos   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skills (
	id        INTEGER PRIMARY KEY AUTOINCREMENT,
	group_id  INTEGER NOT NULL REFERENCES skill_groups(id) ON DELETE CASCADE,
	name      TEXT NOT NULL,
	highlight INTEGER NOT NULL DEFAULT 0,
	pos       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	title       TEXT NOT NULL,
	stack       TEXT NOT NULL,
	description TEXT NOT NULL,
	metrics     TEXT NOT NULL DEFAULT '',
	url         TEXT NOT NULL DEFAULT '',
	pos         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS education (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	period      TEXT NOT NULL,
	institution TEXT NOT NULL,
	major       TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	pos         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS interests (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	symbol      TEXT NOT NULL,
	title       TEXT NOT NULL,
	subtitle    TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	pos         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	name       TEXT NOT NULL,
	email      TEXT NOT NULL,
	body       TEXT NOT NULL,
	created_at TEXT NOT NULL,
	is_read    INTEGER NOT NULL DEFAULT 0
);
`

func (s *Store) migrate() error {
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}
	if _, err := s.db.Exec(blogSchema); err != nil {
		return err
	}
	if _, err := s.db.Exec(spotifySchema); err != nil {
		return err
	}
	return nil
}

// ---------- Models ----------

type Profile struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Role      string `json:"role"`
	Location  string `json:"location"`
	Tagline   string `json:"tagline"`
	AboutRU   string `json:"about_ru"`
	AboutEN   string `json:"about_en"`
	Age       string `json:"age"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	Telegram  string `json:"telegram"`
	GitHub    string `json:"github"`
	Photo     string `json:"photo"`
	Resume    string `json:"resume"`
}

type Skill struct {
	ID        int64  `json:"id"`
	GroupID   int64  `json:"group_id"`
	Name      string `json:"name"`
	Highlight bool   `json:"highlight"`
	Pos       int    `json:"pos"`
}

type SkillGroup struct {
	ID     int64   `json:"id"`
	Title  string  `json:"title"`
	Pos    int     `json:"pos"`
	Skills []Skill `json:"skills"`
}

type Project struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Stack       string `json:"stack"`
	Description string `json:"description"`
	Metrics     string `json:"metrics"`
	URL         string `json:"url"`
	Pos         int    `json:"pos"`
}

type Education struct {
	ID          int64  `json:"id"`
	Period      string `json:"period"`
	Institution string `json:"institution"`
	Major       string `json:"major"`
	Description string `json:"description"`
	Pos         int    `json:"pos"`
}

type Interest struct {
	ID          int64  `json:"id"`
	Symbol      string `json:"symbol"`
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Description string `json:"description"`
	Pos         int    `json:"pos"`
}

type Message struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
	IsRead    bool   `json:"is_read"`
}

var ErrNotFound = errors.New("not found")

// ---------- Profile ----------

func (s *Store) GetProfile() (Profile, error) {
	var p Profile
	err := s.db.QueryRow(`SELECT first_name,last_name,role,location,tagline,about_ru,about_en,age,email,phone,telegram,github,photo,resume FROM profile WHERE id=1`).
		Scan(&p.FirstName, &p.LastName, &p.Role, &p.Location, &p.Tagline, &p.AboutRU, &p.AboutEN, &p.Age, &p.Email, &p.Phone, &p.Telegram, &p.GitHub, &p.Photo, &p.Resume)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

func (s *Store) UpdateProfile(p Profile) error {
	_, err := s.db.Exec(`UPDATE profile SET first_name=?,last_name=?,role=?,location=?,tagline=?,about_ru=?,about_en=?,age=?,email=?,phone=?,telegram=?,github=?,photo=?,resume=? WHERE id=1`,
		p.FirstName, p.LastName, p.Role, p.Location, p.Tagline, p.AboutRU, p.AboutEN, p.Age, p.Email, p.Phone, p.Telegram, p.GitHub, p.Photo, p.Resume)
	return err
}

// ---------- Skills ----------

func (s *Store) SkillGroups() ([]SkillGroup, error) {
	rows, err := s.db.Query(`SELECT id,title,pos FROM skill_groups ORDER BY pos,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var groups []SkillGroup
	for rows.Next() {
		var g SkillGroup
		if err := rows.Scan(&g.ID, &g.Title, &g.Pos); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range groups {
		sk, err := s.skillsForGroup(groups[i].ID)
		if err != nil {
			return nil, err
		}
		groups[i].Skills = sk
	}
	return groups, nil
}

func (s *Store) skillsForGroup(groupID int64) ([]Skill, error) {
	rows, err := s.db.Query(`SELECT id,group_id,name,highlight,pos FROM skills WHERE group_id=? ORDER BY pos,id`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Skill{}
	for rows.Next() {
		var sk Skill
		if err := rows.Scan(&sk.ID, &sk.GroupID, &sk.Name, &sk.Highlight, &sk.Pos); err != nil {
			return nil, err
		}
		out = append(out, sk)
	}
	return out, rows.Err()
}

func (s *Store) CreateSkillGroup(title string, pos int) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO skill_groups(title,pos) VALUES(?,?)`, title, pos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) UpdateSkillGroup(id int64, title string, pos int) error {
	_, err := s.db.Exec(`UPDATE skill_groups SET title=?,pos=? WHERE id=?`, title, pos, id)
	return err
}

func (s *Store) DeleteSkillGroup(id int64) error { return s.deleteByID("skill_groups", id) }

func (s *Store) CreateSkill(sk Skill) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO skills(group_id,name,highlight,pos) VALUES(?,?,?,?)`, sk.GroupID, sk.Name, sk.Highlight, sk.Pos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) DeleteSkill(id int64) error { return s.deleteByID("skills", id) }

// ---------- generic list helpers for projects/education/interests ----------

func (s *Store) Projects() ([]Project, error) {
	rows, err := s.db.Query(`SELECT id,title,stack,description,metrics,url,pos FROM projects ORDER BY pos,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Title, &p.Stack, &p.Description, &p.Metrics, &p.URL, &p.Pos); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) UpsertProject(p Project) (int64, error) {
	if p.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO projects(title,stack,description,metrics,url,pos) VALUES(?,?,?,?,?,?)`,
			p.Title, p.Stack, p.Description, p.Metrics, p.URL, p.Pos)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.Exec(`UPDATE projects SET title=?,stack=?,description=?,metrics=?,url=?,pos=? WHERE id=?`,
		p.Title, p.Stack, p.Description, p.Metrics, p.URL, p.Pos, p.ID)
	return p.ID, err
}

func (s *Store) DeleteProject(id int64) error { return s.deleteByID("projects", id) }

func (s *Store) Education() ([]Education, error) {
	rows, err := s.db.Query(`SELECT id,period,institution,major,description,pos FROM education ORDER BY pos,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Education{}
	for rows.Next() {
		var e Education
		if err := rows.Scan(&e.ID, &e.Period, &e.Institution, &e.Major, &e.Description, &e.Pos); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) UpsertEducation(e Education) (int64, error) {
	if e.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO education(period,institution,major,description,pos) VALUES(?,?,?,?,?)`,
			e.Period, e.Institution, e.Major, e.Description, e.Pos)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.Exec(`UPDATE education SET period=?,institution=?,major=?,description=?,pos=? WHERE id=?`,
		e.Period, e.Institution, e.Major, e.Description, e.Pos, e.ID)
	return e.ID, err
}

func (s *Store) DeleteEducation(id int64) error { return s.deleteByID("education", id) }

func (s *Store) Interests() ([]Interest, error) {
	rows, err := s.db.Query(`SELECT id,symbol,title,subtitle,description,pos FROM interests ORDER BY pos,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Interest{}
	for rows.Next() {
		var it Interest
		if err := rows.Scan(&it.ID, &it.Symbol, &it.Title, &it.Subtitle, &it.Description, &it.Pos); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) UpsertInterest(it Interest) (int64, error) {
	if it.ID == 0 {
		res, err := s.db.Exec(`INSERT INTO interests(symbol,title,subtitle,description,pos) VALUES(?,?,?,?,?)`,
			it.Symbol, it.Title, it.Subtitle, it.Description, it.Pos)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	_, err := s.db.Exec(`UPDATE interests SET symbol=?,title=?,subtitle=?,description=?,pos=? WHERE id=?`,
		it.Symbol, it.Title, it.Subtitle, it.Description, it.Pos, it.ID)
	return it.ID, err
}

func (s *Store) DeleteInterest(id int64) error { return s.deleteByID("interests", id) }

// ---------- Messages ----------

func (s *Store) CreateMessage(m Message) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO messages(name,email,body,created_at,is_read) VALUES(?,?,?,?,0)`,
		m.Name, m.Email, m.Body, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) Messages() ([]Message, error) {
	rows, err := s.db.Query(`SELECT id,name,email,body,created_at,is_read FROM messages ORDER BY created_at DESC,id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Name, &m.Email, &m.Body, &m.CreatedAt, &m.IsRead); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) MarkMessageRead(id int64) error {
	_, err := s.db.Exec(`UPDATE messages SET is_read=1 WHERE id=?`, id)
	return err
}

func (s *Store) DeleteMessage(id int64) error { return s.deleteByID("messages", id) }

func (s *Store) deleteByID(table string, id int64) error {
	// table name is hardcoded by us, never user input, so this is fine
	_, err := s.db.Exec(fmt.Sprintf(`DELETE FROM %s WHERE id=?`, table), id)
	return err
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
