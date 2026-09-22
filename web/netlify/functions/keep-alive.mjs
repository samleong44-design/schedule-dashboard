// Keeps the free-tier Supabase project awake: it pauses after ~7 idle days,
// and one lightweight REST read a day counts as activity.
export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const res = await fetch(`${url}/rest/v1/carriers?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(`Supabase keep-alive: ${res.status}`);
  return new Response(res.ok ? "ok" : `supabase ${res.status}`, {
    status: res.ok ? 200 : 500,
  });
};

// 01:00 UTC daily = 9:00 AM MYT
export const config = { schedule: "0 1 * * *" };
