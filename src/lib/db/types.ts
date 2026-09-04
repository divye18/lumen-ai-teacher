/**
 * Database types for the Lumen Postgres schema.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ THESE ARE HAND-WRITTEN, NOT GENERATED.                                     │
 * │                                                                           │
 * │ Generating them requires the Supabase CLI linked to a running project:    │
 * │                                                                           │
 * │   npx supabase gen types typescript --local > src/lib/db/types.ts         │
 * │   # or, against a linked project:                                          │
 * │   npx supabase gen types typescript --linked > src/lib/db/types.ts        │
 * │                                                                           │
 * │ That tooling/auth is not available in this environment, so this file is a │
 * │ faithful manual transcription of `supabase/migrations/*`. It follows the  │
 * │ exact shape `supabase gen types` emits, so regenerating is a drop-in      │
 * │ replacement. Keep it in sync with the migrations until then.              │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Timestamps and uuids are strings over the wire. `vector` serialises as a string. */
type Uuid = string;
type Timestamptz = string;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: Uuid;
          display_name: string;
          email: string | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id: Uuid;
          display_name: string;
          email?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          display_name?: string;
          email?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Relationships: [];
      };

      learner_profiles: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          current_level: number;
          learning_goal: string | null;
          available_time_minutes: number | null;
          preferred_language: string;
          preferred_learning_strategy: string | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          current_level?: number;
          learning_goal?: string | null;
          available_time_minutes?: number | null;
          preferred_language?: string;
          preferred_learning_strategy?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          current_level?: number;
          learning_goal?: string | null;
          available_time_minutes?: number | null;
          preferred_language?: string;
          preferred_learning_strategy?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Relationships: [];
      };

      documents: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          title: string;
          file_name: string;
          file_type: string;
          file_size: number | null;
          storage_path: string | null;
          status: string;
          metadata: Json;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          title: string;
          file_name: string;
          file_type: string;
          file_size?: number | null;
          storage_path?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          title?: string;
          file_name?: string;
          file_type?: string;
          file_size?: number | null;
          storage_path?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Relationships: [];
      };

      document_chunks: {
        Row: {
          id: Uuid;
          document_id: Uuid;
          user_id: Uuid;
          content: string;
          chunk_index: number;
          page_number: number | null;
          section_title: string | null;
          metadata: Json;
          embedding: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          document_id: Uuid;
          user_id: Uuid;
          content: string;
          chunk_index: number;
          page_number?: number | null;
          section_title?: string | null;
          metadata?: Json;
          embedding?: string | null;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          document_id?: Uuid;
          user_id?: Uuid;
          content?: string;
          chunk_index?: number;
          page_number?: number | null;
          section_title?: string | null;
          metadata?: Json;
          embedding?: string | null;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      concepts: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          document_id: Uuid | null;
          name: string;
          description: string | null;
          subject: string | null;
          metadata: Json;
          created_at: Timestamptz;
          updated_at: Timestamptz;
          // Phase 4 — knowledge graph
          normalized_key: string | null;
          importance_score: number;
          source_pages: Json;
          graph_degree: number;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          document_id?: Uuid | null;
          name: string;
          description?: string | null;
          subject?: string | null;
          metadata?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
          normalized_key?: string | null;
          importance_score?: number;
          source_pages?: Json;
          graph_degree?: number;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          document_id?: Uuid | null;
          name?: string;
          description?: string | null;
          subject?: string | null;
          metadata?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
          normalized_key?: string | null;
          importance_score?: number;
          source_pages?: Json;
          graph_degree?: number;
        };
        Relationships: [];
      };

      concept_relationships: {
        Row: {
          id: Uuid;
          source_concept_id: Uuid;
          target_concept_id: Uuid;
          relationship_type: string;
          strength: number;
          metadata: Json;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          source_concept_id: Uuid;
          target_concept_id: Uuid;
          relationship_type: string;
          strength?: number;
          metadata?: Json;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          source_concept_id?: Uuid;
          target_concept_id?: Uuid;
          relationship_type?: string;
          strength?: number;
          metadata?: Json;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      learning_sessions: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          title: string | null;
          topic: string | null;
          language: string;
          goal: string | null;
          status: string;
          current_concept_id: Uuid | null;
          started_at: Timestamptz | null;
          ended_at: Timestamptz | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
          // Phase 2 — teaching loop
          lesson_id: Uuid | null;
          time_budget_minutes: number | null;
          current_action: string | null;
          plan_cursor: number;
          mastery_snapshot: Json;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          title?: string | null;
          topic?: string | null;
          language?: string;
          goal?: string | null;
          status?: string;
          current_concept_id?: Uuid | null;
          started_at?: Timestamptz | null;
          ended_at?: Timestamptz | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
          lesson_id?: Uuid | null;
          time_budget_minutes?: number | null;
          current_action?: string | null;
          plan_cursor?: number;
          mastery_snapshot?: Json;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          title?: string | null;
          topic?: string | null;
          language?: string;
          goal?: string | null;
          status?: string;
          current_concept_id?: Uuid | null;
          started_at?: Timestamptz | null;
          ended_at?: Timestamptz | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
          lesson_id?: Uuid | null;
          time_budget_minutes?: number | null;
          current_action?: string | null;
          plan_cursor?: number;
          mastery_snapshot?: Json;
        };
        Relationships: [];
      };

      lessons: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          document_id: Uuid | null;
          title: string;
          topic: string;
          objective: string;
          language: string;
          teaching_style: string | null;
          estimated_minutes: number | null;
          source_grounded: boolean;
          plan_source: string;
          status: string;
          plan: Json;
          citations: Json;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          document_id?: Uuid | null;
          title: string;
          topic: string;
          objective: string;
          language?: string;
          teaching_style?: string | null;
          estimated_minutes?: number | null;
          source_grounded?: boolean;
          plan_source?: string;
          status?: string;
          plan?: Json;
          citations?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          document_id?: Uuid | null;
          title?: string;
          topic?: string;
          objective?: string;
          language?: string;
          teaching_style?: string | null;
          estimated_minutes?: number | null;
          source_grounded?: boolean;
          plan_source?: string;
          status?: string;
          plan?: Json;
          citations?: Json;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Relationships: [];
      };

      lesson_concepts: {
        Row: {
          id: Uuid;
          lesson_id: Uuid;
          concept_id: Uuid | null;
          concept_key: string;
          title: string;
          summary: string;
          position: number;
          difficulty: number;
          importance: number;
          is_prerequisite: boolean;
          status: string;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          lesson_id: Uuid;
          concept_id?: Uuid | null;
          concept_key: string;
          title: string;
          summary?: string;
          position: number;
          difficulty?: number;
          importance?: number;
          is_prerequisite?: boolean;
          status?: string;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          lesson_id?: Uuid;
          concept_id?: Uuid | null;
          concept_key?: string;
          title?: string;
          summary?: string;
          position?: number;
          difficulty?: number;
          importance?: number;
          is_prerequisite?: boolean;
          status?: string;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      teaching_questions: {
        Row: {
          id: Uuid;
          session_id: Uuid;
          lesson_id: Uuid | null;
          user_id: Uuid;
          concept_key: string;
          concept_id: Uuid | null;
          question_kind: string;
          difficulty: number;
          prompt: string;
          expected_reasoning: string | null;
          source_grounded: boolean;
          citations: Json;
          metadata: Json;
          created_at: Timestamptz;
          // Phase 5 — structured assessment
          question_format: string;
          answer_key: Json;
        };
        Insert: {
          id?: Uuid;
          session_id: Uuid;
          lesson_id?: Uuid | null;
          user_id: Uuid;
          concept_key: string;
          concept_id?: Uuid | null;
          question_kind: string;
          difficulty?: number;
          prompt: string;
          expected_reasoning?: string | null;
          source_grounded?: boolean;
          citations?: Json;
          metadata?: Json;
          created_at?: Timestamptz;
          question_format?: string;
          answer_key?: Json;
        };
        Update: {
          id?: Uuid;
          session_id?: Uuid;
          lesson_id?: Uuid | null;
          user_id?: Uuid;
          concept_key?: string;
          concept_id?: Uuid | null;
          question_kind?: string;
          difficulty?: number;
          prompt?: string;
          expected_reasoning?: string | null;
          source_grounded?: boolean;
          citations?: Json;
          metadata?: Json;
          created_at?: Timestamptz;
          question_format?: string;
          answer_key?: Json;
        };
        Relationships: [];
      };

      teaching_answers: {
        Row: {
          id: Uuid;
          question_id: Uuid;
          session_id: Uuid;
          user_id: Uuid;
          response_text: string;
          classification: string | null;
          correctness_score: number | null;
          evaluation: Json;
          response_time_ms: number | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          question_id: Uuid;
          session_id: Uuid;
          user_id: Uuid;
          response_text?: string;
          classification?: string | null;
          correctness_score?: number | null;
          evaluation?: Json;
          response_time_ms?: number | null;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          question_id?: Uuid;
          session_id?: Uuid;
          user_id?: Uuid;
          response_text?: string;
          classification?: string | null;
          correctness_score?: number | null;
          evaluation?: Json;
          response_time_ms?: number | null;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      interactions: {
        Row: {
          id: Uuid;
          session_id: Uuid;
          user_id: Uuid;
          concept_id: Uuid | null;
          role: string;
          interaction_type: string;
          content: string;
          metadata: Json;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          session_id: Uuid;
          user_id: Uuid;
          concept_id?: Uuid | null;
          role: string;
          interaction_type: string;
          content?: string;
          metadata?: Json;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          session_id?: Uuid;
          user_id?: Uuid;
          concept_id?: Uuid | null;
          role?: string;
          interaction_type?: string;
          content?: string;
          metadata?: Json;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      concept_mastery: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          concept_id: Uuid;
          mastery_score: number;
          confidence_score: number;
          attempt_count: number;
          correct_count: number;
          incorrect_count: number;
          misconception_count: number;
          last_attempt_at: Timestamptz | null;
          last_correct_at: Timestamptz | null;
          preferred_strategy: string | null;
          status: string;
          evidence_summary: string | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          concept_id: Uuid;
          mastery_score?: number;
          confidence_score?: number;
          attempt_count?: number;
          correct_count?: number;
          incorrect_count?: number;
          misconception_count?: number;
          last_attempt_at?: Timestamptz | null;
          last_correct_at?: Timestamptz | null;
          preferred_strategy?: string | null;
          status?: string;
          evidence_summary?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          concept_id?: Uuid;
          mastery_score?: number;
          confidence_score?: number;
          attempt_count?: number;
          correct_count?: number;
          incorrect_count?: number;
          misconception_count?: number;
          last_attempt_at?: Timestamptz | null;
          last_correct_at?: Timestamptz | null;
          preferred_strategy?: string | null;
          status?: string;
          evidence_summary?: string | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Relationships: [];
      };

      misconceptions: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          concept_id: Uuid;
          session_id: Uuid | null;
          interaction_id: Uuid | null;
          category: string;
          description: string;
          severity: string;
          confidence: number;
          status: string;
          first_detected_at: Timestamptz;
          last_detected_at: Timestamptz;
          resolved_at: Timestamptz | null;
          evidence: Json;
          metadata: Json;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          concept_id: Uuid;
          session_id?: Uuid | null;
          interaction_id?: Uuid | null;
          category: string;
          description: string;
          severity?: string;
          confidence?: number;
          status?: string;
          first_detected_at?: Timestamptz;
          last_detected_at?: Timestamptz;
          resolved_at?: Timestamptz | null;
          evidence?: Json;
          metadata?: Json;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          concept_id?: Uuid;
          session_id?: Uuid | null;
          interaction_id?: Uuid | null;
          category?: string;
          description?: string;
          severity?: string;
          confidence?: number;
          status?: string;
          first_detected_at?: Timestamptz;
          last_detected_at?: Timestamptz;
          resolved_at?: Timestamptz | null;
          evidence?: Json;
          metadata?: Json;
        };
        Relationships: [];
      };

      assessments: {
        Row: {
          id: Uuid;
          user_id: Uuid;
          session_id: Uuid | null;
          title: string | null;
          topic: string | null;
          assessment_type: string;
          status: string;
          score: number | null;
          max_score: number | null;
          started_at: Timestamptz | null;
          completed_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          user_id: Uuid;
          session_id?: Uuid | null;
          title?: string | null;
          topic?: string | null;
          assessment_type?: string;
          status?: string;
          score?: number | null;
          max_score?: number | null;
          started_at?: Timestamptz | null;
          completed_at?: Timestamptz | null;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          user_id?: Uuid;
          session_id?: Uuid | null;
          title?: string | null;
          topic?: string | null;
          assessment_type?: string;
          status?: string;
          score?: number | null;
          max_score?: number | null;
          started_at?: Timestamptz | null;
          completed_at?: Timestamptz | null;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      assessment_questions: {
        Row: {
          id: Uuid;
          assessment_id: Uuid;
          concept_id: Uuid | null;
          question_text: string;
          question_type: string;
          difficulty: number;
          expected_answer: string | null;
          metadata: Json;
          position: number;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          assessment_id: Uuid;
          concept_id?: Uuid | null;
          question_text: string;
          question_type?: string;
          difficulty?: number;
          expected_answer?: string | null;
          metadata?: Json;
          position?: number;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          assessment_id?: Uuid;
          concept_id?: Uuid | null;
          question_text?: string;
          question_type?: string;
          difficulty?: number;
          expected_answer?: string | null;
          metadata?: Json;
          position?: number;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };

      assessment_answers: {
        Row: {
          id: Uuid;
          question_id: Uuid;
          user_id: Uuid;
          answer_text: string;
          is_correct: boolean | null;
          score: number | null;
          evaluation: Json;
          created_at: Timestamptz;
        };
        Insert: {
          id?: Uuid;
          question_id: Uuid;
          user_id: Uuid;
          answer_text?: string;
          is_correct?: boolean | null;
          score?: number | null;
          evaluation?: Json;
          created_at?: Timestamptz;
        };
        Update: {
          id?: Uuid;
          question_id?: Uuid;
          user_id?: Uuid;
          answer_text?: string;
          is_correct?: boolean | null;
          score?: number | null;
          evaluation?: Json;
          created_at?: Timestamptz;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** Vector similarity search over the caller's own document chunks (RLS-scoped). */
      match_document_chunks: {
        Args: {
          query_embedding: string;
          match_count?: number;
          similarity_threshold?: number;
          filter_document_id?: string | null;
        };
        Returns: {
          id: Uuid;
          document_id: Uuid;
          chunk_index: number;
          content: string;
          page_number: number | null;
          section_title: string | null;
          metadata: Json;
          similarity: number;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience helpers mirroring `@supabase/supabase-js` generated-type usage. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
