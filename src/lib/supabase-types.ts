export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          firebase_uid: string | null;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          location: string | null;
          is_guest: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          firebase_uid?: string | null;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          location?: string | null;
          is_guest?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          firebase_uid?: string | null;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          location?: string | null;
          is_guest?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      sake: {
        Row: {
          id: string;
          name: string;
          name_japanese: string | null;
          brewery: string;
          type: string | null;
          subtype: string | null;
          region: string | null;
          prefecture: string | null;
          description: string | null;
          rice_variety: string | null;
          polishing_ratio: number | null;
          alcohol_percentage: number | null;
          smv: number | null;
          acidity: number | null;
          label_image_url: string | null;
          bottle_image_url: string | null;
          average_rating: number | null;
          total_ratings: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          name_japanese?: string | null;
          brewery: string;
          type?: string | null;
          subtype?: string | null;
          region?: string | null;
          prefecture?: string | null;
          description?: string | null;
          rice_variety?: string | null;
          polishing_ratio?: number | null;
          alcohol_percentage?: number | null;
          smv?: number | null;
          acidity?: number | null;
          label_image_url?: string | null;
          bottle_image_url?: string | null;
          average_rating?: number | null;
          total_ratings?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          name_japanese?: string | null;
          brewery?: string;
          type?: string | null;
          subtype?: string | null;
          region?: string | null;
          prefecture?: string | null;
          description?: string | null;
          rice_variety?: string | null;
          polishing_ratio?: number | null;
          alcohol_percentage?: number | null;
          smv?: number | null;
          acidity?: number | null;
          label_image_url?: string | null;
          bottle_image_url?: string | null;
          average_rating?: number | null;
          total_ratings?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      scans: {
        Row: {
          id: string;
          user_id: string;
          sake_id: string | null;
          scanned_image_url: string | null;
          ocr_raw_text: string | null;
          matched: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sake_id?: string | null;
          scanned_image_url?: string | null;
          ocr_raw_text?: string | null;
          matched?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sake_id?: string | null;
          scanned_image_url?: string | null;
          ocr_raw_text?: string | null;
          matched?: boolean;
          created_at?: string;
        };
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          sake_id: string;
          rating: number;
          review_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          sake_id: string;
          rating: number;
          review_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sake_id?: string;
          rating?: number;
          review_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

export type Sake = Database['public']['Tables']['sake']['Row'];
export type SakeInsert = Database['public']['Tables']['sake']['Insert'];
export type SakeUpdate = Database['public']['Tables']['sake']['Update'];

export type User = Database['public']['Tables']['users']['Row'];
export type Scan = Database['public']['Tables']['scans']['Row'];
export type Rating = Database['public']['Tables']['ratings']['Row'];
