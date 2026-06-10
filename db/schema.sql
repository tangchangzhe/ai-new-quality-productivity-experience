CREATE TABLE IF NOT EXISTS ideas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  tag VARCHAR(20) DEFAULT NULL COMMENT '用户点击的引导词标签，可为空',
  seeded TINYINT(1) NOT NULL DEFAULT 0,
  is_complete TINYINT(1) NOT NULL DEFAULT 0 COMMENT '完整走完投票和结果页后才可复用',
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_complete (is_complete, seeded, created_at),
  INDEX idx_seeded (seeded)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS model_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idea_id INT NOT NULL,
  slot VARCHAR(20) NOT NULL COMMENT '匿名标签，如 model_1',
  model_key VARCHAR(50) NOT NULL COMMENT '稳定模型键，如 deepseek',
  model_id VARCHAR(120) NOT NULL COMMENT 'Vercel AI Gateway model id',
  display_name VARCHAR(80) NOT NULL COMMENT '揭晓时展示的模型名',
  response MEDIUMTEXT DEFAULT NULL,
  status ENUM('pending', 'done', 'error') NOT NULL DEFAULT 'pending',
  error_message VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uniq_run_idea_slot (idea_id, slot),
  INDEX idx_run_idea (idea_id),
  CONSTRAINT fk_model_runs_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idea_id INT NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  voted_model VARCHAR(50) NOT NULL COMMENT '用户投票选中的模型键，如 deepseek',
  voted_model_name VARCHAR(80) NOT NULL COMMENT '投票时对应的展示名',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_vote_idea_session (idea_id, session_id),
  INDEX idx_vote_model (voted_model),
  CONSTRAINT fk_votes_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idea_id INT NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  level TINYINT NOT NULL COMMENT '1=工具替代, 2=流程重构, 3=能力涌现',
  score INT NOT NULL COMMENT '1~100',
  comment VARCHAR(200) NOT NULL,
  percentile INT DEFAULT NULL COMMENT '百分位',
  seeded TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_evaluation_idea (idea_id),
  INDEX idx_score (score),
  INDEX idx_eval_seeded (seeded),
  CONSTRAINT fk_evaluations_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
