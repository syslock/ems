from lib import password
from lib import user
from lib import application

def process( app ):
	"""Autorisierung der Session eines gültigen Nutzers, sonst Ausnahme"""
	usr = check_login( app )
	if not usr.can_read( usr.id ):
		# deaktivierter Nutzer oder sonstiges Rechteproblem
		raise Exception( "Insufficient privileges" )
	else:
		# Um Upgrade fremder Sessions (z.B. Link-Sessions) zu vermeiden,
		# legen wir für jeden erfolgreichen Login-Vorgang eine neue an:
		app.session = application.Session( app )
		app.session.parms["user_id"] = str(usr.id)
		app.session.store()
		app.response.output = str( {"succeeded":True} )

def check_login( app ):
	"""Gibt nach Prüfung von Nutzername und Passwort ein User-Objekt zurück, sonst Ausnahme"""
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
		usr = user.User( app, user_id=user_id )
		return usr
	else:
		raise Exception( "Missing user name or password" )
