import imp
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
		c = app.db.cursor()
		result = c.execute( 
			"""select object_id, password from users where nick=?""",
			[query.parms["nick"]] ).fetchone()
		if not result:
			raise Exception( "Invalid user name or password" )
		user_id, encrypted_password = result
		if not user_id or not encrypted_password \
		or not password.check( password=query.parms["password"], 
								encrypted_password=encrypted_password ):
			raise Exception( "Invalid user name or password" )
		usr = user.User( app, user_id )
		if not usr.can_read( user_id ):
			raise Exception( "Insufficient privileges" )
		session.parms["user_id"] = str(usr.id)
		session.store()
		response.output = str( {"succeeded":True} )
	else:
		raise Exception( "Missing user name or password" )

