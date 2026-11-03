-- Skema database. Aman dijalankan berulang (IF NOT EXISTS), dipakai saat database dibuat dan saat deploy ulang.
CREATE TABLE IF NOT EXISTS surveyors (
  id uuid PRIMARY KEY, nama text, username text UNIQUE, password_hash text,
  role text NOT NULL DEFAULT 'surveyor'       -- surveyor | admin (surveyor hanya kirim, admin membaca)
);
CREATE TABLE IF NOT EXISTS surveys (
  id uuid PRIMARY KEY,                        -- UUID dari aplikasi
  surveyor_id uuid REFERENCES surveyors(id),
  data jsonb NOT NULL,                        -- isi form apa adanya
  lat double precision, lng double precision, accuracy_m int,
  created_at timestamptz, received_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS photos (
  survey_id uuid REFERENCES surveys(id), type text, path text, size int,
  PRIMARY KEY (survey_id, type)
);

CREATE INDEX IF NOT EXISTS surveys_created_at_idx ON surveys (created_at);
CREATE INDEX IF NOT EXISTS surveys_surveyor_idx ON surveys (surveyor_id);

-- Langkah 8: log siapa membuka foto siapa dan kapan
CREATE TABLE IF NOT EXISTS photo_access_log (
  id bigserial PRIMARY KEY,
  survey_id uuid, type text,
  admin_id uuid REFERENCES surveyors(id),
  accessed_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_access_log_survey_idx ON photo_access_log (survey_id);

-- Jejak audit penghapusan survei oleh admin (UU PDP): siapa, kapan, mengapa.
-- Hanya ringkasan yang disimpan, bukan NIK/foto, agar penghapusan data pribadi tetap berarti.
CREATE TABLE IF NOT EXISTS survey_deletion_log (
  id bigserial PRIMARY KEY,
  survey_id uuid NOT NULL,
  nama text, kelurahan text,
  surveyor_id uuid, surveyor text,
  survey_created_at timestamptz,
  alasan text NOT NULL,
  admin_id uuid REFERENCES surveyors(id),
  deleted_at timestamptz DEFAULT now()
);
