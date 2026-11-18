// Built-in connection for the team dictionary service.
//
// The project URL and the PUBLIC "anon" key are safe to publish ONLY because
// supabase/team-access.sql makes the database read-only for this key: editing
// requires signing in as the team account below. Never put a service-role key here.
export const TEAM_SUPABASE = Object.freeze({
  url: "https://fccwobrsfjmnqjwflqev.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjY3dvYnJzZmptbnFqd2ZscWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDE3MTgsImV4cCI6MjA5NTkxNzcxOH0.9Ak8QPMLIyi_rKlMrCeXfOW8VhUkjD2JGgcfNNF8kqw",
});

/** The shared team account. Authors only type its password; the email is fixed. */
export const TEAM_EMAIL = "dreamscape@hearsay.team";
