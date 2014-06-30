import sqlite3

def process( app ):
	"""Löschung aller Session-Parameter für an Nutzer gebundene Session"""
	query = app.query
	response = app.response
	session = app.session
	if "user_id" in session.parms:
		session.parms = {}
		session.store()
		response.output = str( {"succeeded":True} )
	else:
		raise Exception( "Insufficient privileges" )
	

