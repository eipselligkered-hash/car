// Same Supabase project as the Chores app (same login); the car data lives in the car_* tables.
// The anon key is safe to publish (row-level security protects the data). NEVER put the service_role key here.
window.CAR_CONFIG = {
  backend: 'auto',   // 'auto' = Supabase when filled in, otherwise a local mock (this device only)
  supabaseUrl: 'https://rwbiizjwvyssdyxjuqan.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Ymlpemp3dnlzc2R5eGp1cWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTc0MDMsImV4cCI6MjEwNzg5MzQwM30.E5QFlaM434SRXo8ygcT_gmIfI2ntxQhxR20JAaaiOWk',
  car: { name: 'Tesla Model 3 (2023, white)', reg: '231-D-43971' },
};
