import imp, itertools
from lib import user
user = imp.reload( user )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	
	result = { "session" : session.parms }
	
	if "user_id" in session.parms:
		user_id = int( session.parms["user_id"] )
		usr = user.User( app, user_id=user_id )
		result = dict( itertools.chain(result.items(), usr.status().items()) )
	response.output = str( result )

