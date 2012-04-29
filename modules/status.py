import sqlite3

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	
	result = { "session" : session.parms }
	
	if "user_id" in session.parms:
		user_id = int( session.parms["user_id"] )
		con = sqlite3.connect( app.db_path )
		c = con.cursor()
		c.execute( """select object_id, nick, email, fullname from users where object_id=?""", 
					[user_id] )
		for row in c:
			result["login"] = { 
				"id" : row[0],
				"nick" : row[1],
				"email" : row[2],
				"fullname" : row[3] }
		c.execute( """select distinct o.id, o.type from objects o 
						left join objects g on o.read=g.id
						left join objects u on g.id=u.parent
						where g.id=? or u.id=?""",
						[user_id,user_id] )
		visible_objects = []
		for row in c:
			visible_objects.append( {"id" : row[0], "type" : row[1]} )
		result["visible_objects"] = visible_objects

	response.output = str( result )
