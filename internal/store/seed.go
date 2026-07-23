package store

// fills db with my real info on first run (checks if profile row exists first)
func (s *Store) seed() error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM profile`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	email, err := s.encrypt("matvey59rus@gmail.com")
	if err != nil {
		return err
	}
	phone, err := s.encrypt("+7 904 840-97-88")
	if err != nil {
		return err
	}
	telegram, err := s.encrypt("boomchik93")
	if err != nil {
		return err
	}

	aboutRU := `Разработчик из Санкт-Петербурга. Учусь и параллельно строю реальные продукты — ` +
		`от REST-API сервисов компьютерного зрения до full-stack веб-платформ. ` +
		`Больше всего меня увлекает машинное обучение и его прикладные задачи: ` +
		`детекция объектов, распознавание речи, работа с языковыми моделями. ` +
		`Прошёл CV-трек на стажировке T-Bank × Sirius, где обучил детектор логотипов на YOLOv8. ` +
		`Люблю доводить проект от идеи до работающего сервиса в Docker.`

	aboutEN := `A developer from Saint Petersburg. I study while building real products — ` +
		`from computer-vision REST APIs to full-stack web platforms. ` +
		`I'm most passionate about machine learning and its applied problems: object detection, ` +
		`speech recognition and working with language models.`

	_, err = tx.Exec(`INSERT INTO profile
		(id,first_name,last_name,role,location,tagline,about_ru,about_en,age,email,phone,telegram,github,photo,resume,rubik_label,rubik_title,rubik_text)
		VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		"Матвей", "Семёнов",
		"Разработчик · Developer",
		"Санкт-Петербург / Saint Petersburg",
		"Backend & ML / Computer Vision",
		aboutRU, aboutEN,
		"", // age — заполни в админке
		email,
		phone,
		telegram,
		"boomchik93",
		"/uploads/photo.jpg",
		"/uploads/resume.pdf",
		"// 3×3 · self-solving",
		"Разбираю сложное — и собираю обратно",
		"Любая задача — как кубик Рубика: сначала хаос вращений, потом система. Он сам крутит грани, рассыпается на кубики и собирается заново. А между коммитами —",
	)
	if err != nil {
		return err
	}

	// ----- Skill groups -----
	// level: "main" (основной) | "strong" (уверенно) | "work" (рабочий)
	type seedSkill struct {
		name  string
		level string
	}
	skillGroups := []struct {
		title  string
		pos    int
		skills []seedSkill
	}{
		{"Языки / Languages", 0, []seedSkill{
			{"Python", "main"}, {"JavaScript", "strong"}, {"C#", "work"}, {"SQL", "work"}, {"HTML / CSS", "work"},
		}},
		{"ML / Computer Vision", 1, []seedSkill{
			{"PyTorch", "main"}, {"YOLOv8", "strong"}, {"Whisper", "work"}, {"LLM (Qwen2.5)", "work"}, {"OpenCV", "work"},
		}},
		{"Бэкенд / Backend", 2, []seedSkill{
			{"FastAPI", "main"}, {"ASP.NET Core", "work"}, {"REST API", "work"}, {"Pydantic", "work"},
		}},
		{"Фронтенд / Frontend", 3, []seedSkill{
			{"React", "main"}, {"Vite", "work"}, {"React Router", "work"},
		}},
		{"Инструменты / Tools", 4, []seedSkill{
			{"Git", "work"}, {"Docker", "work"}, {"PostgreSQL", "work"}, {"SQLite", "work"}, {"Linux", "work"},
		}},
	}
	for _, g := range skillGroups {
		res, err := tx.Exec(`INSERT INTO skill_groups(title,pos) VALUES(?,?)`, g.title, g.pos)
		if err != nil {
			return err
		}
		gid, _ := res.LastInsertId()
		for i, sk := range g.skills {
			// highlight kept in sync for any legacy reader: main/strong are highlighted
			highlight := sk.level == "main" || sk.level == "strong"
			if _, err := tx.Exec(`INSERT INTO skills(group_id,name,highlight,level,pos) VALUES(?,?,?,?,?)`,
				gid, sk.name, highlight, sk.level, i); err != nil {
				return err
			}
		}
	}

	// ----- Projects (real, from GitHub) -----
	projects := []Project{
		{
			Title:       "T-Bank Logo Detector",
			Stack:       "FastAPI · YOLOv8 · PyTorch · Docker",
			Description: "REST-API сервис для детекции логотипов T-Bank на изображениях. Принимает картинку и возвращает координаты bounding box с уверенностью. Модель обучена на 400 размеченных изображениях. Выполнено в рамках отбора на стажировку T-Bank × Sirius (CV-трек).",
			Metrics:     "86% F1 · 93.6% mAP@0.5",
			URL:         "https://github.com/boomchik93/tbank-logo-detector",
			Pos:         0,
		},
		{
			Title:       "MeetPoint",
			Stack:       "React 18 · ASP.NET Core (.NET 9) · PostgreSQL",
			Description: "Платформа онлайн-записи на консультации для специалистов и фрилансеров. Гибридные роли (клиент и специалист в одном аккаунте), управление слотами с UTC-синхронизацией, JWT-аутентификация, интеграция с Google и Яндекс.Календарём, встроенный чат и рейтинги. Курсовая работа группы РИС-25-2.",
			Metrics:     "Команда из 3 человек",
			URL:         "https://github.com/boomchik93/MeetPoint",
			Pos:         1,
		},
		{
			Title:       "Транскрибатор (meetlog)",
			Stack:       "FastAPI · Whisper · Qwen2.5 · Docker",
			Description: "Локальный сервис: превращает аудиозаписи встреч в текст с разделением по спикерам и структурным анализом — темы, решения, задачи и риски. Работает полностью офлайн, данные никуда не уходят. Whisper для распознавания речи, resemblyzer для диаризации, LLM Qwen2.5-7B для извлечения смысла.",
			Metrics:     "100% локально · без облака",
			URL:         "https://github.com/boomchik93/meetlog",
			Pos:         2,
		},
	}
	for _, p := range projects {
		if _, err := tx.Exec(`INSERT INTO projects(title,stack,description,metrics,url,pos) VALUES(?,?,?,?,?,?)`,
			p.Title, p.Stack, p.Description, p.Metrics, p.URL, p.Pos); err != nil {
			return err
		}
	}

	// ----- Education (group code known; institution to be filled in admin) -----
	if _, err := tx.Exec(`INSERT INTO education(period,institution,major,description,pos) VALUES(?,?,?,?,?)`,
		"2025 — наст. время",
		"[Укажите университет в админке]",
		"Разработка информационных систем · группа РИС-25-2",
		"Учусь на направлении, связанном с разработкой информационных систем. Курсовая работа — платформа MeetPoint (см. раздел «Проекты»).",
		0); err != nil {
		return err
	}

	// ----- Interests -----
	interests := []Interest{
		{Symbol: "♩", Title: "Музыка", Subtitle: "Instrumental Music", Description: "Инструментальная музыка — звуки без слов, которые говорят больше любых слов", Pos: 0},
		{Symbol: "◉", Title: "Кино", Subtitle: "Cinema", Description: "Люблю кино как форму искусства и зеркало человеческой природы", Pos: 1},
		{Symbol: "≡", Title: "Чтение", Subtitle: "Reading", Description: "Книги открывают другие миры и точки зрения на одну и ту же реальность", Pos: 2},
		{Symbol: "А.", Title: "Чехов", Subtitle: "Anton Chekhov", Description: "«Краткость — сестра таланта»", Pos: 3},
	}
	for _, it := range interests {
		if _, err := tx.Exec(`INSERT INTO interests(symbol,title,subtitle,description,pos) VALUES(?,?,?,?,?)`,
			it.Symbol, it.Title, it.Subtitle, it.Description, it.Pos); err != nil {
			return err
		}
	}

	return tx.Commit()
}
