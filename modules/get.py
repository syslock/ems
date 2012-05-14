import time, imp
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	if not "user_id" in session.parms:
		raise errors.AuthenticationNeeded()
	user_id = int( session.parms["user_id"] )
	if "id" in query.parms:
		object_id = int( query.parms["id"] )
		if not user.can_read( app, user_id, object_id ):
			raise errors.PrivilegeError()
		c = app.db.cursor()
		c.execute( """select type, read, write, sequence, mtime 
						from objects where id=?""", 
					[object_id] )
		result = c.fetchone()
		if not result:
			raise errors.ParameterError()
		object_type = result[0]
		obj = {
			"id" : object_id,
			"type" : object_type,
			"read" : result[1],
			"write" : result[2],
			"sequence" : result[3],
			"mtime" : result[4], 
			}
		if "view" in query.parms:
			view = query.parms["view"]
			if view=="meta":
				c.execute( """select child_id from membership m
								inner join objects o on o.id=m.child_id
								where parent_id=?
								order by o.sequence, o.id""",
							[object_id] )
				children = []
				for row in c:
					children.append( row[0] )
				obj["children"] = children
				c.execute( """select data from titles where object_id=?""", 
					[object_id] )
				result = c.fetchone()
				if result:
					obj["title"] = result[0]
				response.output = str( obj )
				return
			elif view=="data":
				pass
			else:
				raise NotImplementedError( "Unsupported object view" )
		if object_type == "text/plain":
			c.execute( """select data from text where object_id=?""", 
				[object_id] )
			result = c.fetchone()
			if not result:
				raise errors.ObjectError( "Missing object data" )
			data = result[0]
			response.output = data
			response.media_type = object_type
		else:
			raise NotImplementedError( "Unsupported media type" )
	else:
		raise errors.ParameterError()

