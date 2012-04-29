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
	parent_id=0
	c.execute( """insert into objects (parent,type,mtime) values (?,?,?)""",
				(parent_id, "application/x-obj.user", time.time()) )
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

def can_read( app, user_id, object_id ):
	return can_access( app, user_id, object_id, "read" )
def can_write( app, user_id, object_id ):
	return can_access( app, user_id, object_id, "write" )
def can_access( app, user_id, object_id, access_type ):
	if access_type not in ("read", "write"):
		raise NotImplementedError( "Unsupported access_type" )
	con = sqlite3.connect( app.db_path )
	c = con.cursor()
	c.execute( """select o.%(access_type)s, o.parent from objects o
					left join objects g on o.%(access_type)s=g.id
					left join objects u on g.id=u.parent
					where o.id=? and (o.%(access_type)s is null or g.id=? or u.id=?)""" \
					% locals(),
				[object_id, user_id, user_id] )
	result = c.fetchone()
	if not result:
		return False
	access_id, parent_id = result
	if not access_id:
		return can_access( app, user_id, parent_id, access_type )
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

