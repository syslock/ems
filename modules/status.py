import imp
from lib import user
user = imp.reload( user )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	
	result = { "session" : session.parms }
	
	if "user_id" in session.parms:
		user_id = int( session.parms["user_id"] )
		c = app.db.cursor()
		c.execute( """select object_id, nick, email from users where object_id=?""", 
					[user_id] )
		for row in c:
			result["login"] = { 
				"id" : row[0],
				"nick" : row[1],
				"email" : row[2] }
		visible_objects = []
		for row in user.can_read( app, user_id ):
			visible_objects.append( row[0] )
		result["visible_objects"] = visible_objects

	response.output = str( result )

