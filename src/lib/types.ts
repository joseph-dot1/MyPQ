export type Level = { id: string; name: string; position: number };

export type Course = {
  id: string;
  department_id: string;
  level_id: string;
  code: string;
  title: string;
};

export type Session = { id: string; name: string; start_year: number };

export type Lecturer = {
  id: string;
  department_id: string;
  name: string;
  style_notes: string | null;
};

export type QuestionSet = {
  id: string;
  course_id: string;
  session_id: string;
  semester: "First" | "Second";
  lecturer_id: string | null;
  type: "exam" | "test" | "ai_generated";
  source: "admin" | "ai";
  is_premium: boolean;
  created_at: string;
};

export type QuestionSection = {
  id: string;
  question_set_id: string;
  label: string;
  position: number;
  scoring: "auto" | "self";
};

export type QuestionOption = { key: string; text: string };

export type Question = {
  id: string;
  question_set_id: string;
  section_id: string | null;
  number: number;
  type: "mcq" | "theory";
  body_md: string;
  options: QuestionOption[] | null;
  correct_option: string | null;
  answer_md: string | null;
  explanation_md: string | null;
  answer_source: "admin" | "ai_deduced" | "verified";
};

export type Material = {
  id: string;
  course_id: string;
  lecturer_id: string | null;
  title: string;
  file_url: string;
  extracted_text_status: "pending" | "extracted" | "failed" | "needs_ocr";
  is_premium: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  department_id: string | null;
  level_id: string | null;
  role: "student" | "admin";
  is_rep: boolean;
  rep_code: string | null;
  referral_code: string;
  referred_by: string | null;
  created_at: string;
};

export type Attempt = {
  id: string;
  user_id: string;
  question_set_id: string;
  mode: "read" | "test";
  score: number;
  total: number;
  duration_s: number;
  created_at: string;
};

export type UserCourseExam = {
  user_id: string;
  course_id: string;
  exam_type: "test" | "exam";
  exam_date: string;
};
