import sqlite3, imp
from lib import password
password = imp.reload( password )
from lib import user
user = imp.reload( user )

def process( app ):
	"""Prüfung von Nutzername und Passwort und ggf. Autorisierung der Session"""	
	query = app.query
	response = app.response
	session = app.session
	if "nick" in query.parms and "password" in query.parms:
		con = sqlite3.connect( app.db_path )
		c = con.cursor()
		result = c.execute( 
			"""select object_id, password from users where nick=?""",
			[query.parms["nick"]] ).fetchone()
		c.close()
		if not result:
			raise Exception( "Invalid user name or password" )
		user_id, encrypted_password = result
		if not user_id or not encrypted_password \
		or not password.check( password=query.parms["password"], 
								encrypted_password=encrypted_password ):
			raise Exception( "Invalid user name or password" )
		if not user.can_read( app, user_id, user_id ):
			raise Exception( "Insufficient privileges" )
		session.parms["user_id"] = str(user_id)
		session.store()
		response.output = str( {"succeeded":True} )
	else:
		raise Exception( "Missing user name or password" )

