// ============================================================
// 一気 IKKI — 共有型定義
// フロントエンド / APIルート / DB保存で同じ形を使い回す
// ============================================================

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// 面談開始前に入力する候補者の基本情報
export interface CandidateInput {
  name: string;
  role: string;
  years: string;
}

export interface Strength {
  title: string;
  desc: string;
}

export interface SkillScore {
  name: string;
  score: number; // 1〜5
}

export interface Episode {
  situation: string;
  action: string;
  result: string;
}

// キャリアカード本体。AI解析結果 + 候補者基本情報のマージ
export interface Profile {
  catchcopy: string;
  summary: string;
  strengths: Strength[];
  skills: SkillScore[];
  values: string[];
  episode: Episode;
  salaryMin: number; // 万円
  salaryMax: number; // 万円
  matchRoles: string[];
  highlight: string;
  matchScore: number; // 75〜96
  name: string;
  role: string;
  years: string;
}

// DBに保存されるカード1件分
export interface CareerCardRecord {
  id: string;
  created_at: string;
  name: string;
  role: string;
  years: string;
  transcript: ChatMessage[];
  profile: Profile;
}
