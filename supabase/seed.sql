-- Seed departments
INSERT INTO public.departments (name) VALUES
  ('Computer Science & Engineering'),
  ('Electronics & Communication Engineering'),
  ('Electrical & Electronics Engineering'),
  ('Mechanical Engineering'),
  ('Information Technology')
ON CONFLICT (name) DO NOTHING;
