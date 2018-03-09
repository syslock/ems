import itertools, json
from lib import user

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	result = { "session" : session.parms }
	result = dict( itertools.chain(result.items(), app.user.status().items()) )
	response.output = json.dumps( result )

