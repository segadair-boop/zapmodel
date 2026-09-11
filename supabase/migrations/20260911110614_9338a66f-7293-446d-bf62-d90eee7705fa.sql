ALTER TABLE public."Contact" ALTER COLUMN number DROP NOT NULL;
ALTER TABLE public."Schedule" ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public."Schedule" ADD COLUMN IF NOT EXISTS "lastError" text;