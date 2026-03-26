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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          author_id: string | null
          body: string
          created_at: string | null
          id: string
          match_id: string | null
          pinned: boolean | null
          team_id: string
          title: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          match_id?: string | null
          pinned?: boolean | null
          team_id: string
          title?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          match_id?: string | null
          pinned?: boolean | null
          team_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "announcements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          club_id: string
          created_at: string | null
          id: string
          player_id: string
          role: string
        }
        Insert: {
          club_id: string
          created_at?: string | null
          id?: string
          player_id: string
          role?: string
        }
        Update: {
          club_id?: string
          created_at?: string | null
          id?: string
          player_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          registry_id: string | null
          secondary_color: string | null
          short_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          registry_id?: string | null
          secondary_color?: string | null
          short_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          registry_id?: string | null
          secondary_color?: string | null
          short_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "clubs_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs_registry: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          name: string
          postcode: string | null
          primary_color: string | null
          secondary_color: string | null
          short_name: string | null
          street_address: string | null
          updated_at: string | null
          verified: boolean | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          postcode?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          street_address?: string | null
          updated_at?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          postcode?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          street_address?: string | null
          updated_at?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          assist_id: string | null
          created_at: string | null
          id: string
          is_own_goal: boolean | null
          is_penalty: boolean | null
          is_penalty_corner: boolean | null
          match_id: string
          minute: number | null
          scorer_id: string | null
        }
        Insert: {
          assist_id?: string | null
          created_at?: string | null
          id?: string
          is_own_goal?: boolean | null
          is_penalty?: boolean | null
          is_penalty_corner?: boolean | null
          match_id: string
          minute?: number | null
          scorer_id?: string | null
        }
        Update: {
          assist_id?: string | null
          created_at?: string | null
          id?: string
          is_own_goal?: boolean | null
          is_penalty?: boolean | null
          is_penalty_corner?: boolean | null
          match_id?: string
          minute?: number | null
          scorer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_assist_id_fkey"
            columns: ["assist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_assist_id_fkey"
            columns: ["assist_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "goals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
        ]
      }
      league_matches: {
        Row: {
          away_team_id: string | null
          created_at: string | null
          home_team_id: string | null
          id: string
          league_id: string
          match_date: string | null
          match_time: string | null
          matchday: number | null
          score_away: number | null
          score_home: number | null
          status: string | null
        }
        Insert: {
          away_team_id?: string | null
          created_at?: string | null
          home_team_id?: string | null
          id?: string
          league_id: string
          match_date?: string | null
          match_time?: string | null
          matchday?: number | null
          score_away?: number | null
          score_home?: number | null
          status?: string | null
        }
        Update: {
          away_team_id?: string | null
          created_at?: string | null
          home_team_id?: string | null
          id?: string
          league_id?: string
          match_date?: string | null
          match_time?: string | null
          matchday?: number | null
          score_away?: number | null
          score_home?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "v_league_standings"
            referencedColumns: ["league_team_id"]
          },
          {
            foreignKeyName: "league_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "v_league_standings"
            referencedColumns: ["league_team_id"]
          },
          {
            foreignKeyName: "league_matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_teams: {
        Row: {
          created_at: string | null
          id: string
          is_own_team: boolean | null
          league_id: string
          registry_id: string | null
          team_id: string | null
          team_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_own_team?: boolean | null
          league_id: string
          registry_id?: string | null
          team_id?: string | null
          team_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_own_team?: boolean | null
          league_id?: string
          registry_id?: string | null
          team_id?: string | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "clubs_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string | null
          id: string
          name: string
          season: string | null
          team_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          season?: string | null
          team_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          season?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_availability: {
        Row: {
          created_at: string | null
          id: string
          match_id: string
          note: string | null
          player_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_id: string
          note?: string | null
          player_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          match_id?: string
          note?: string | null
          player_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_availability_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_availability_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
        ]
      }
      match_cards: {
        Row: {
          card_type: string
          created_at: string | null
          id: string
          match_id: string
          minute: number | null
          player_id: string | null
        }
        Insert: {
          card_type?: string
          created_at?: string | null
          id?: string
          match_id: string
          minute?: number | null
          player_id?: string | null
        }
        Update: {
          card_type?: string
          created_at?: string | null
          id?: string
          match_id?: string
          minute?: number | null
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_cards_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_cards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
        ]
      }
      match_roster: {
        Row: {
          created_at: string | null
          id: string
          match_id: string
          player_id: string
          position_in_lineup: string | null
          roster_status: string | null
          rostered_off_reason: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_id: string
          player_id: string
          position_in_lineup?: string | null
          roster_status?: string | null
          rostered_off_reason?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          match_id?: string
          player_id?: string
          position_in_lineup?: string | null
          roster_status?: string | null
          rostered_off_reason?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_roster_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_roster_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_roster_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string | null
          gathering_note: string | null
          gathering_time: string | null
          gathering_time_override: string | null
          id: string
          is_home: boolean
          league_match_id: string | null
          location: string | null
          location_lat: number | null
          location_lng: number | null
          match_date: string
          match_time: string | null
          notes: string | null
          opponent: string
          registry_id: string | null
          score_away: number | null
          score_home: number | null
          status: string | null
          team_id: string
          travel_duration_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          gathering_note?: string | null
          gathering_time?: string | null
          gathering_time_override?: string | null
          id?: string
          is_home?: boolean
          league_match_id?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_date: string
          match_time?: string | null
          notes?: string | null
          opponent: string
          registry_id?: string | null
          score_away?: number | null
          score_home?: number | null
          status?: string | null
          team_id: string
          travel_duration_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          gathering_note?: string | null
          gathering_time?: string | null
          gathering_time_override?: string | null
          id?: string
          is_home?: boolean
          league_match_id?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          match_date?: string
          match_time?: string | null
          notes?: string | null
          opponent?: string
          registry_id?: string | null
          score_away?: number | null
          score_home?: number | null
          status?: string | null
          team_id?: string
          travel_duration_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_league_match_id_fkey"
            columns: ["league_match_id"]
            isOneToOne: true
            referencedRelation: "league_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "clubs_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean | null
          jersey_number: number | null
          nickname: string | null
          phone: string | null
          position: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean | null
          jersey_number?: number | null
          nickname?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean | null
          jersey_number?: number | null
          nickname?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_memberships: {
        Row: {
          active: boolean | null
          id: string
          joined_at: string | null
          player_id: string
          role: string
          team_id: string
        }
        Insert: {
          active?: boolean | null
          id?: string
          joined_at?: string | null
          player_id: string
          role?: string
          team_id: string
        }
        Update: {
          active?: boolean | null
          id?: string
          joined_at?: string | null
          player_id?: string
          role?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          club_id: string | null
          created_at: string | null
          gathering_lead_time: number | null
          id: string
          league_id: string | null
          match_squad_size: number | null
          name: string
          season: string | null
          short_name: string | null
          travel_buffer_minutes: number | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          gathering_lead_time?: number | null
          id?: string
          league_id?: string | null
          match_squad_size?: number | null
          name: string
          season?: string | null
          short_name?: string | null
          travel_buffer_minutes?: number | null
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          gathering_lead_time?: number | null
          id?: string
          league_id?: string | null
          match_squad_size?: number | null
          name?: string
          season?: string | null
          short_name?: string | null
          travel_buffer_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_teams_league"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      umpire_duties: {
        Row: {
          created_at: string | null
          id: string
          match_id: string | null
          notes: string | null
          player_id: string | null
          status: string | null
          team_id: string
          umpire_match_desc: string
          umpire_time: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          match_id?: string | null
          notes?: string | null
          player_id?: string | null
          status?: string | null
          team_id: string
          umpire_match_desc: string
          umpire_time?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          match_id?: string | null
          notes?: string | null
          player_id?: string | null
          status?: string | null
          team_id?: string
          umpire_match_desc?: string
          umpire_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "umpire_duties_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umpire_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umpire_duties_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "v_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "umpire_duties_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_league_standings: {
        Row: {
          draws: number | null
          goals_against: number | null
          goals_for: number | null
          is_own_team: boolean | null
          league_id: string | null
          league_team_id: string | null
          losses: number | null
          played: number | null
          points: number | null
          primary_color: string | null
          team_id: string | null
          team_name: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v_player_stats: {
        Row: {
          assists: number | null
          full_name: string | null
          goals: number | null
          matches_played: number | null
          player_id: string | null
          team_id: string | null
          times_available: number | null
          times_rostered_off: number | null
          times_unavailable: number | null
          umpire_duties: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_email_exists: { Args: { p_email: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_team_admin: { Args: { p_team_id: string }; Returns: boolean }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
