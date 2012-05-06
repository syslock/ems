import sqlite3, time, re, socket, imp
from lib import password
password = imp.reload( password ) # DEBUG

# CREATE TABLE users (object_id NUMERIC REFERENCES objects(id) ON UPDATE CASCADE ON DELETE CASCADE, nick TEXT UNIQUE, email TEXT, fullname TEXT, password TEXT)

def check( app, nick, password, email, fullname ):
	con = sqlite3.connect( app.db_path )
	c = con.cursor()
	c.execute( """select object_id from users where nick=?""", [nick] )
	if c.fetchall():
		c.close()
		raise Exception( "Nick already in use" )
	if len(password)<6:
		raise Exception( "Password has to be at least 6 characters long" )
	if not re.findall( "[a-zA-Z]", password ):
		raise Exception( "Password must contain latin letters" )
	if not re.findall( "[0-9]", password ):
		raise Exception( "Password must contain decimal digits" )
	if not re.findall( "[^a-zA-Z0-9]", password ):
		raise Exception( "Password must contain special charactes" )
	if not "@" in email:
		raise Exception( "Invalid email address" )
	name, host = email.split("@")
	if not name or not host:
		raise Exception( "Invalid email address" )
	socket.gethostbyname( host ) # Wirft Socket-Error bei unauflösbaren Hostnamen
	if not fullname:
		raise Exception( "Full name must not be empty" )
	return True

def create( app, nick, plain_password, email, fullname ):
	check( app, nick, plain_password, email, fullname )
	con = sqlite3.connect( app.db_path )
	c = con.cursor()
	c.execute( """insert into objects (type,mtime) values (?,?)""",
				("application/x-obj.user", time.time()) )
	object_id = c.lastrowid
	encrypted_password = password.encrypt( plain_password )
	try:
		c.execute( """insert into users (object_id,nick,password,email,fullname)
						values (?,?,?,?,?)""",
					[object_id, nick, encrypted_password,
					 email, fullname] )
	except sqlite3.IntegrityError as e:
		c.close()
		raise Exception( "Nick already in use" )
	con.commit()
	c.close()
	return object_id

def can_read( app, user_id, object_id=None ):
	return can_access( app, user_id, object_id, "read" )
def can_write( app, user_id, object_id=None ):
	return can_access( app, user_id, object_id, "write" )
def can_access( app, user_id, object_id, access_type ):
	if access_type not in ("read", "write"):
		raise NotImplementedError( "Unsupported access_type" )
	con = sqlite3.connect( app.db_path )
	c = con.cursor()
	# mehrstufiger join zur gleichzeitigen Auflösung von bis zu 10
	# Verschachtelungsstufen der jeweiligen Zugriffsgruppe:
	object_constraint = "1=1"
	null_access = "1=0"
	if object_id!=None:
		object_constraint = "o.id=%(object_id)d" % locals()
		null_access = "o.%(access_type)s is null" % locals()
	c.execute( """select o.id, o.%(access_type)s from objects o
					left join membership m0 on o.%(access_type)s=m0.parent_id
					left join membership m1 on m0.child_id=m1.parent_id
					left join membership m2 on m1.child_id=m2.parent_id
					left join membership m3 on m2.child_id=m3.parent_id
					left join membership m4 on m3.child_id=m4.parent_id
					left join membership m5 on m4.child_id=m5.parent_id
					left join membership m6 on m5.child_id=m6.parent_id
					left join membership m7 on m6.child_id=m7.parent_id
					left join membership m8 on m7.child_id=m8.parent_id
					left join membership m9 on m8.child_id=m9.parent_id
					where %(object_constraint)s
						and (%(null_access)s
							or o.%(access_type)s=%(user_id)d
							or m0.child_id=%(user_id)d
							or m1.child_id=%(user_id)d
							or m2.child_id=%(user_id)d
							or m3.child_id=%(user_id)d
							or m4.child_id=%(user_id)d
							or m5.child_id=%(user_id)d
							or m6.child_id=%(user_id)d
							or m7.child_id=%(user_id)d
							or m8.child_id=%(user_id)d
							or m9.child_id=%(user_id)d
							)""" \
				% locals() )
	if object_id==None:
		# Falls keine object_id übergeben wurde, geben wir die direkt
		# entsprechend zugreifbaren Object-IDs, zusammen mit den dafür
		# verantwortlichen Zugriffs-IDs zurück 
		return c.fetchall()
	result = c.fetchone()
	if not result:
		return False
	access_id = result[1]
	if access_id == None:
		parent_id = None
		c.execute( """select m.parent_id from objects o
						left join membership m on o.id=m.child_id
						where o.id=?""", [object_id] )
		for row in c:
			parent_id = row[0]
			if parent_id == object_id \
			or not can_access( app, user_id, parent_id, access_type ):
				return False
		if parent_id == None:
			return False
	return True

def grant_read( app, user_id, object_id ):
	grant_access( app, user_id, object_id, "read" )
def grant_write( app, user_id, object_id ):
	grant_access( app, user_id, object_id, "write" )
def grant_access( app, user_id, object_id, access_type ):
	if access_type not in ("read", "write"):
		raise NotImplementedError( "Unsupported access_type" )
	con = sqlite3.connect( app.db_path )
	c = con.cursor()
	c.execute( """update objects set %(access_type)s=? where id=?""" \
					% locals(),
				[user_id, object_id] )
	con.commit()
	c.close()

