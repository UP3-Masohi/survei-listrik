CREATE TABLE surveyors (
  id uuid PRIMARY KEY, nama text, username text UNIQUE, password_hash text,
  role text NOT NULL DEFAULT 'surveyor'       -- surveyor | admin (surveyor hanya kirim, admin membaca)
);
CREATE TABLE surveys (
  id uuid PRIMARY KEY,                        -- UUID dari aplikasi
  surveyor_id uuid REFERENCES surveyors(id),
  data jsonb NOT NULL,                        -- isi form apa adanya
  lat double precision, lng double precision, accuracy_m int,
  created_at timestamptz, received_at timestamptz DEFAULT now()
);
CREATE TABLE photos (
  survey_id uuid REFERENCES surveys(id), type text, path text, size int,
  PRIMARY KEY (survey_id, type)
);

CREATE INDEX surveys_created_at_idx ON surveys (created_at);
CREATE INDEX surveys_surveyor_idx ON surveys (surveyor_id);
