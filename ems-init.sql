-- REFERENCES objects(id) ON UPDATE CASCADE ON DELETE CASCADE
CREATE TABLE session_parms (sid TEXT, key TEXT, value TEXT, mtime NUMERIC, UNIQUE (sid, key) ON CONFLICT REPLACE);
CREATE TABLE users (object_id NUMERIC, nick TEXT UNIQUE, email TEXT, password TEXT, avatar_id NUMERIC);
CREATE TABLE groups (object_id NUMERIC, name TEXT UNIQUE, description TEXT);
CREATE TABLE text (object_id NUMERIC, data TEXT);
CREATE TABLE membership (parent_id NUMERIC, child_id NUMERIC );
CREATE INDEX i_membership_p_id ON membership(parent_id ASC);
CREATE INDEX i_membership_c_id ON membership(child_id ASC);
CREATE TABLE objects (id INTEGER PRIMARY KEY, type TEXT, sequence NUMERIC NOT NULL DEFAULT 0, ctime NUMERIC, mtime NUMERIC);
CREATE UNIQUE INDEX i_objects_id ON objects(id ASC);
CREATE INDEX i_objects_type ON objects(type ASC);
CREATE INDEX i_objects_sequence ON objects(sequence ASC);
CREATE INDEX i_objects_ctime ON objects(ctime ASC);
CREATE INDEX i_objects_mtime ON objects(mtime ASC);
CREATE TABLE titles (object_id NUMBER, data TEXT);
CREATE UNIQUE INDEX i_titles_id ON titles(object_id ASC);
CREATE TABLE applications (object_id NUMERIC, user_id NUMERIC, statement_id NUMERIC, motivation_id NUMERIC, motto_id NUMERIC, university_name TEXT, study_field TEXT, study_finish_year NUMERIC, study_finish_month NUMERIC, accommodation TEXT, food TEXT, abstract_id NUMERIC);
CREATE TABLE contacts (object_id NUMERIC, user_id NUMERIC, name_title TEXT, first_name TEXT, surname TEXT, birth_year NUMERIC, birth_month NUMERIC, birth_day NUMERIC, gender TEXT, nationality TEXT, country TEXT, region TEXT, city TEXT, postal_code TEXT, street TEXT, telephone1 TEXT, telephone2 TEXT);
CREATE TABLE permissions (subject_id NUMERIC, access_mask NUMERIC, object_id NUMERIC);
CREATE INDEX i_permissions_subj_id ON permissions(subject_id ASC);
CREATE INDEX i_permissions_acc_mask ON permissions(access_mask ASC);
CREATE INDEX i_permissions_obj_id ON permissions(object_id ASC);
CREATE TABLE type_hierarchy (base_type TEXT, derived_type TEXT, UNIQUE (base_type, derived_type) ON CONFLICT REPLACE);

INSERT INTO objects (id,type) VALUES(1,'application/x-obj.group');
INSERT INTO groups (object_id,name,description) VALUES(1,'root','Root object for everything else');

INSERT INTO objects (id,type) VALUES(2,'application/x-obj.user');
INSERT INTO users (object_id,nick,password) VALUES(2,'admin','Ia56nGWe|026390949e48a5252d2f079b341249fc3845010dbc2f093939c20c62ec2a3fa1');
INSERT INTO membership (parent_id,child_id) VALUES(1,2);
INSERT INTO permissions (subject_id,access_mask,object_id) VALUES(2,3,1);
INSERT INTO permissions (subject_id,access_mask,object_id) VALUES(2,3,2);

INSERT INTO objects (id,type) VALUES(3,'application/x-obj.user');
INSERT INTO users (object_id,nick) VALUES(3,'anonymous');
INSERT INTO membership (parent_id,child_id) VALUES(1,3);
