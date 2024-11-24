import { SupabaseClient } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface User {
      iss: string;
      sub: string;
      aud: string;
      exp: number;
      iat: number;
      email: string;
      phone: string;
      app_metadata: {
        provider: string;
        providers: string[];
      };
      user_metadata: {
        displayName: string;
        email: string;
        email_verified: boolean;
        phone_verified: boolean;
        sub: string;
        username: string;
      };
      role: string;
      aal: string;
      amr: object[];
      session_id: string;
      is_anonymous: boolean;
    }
    interface Request {
      supabase: SupabaseClient;
      files: {
        avatar?: Express.Multer.File[];
        cover?: Express.Multer.File[];
      };
      user: User; // Optional user property
      userId: string; // Optional userId derived from the user sub
    }
  }
}
