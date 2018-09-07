#!/usr/bin/python3

import subprocess, sqlite3, os, time, re

ems_db = "ems.db"
phpbb_db = "phpbb.db"
avatar_path = "phpbb_images/avatars/upload"
smilies_path = "phpbb_images/smilies"
files_path = "phpbb_files"

default_password_hash = "Ia56nGWe|026390949e48a5252d2f079b341249fc3845010dbc2f093939c20c62ec2a3fa1" # admin

# alte Datenbank wegräumen:
subprocess.run( "rm "+ems_db, shell=True )
# alte Dateien wegräumen:
subprocess.run( "rm -r upload", shell=True )
subprocess.run( "mkdir upload", shell=True )
# neue Datenbank initialisieren:
subprocess.run( "cat ems-init.sql |sqlite3 "+ems_db, shell=True )
# phpbb aus sqlite-2-datenbank exportieren und in 
# sqlite-3-datenbank unserer anwendung importeren:
subprocess.run( "echo '.dump' |sqlite %(phpbb_db)s |sqlite3 %(ems_db)s" % locals(), shell=True )

file_types = set()

db = sqlite3.connect( ems_db )
c_write = db.cursor()
c_read = db.cursor()


ems_smiley_id_by_code = {}

c_read.execute( """select code, emotion, smiley_url from phpbb_smilies""" )
for row in c_read:
	code, emotion, smiley_url = row
	smiley_type = "image/gif"
	c_write.execute( """insert into objects (type, ctime, mtime) values (?, ?, ?)""", [smiley_type, time.time(), time.time()] )
	ems_smiley_id = c_write.lastrowid
	file_types.add( smiley_type )
	c_write.execute( """insert into membership (parent_id, child_id) values (4, ?)""", [ems_smiley_id] )
	c_write.execute( """insert into titles (object_id, data) values (?, ?)""", [ems_smiley_id, code+"   "+emotion] )
	# PHPBB-Codes für Anhänge mit EMS-Objekt-Referenzen ersetzen:
	old_file_path = os.path.join( smilies_path, smiley_url )
	new_file_path = os.path.join( "upload", str(ems_smiley_id) )
	subprocess.run( "cp -a %(old_file_path)s %(new_file_path)s" % locals(), shell=True )
	ems_smiley_id_by_code[ code ] = ems_smiley_id


uid_phpbb_to_ems = {}
uid_ems_to_phpbb = {}

c_read.execute( """select user_id, user_regdate, username, user_email, user_avatar from phpbb_users where user_posts>0""" )
for row in c_read:
	user_id, user_regdate, username, user_email, user_avatar = row
	c_write.execute( """insert into objects (type, ctime, mtime) values ('application/x-obj.user', ?, ?)""", 
		[user_regdate,user_regdate] )
	ems_user_id = c_write.lastrowid
	c_write.execute( """insert into membership (parent_id, child_id) values (1, ?)""", [ems_user_id] )
	c_write.execute( """insert into membership (parent_id, child_id) values (6, ?)""", [ems_user_id] )
	c_write.execute( """insert into permissions (subject_id, access_mask, object_id) values (?, 3, ?)""", [ems_user_id, ems_user_id] )
	uid_phpbb_to_ems[ user_id ] = ems_user_id
	uid_ems_to_phpbb[ ems_user_id ] = user_id
	c_write.execute( """insert into users (object_id, nick, email, password) values (?,?,?,?)""", 
		[ems_user_id, username, user_email, default_password_hash] )
	for f in os.listdir( avatar_path ):
		if f.endswith(".jpg") or f.endswith(".jpeg"):
			img_type = "image/jpeg"
			name_prefix = "".join( f.split(".")[:-1] )
			phpbb_user_id = int( name_prefix.split("_")[-1] )
			if phpbb_user_id==user_id:
				c_write.execute( """insert into objects (type, ctime, mtime) values (?, ?, ?)""", [img_type, time.time(), time.time()] )
				file_types.add( img_type )
				img_id = c_write.lastrowid
				c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_user_id, img_id] )
				c_write.execute( """update users set avatar_id=? where object_id=?""", [img_id, ems_user_id] )
				old_img_path = os.path.join( avatar_path, f )
				new_img_path = os.path.join( "upload", str(img_id) )
				subprocess.run( "cp -a %(old_img_path)s %(new_img_path)s" % locals(), shell=True )


tid_phpbb_to_ems = {}
tid_ems_to_phpbb = {}

c_read.execute( """select topic_id, topic_title, topic_time from phpbb_topics""" )
for row in c_read:
	topic_id, topic_title, topic_time = row
	c_write.execute( """insert into objects (type, ctime, mtime) values ('application/x-obj.tag', ?, ?)""",
		[topic_time, topic_time] )
	ems_topic_id = c_write.lastrowid
	c_write.execute( """insert into membership (parent_id, child_id) values (1, ?)""", [ems_topic_id] )
	c_write.execute( """insert into membership (parent_id, child_id) values (5, ?)""", [ems_topic_id] )
	tid_phpbb_to_ems[ topic_id ] = ems_topic_id
	tid_ems_to_phpbb[ ems_topic_id ] = topic_id
	c_write.execute( """insert into titles (object_id, data) values (?, ?)""", [ems_topic_id, topic_title] )


eid_phpbb_to_ems = {}
eid_ems_to_phpbb = {}

c_read.execute( """select post_id, post_time, post_edit_time, poster_id, post_subject, post_text, bbcode_uid, topic_id from phpbb_posts""" )
for row in c_read:
	post_id, post_time, post_edit_time, poster_id, post_subject, post_text, bbcode_uid, topic_id = row
	# in EMS gilt: mtime>=ctime
	if post_edit_time==0:
		post_edit_time = post_time
	# Zeilenumbrüche:
	post_text = post_text.replace( "\n", "<br/>" )
	post_text = re.sub( r'\[size=([0-9]+)(?::[^]]*)?\](.*?)\[/size(?::[^]]*)?\]', r'<span style="font-size:\1%">\2</span>', post_text )
	post_text = re.sub( r'\[url=([^]:]*)(?::[^]]*)?\](.*?)\[/url(?::[^]]*)?\]', r'<a href="\1" target="_blank">\2</a>', post_text )
	post_text = re.sub( r'\[url(?::[^]]*)?\](.*?)\[/url(?::[^]]*)?\]', r'<a href="\1" target="_blank">\1</a>', post_text )
	post_text = re.sub( r'\[b(?::[^]]*)?\](.*?)\[/b(?::[^]]*)?\]', r'<b>\1</b>', post_text )
	post_text = re.sub( r'\[u(?::[^]]*)?\](.*?)\[/u(?::[^]]*)?\]', r'<u>\1</u>', post_text )
	post_text = re.sub( r'\[i(?::[^]]*)?\](.*?)\[/i(?::[^]]*)?\]', r'<i>\1</i>', post_text )
	post_text = re.sub( r'\[s(?::[^]]*)?\](.*?)\[/s(?::[^]]*)?\]', r'<s>\1</s>', post_text )
	post_text = re.sub( r'\[quote=&quot;([^]:]+)?&quot;(?::[^]]*)?\]', r'<div class="block-quote"><b>\1 hat geschrieben:</b><br/>', post_text )
	post_text = re.sub( r'\[quote(?::[^]]*)?\]', r'<div class="block-quote">', post_text )
	post_text = re.sub( r'\[/quote(?::[^]]*)?\]', r'</div>', post_text )
	post_text = re.sub( r'\[code(?::[^]]*)?\]', r'<div class="block-code">', post_text )
	post_text = re.sub( r'\[/code(?::[^]]*)?\]', r'</div>', post_text )
	post_text = re.sub( r'\[img(?::[^]]*)?\](.*?)\[/img(?::[^]]*)?\]', r'<img class="entry-media" src="\1" />', post_text )
	post_text = re.sub( r'\[color=(#[0-9a-fA-F]+)(?::[^]]*)?\](.*?)\[/color(?::[^]]*)?\]', r'<span style="color:\1">\2</span>', post_text )
	post_text = re.sub( r'\[list(?::[^]]*)?\]', r'<ul>', post_text )
	post_text = re.sub( r'\[/list(?::[^]]*)?\]', r'</ul>', post_text )
	post_text = re.sub( r'\[\*(?::[^]]*)?\](.*?)\[/\*(?::[^]]*)?\]', r'<li>\1</li>', post_text )
	post_text = re.sub( r'\[osm(?::[^]]*)?\](.*?)\[/osm(?::[^]]*)?\]', r'<br/>', post_text ) # FIXME: Custom-BB-Code, der nur 1 mal vorkommt
	c_write.execute( """insert into objects (type, ctime, mtime) values ('application/x-obj.entry', ?, ?)""",
		[post_time, post_edit_time] )
	ems_entry_id = c_write.lastrowid
	ems_user_id = uid_phpbb_to_ems[ poster_id ]
	c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_user_id, ems_entry_id] )
	if topic_id in tid_phpbb_to_ems:
		ems_topic_id = tid_phpbb_to_ems[topic_id]
		c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_entry_id, ems_topic_id] )
	eid_phpbb_to_ems[ post_id ] = ems_entry_id
	eid_ems_to_phpbb[ ems_entry_id ] = post_id
	c_write.execute( """insert into titles (object_id, data) values (?, ?)""", [ems_entry_id, post_subject] )
	c_write.execute( """insert into objects (type, ctime, mtime) values ('text/html', ?, ?)""", [post_time, post_edit_time] )
	ems_content_id = c_write.lastrowid
	c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_entry_id, ems_content_id] )
	for smiley_code, ems_smiley_id in ems_smiley_id_by_code.items():
		pattern = """<!-- s%s -->.*?<!-- s%s -->""" % (re.escape(smiley_code), re.escape(smiley_code))
		smiley_ref = "<div class=\"objref inline\" oid=\"%(ems_smiley_id)d\"></div>" % locals()
		new_post_text = re.sub( pattern, smiley_ref, post_text )
		if new_post_text!=post_text:
			post_text = new_post_text
			c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_content_id, ems_smiley_id] )
	c_read_2 = db.cursor()
	c_read_2.execute( """select attach_id, post_msg_id, poster_id, physical_filename, real_filename, attach_comment, filetime, mimetype from phpbb_attachments where post_msg_id=? order by attach_id desc""", [post_id] )
	for attach_num, row in enumerate(c_read_2):
		attach_id, post_msg_id, poster_id, physical_filename, real_filename, attach_comment, filetime, mimetype = row
		c_write.execute( """insert into objects (type, ctime, mtime) values (?, ?, ?)""", [mimetype, filetime, filetime] )
		file_types.add( mimetype )
		ems_file_id = c_write.lastrowid
		c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_content_id, ems_file_id] )
		c_write.execute( """insert into membership (parent_id, child_id) values (?, ?)""", [ems_user_id, ems_file_id] )
		c_write.execute( """insert into titles (object_id, data) values (?, ?)""", [ems_file_id, real_filename] )
		# PHPBB-Codes für Anhänge mit EMS-Objekt-Referenzen ersetzen:
		post_text = re.sub( r"\[attachment=%(attach_num)d:%(bbcode_uid)s\].*?\[/attachment:%(bbcode_uid)s\]" % locals(), 
						"<div class=\"objref\" oid=\"%(ems_file_id)d\"></div><div>%(attach_comment)s</div>" % locals(), post_text )
		old_file_path = os.path.join( files_path, physical_filename )
		new_file_path = os.path.join( "upload", str(ems_file_id) )
		subprocess.run( "cp -a %(old_file_path)s %(new_file_path)s" % locals(), shell=True )
	c_write.execute( """insert into text (object_id, data) values (?, ?)""", [ems_content_id, post_text] )

# FIXME: eingefügte Dateitypen hinterlegen, da sie sonst nicht abgerufen werden können:
for file_type in file_types:
	c_write.execute( """insert into type_hierarchy (base_type, derived_type) values ('application/octet-stream', ?)""", [file_type] )

db.commit()
db.close()

subprocess.run( "chmod g+rw %(ems_db)s" % locals(), shell=True )
subprocess.run( "sudo chown :http %(ems_db)s" % locals(), shell=True )
subprocess.run( "python rebuild_search_index.py", shell=True )
subprocess.run( "chmod g+rwX upload/" % locals(), shell=True )
subprocess.run( "sudo chown :http upload" % locals(), shell=True )
