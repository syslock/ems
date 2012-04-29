import sqlite3

def process( app ):
	"""Löschung der Session-Autorisierung"""
	query = app.query
	response = app.response
	session = app.session
	if "user_id" in session.parms:
		del session.parms["user_id"]
		session.store()
		response.output = str( {"succeeded":True} )
	else:
		raise Exception( "Insufficient privileges" )
	

