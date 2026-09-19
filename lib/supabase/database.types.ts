export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          attended_at: string | null
          created_at: string
          id: string
          lab_id: string
          referral_id: string
          scheduled_at: string
        }
        Insert: {
          attended_at?: string | null
          created_at?: string
          id?: string
          lab_id: string
          referral_id: string
          scheduled_at: string
        }
        Update: {
          attended_at?: string | null
          created_at?: string
          id?: string
          lab_id?: string
          referral_id?: string
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_pharmacy_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "partner_labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          timestamp: string
        }
        Insert: {
          action: string
          actor?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          timestamp?: string
        }
        Update: {
          action?: string
          actor?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          timestamp?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          consent_type: string
          family_member_id: string
          granted_at: string
          id: string
          ip_address: unknown
          revoked_at: string | null
          user_agent: string | null
        }
        Insert: {
          consent_type: string
          family_member_id: string
          granted_at?: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
        }
        Update: {
          consent_type?: string
          family_member_id?: string
          granted_at?: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          biological_sex: string | null
          created_at: string
          date_of_birth: string
          email: string | null
          full_name: string
          household_id: string
          id: string
          is_minor: boolean
          relation: string
          user_id: string | null
        }
        Insert: {
          biological_sex?: string | null
          created_at?: string
          date_of_birth: string
          email?: string | null
          full_name: string
          household_id: string
          id?: string
          is_minor?: boolean
          relation: string
          user_id?: string | null
        }
        Update: {
          biological_sex?: string | null
          created_at?: string
          date_of_birth?: string
          email?: string | null
          full_name?: string
          household_id?: string
          id?: string
          is_minor?: boolean
          relation?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          region: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          region: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_labs: {
        Row: {
          address: string | null
          calendar_integration_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          region: string
        }
        Insert: {
          address?: string | null
          calendar_integration_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          region: string
        }
        Update: {
          address?: string | null
          calendar_integration_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          region?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          family_member_id: string
          id: string
          lab_id: string | null
          result_summary: string | null
          result_tier: string | null
          results_entered_at: string | null
          risk_score_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_member_id: string
          id?: string
          lab_id?: string | null
          result_summary?: string | null
          result_tier?: string | null
          results_entered_at?: string | null
          risk_score_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_member_id?: string
          id?: string
          lab_id?: string | null
          result_summary?: string | null
          result_tier?: string | null
          results_entered_at?: string | null
          risk_score_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_pharmacy_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "partner_labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_risk_score_id_fkey"
            columns: ["risk_score_id"]
            isOneToOne: false
            referencedRelation: "risk_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          computed_at: string
          family_member_id: string
          findrisc_bonus: number | null
          formula_version: string
          id: string
          score_value: number
          screening_response_id: string
          tier: string
        }
        Insert: {
          computed_at?: string
          family_member_id: string
          findrisc_bonus?: number | null
          formula_version: string
          id?: string
          score_value: number
          screening_response_id: string
          tier: string
        }
        Update: {
          computed_at?: string
          family_member_id?: string
          findrisc_bonus?: number | null
          formula_version?: string
          id?: string
          score_value?: number
          screening_response_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_scores_screening_response_id_fkey"
            columns: ["screening_response_id"]
            isOneToOne: false
            referencedRelation: "screening_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_responses: {
        Row: {
          activity_level: string | null
          age: number
          bp_medication: boolean | null
          diet_score: number | null
          family_history_t2d: boolean
          family_member_id: string
          form_version: string
          gestational_diabetes_history: boolean | null
          height_cm: number
          id: string
          submitted_at: string
          waist_cm: number
        }
        Insert: {
          activity_level?: string | null
          age: number
          bp_medication?: boolean | null
          diet_score?: number | null
          family_history_t2d: boolean
          family_member_id: string
          form_version?: string
          gestational_diabetes_history?: boolean | null
          height_cm: number
          id?: string
          submitted_at?: string
          waist_cm: number
        }
        Update: {
          activity_level?: string | null
          age?: number
          bp_medication?: boolean | null
          diet_score?: number | null
          family_history_t2d?: boolean
          family_member_id?: string
          form_version?: string
          gestational_diabetes_history?: boolean | null
          height_cm?: number
          id?: string
          submitted_at?: string
          waist_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "screening_responses_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      aggregate_outcomes: {
        Row: {
          cohort_size: number | null
          pct_confirmed_prediabetes: number | null
          pct_high_risk: number | null
          pct_referral_completed: number | null
          period: string | null
          region: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      refresh_aggregate_outcomes: { Args: never; Returns: undefined }
      user_household_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
