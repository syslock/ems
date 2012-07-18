-- REFERENCES objects(id) ON UPDATE CASCADE ON DELETE CASCADE
CREATE TABLE session_parms (sid TEXT, key TEXT, value TEXT, mtime NUMERIC, UNIQUE (sid, key) ON CONFLICT REPLACE);
CREATE TABLE users (object_id NUMERIC, nick TEXT UNIQUE, email TEXT, password TEXT);
CREATE TABLE text (object_id NUMERIC, data TEXT);
CREATE TABLE membership (parent_id NUMERIC, child_id NUMERIC );
CREATE TABLE objects (id INTEGER PRIMARY KEY, type TEXT, sequence NUMERIC NOT NULL DEFAULT 0, mtime NUMERIC);
CREATE TABLE titles (object_id NUMBER, data TEXT);
CREATE TABLE applications (object_id NUMERIC, user_id NUMERIC, statement_id NUMERIC, motivation_id NUMERIC, motto_id NUMERIC, university_name TEXT, study_field TEXT, study_years NUMERIC, study_finish NUMERIC, topic1_id NUMERIC, topic2_id NUMERIC, topic3_id NUMERIC, accommodation TEXT, food TEXT, comment TEXT, abstract_id NUMERIC, cultural_id NUMERIC, conferences_id NUMERIC);
CREATE TABLE contacts (object_id NUMERIC, user_id NUMERIC, name_title TEXT, first_name TEXT, surname TEXT, birthday NUMERIC, gender TEXT, nationality TEXT, country TEXT, region TEXT, city TEXT, postal_code TEXT, street TEXT, telephone1 TEXT, telephone2 TEXT);
CREATE TABLE permissions (subject_id NUMERIC, access_mask NUMERIC, object_id NUMERIC);
