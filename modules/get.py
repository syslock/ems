import time, imp
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
from iswi import profile
profile = imp.reload( profile )

def process( app ):
	query = app.query
	response = app.response
	limit = None
	if "limit" in query.parms:
		limit = int(query.parms["limit"])
	if "id" in query.parms:
		object_id = int( query.parms["id"] )
		result = get( app, [object_id], limit=limit )
	else:
		result = get( app, limit=limit )
	if result != None:
		response.output = str( result )

def get( app, object_ids=[], limit=None ):
	query = app.query
	response = app.response
	session = app.session
	if "user_id" in session.parms:
		usr = user.User( app, user_id=int(session.parms["user_id"]) )
	else:
		usr = user.get_anonymous_user( app )
	if not usr:
		raise errors.AuthenticationNeeded()
	if not object_ids:
		permissions = usr.can_read( limit=limit )
		for permission in permissions:
			object_ids.append( permission[1] )
	view = "all"
	if "view" in query.parms:
		view = query.parms["view"]
	c = app.db.cursor()
	objects = []
	for object_id in object_ids:
		if not usr.can_read( object_id ):
			raise errors.PrivilegeError()
		c.execute( """select type, sequence, mtime 
						from objects where id=?""", 
					[object_id] )
		result = c.fetchone()
		if not result:
			raise errors.ParameterError( "Invalid object id" )
		object_type = result[0]
		obj = {
			"id" : object_id,
			"type" : object_type,
			"sequence" : result[1],
			"mtime" : result[2],
			}
		recursive = False
		if "recursive" in query.parms:
			recursive = query.parms["recursive"].lower()=="true"
		c.execute( """select child_id from membership m
						inner join objects o on o.id=m.child_id
						where parent_id=?
						order by o.sequence, o.mtime desc""",
					[object_id] )
		children = []
		for i, row in enumerate(c):
			if not limit or i<limit:
				children.append( row[0] )
			else:
				break
		if children and recursive:
			obj["children"] = get( app, children, limit=limit )
		else:
			obj["children"] = children
		c.execute( """select data from titles where object_id=?""", 
			[object_id] )
		result = c.fetchone()
		if result:
			obj["title"] = result[0]
		if view in ["data", "all"]:
			if object_type == "text/plain":
				c.execute( """select data from text where object_id=?""", 
					[object_id] )
				result = c.fetchone()
				if not result:
					raise errors.ObjectError( "Missing object data" )
				data = result[0]
				if view=="data":
					response.output += str( data )
					response.media_type = object_type
				elif view=="all":
					obj["data"] = str( data )
			if object_type == user.User.media_type:
				c.execute( """select u.nick, c.object_id, a.object_id from users u 
								left join contacts c on u.object_id=c.user_id
								left join applications a on u.object_id=a.user_id
								where u.object_id=?""", 
					[object_id] )
				result = c.fetchone()
				if not result:
					raise errors.ObjectError( "Missing object data" )
				nick, contact_id, application_id = result
				if view=="all":
					obj["nick"] = str( nick )
					obj["contact_id"] = contact_id
					obj["application_id"] = application_id
			if object_type == db_object.Group.media_type:
				c.execute( """select name from groups where object_id=?""", 
					[object_id] )
				result = c.fetchone()
				if not result:
					raise errors.ObjectError( "Missing object data" )
				name = result[0]
				if view=="all":
					obj["name"] = str( name )
			if object_type == profile.Contact.media_type:
				contact = profile.Contact( app, usr=usr, object_id=object_id )
				contact.get( query, obj )
			if object_type == profile.Application.media_type:
				application = profile.Application( app, usr=usr, object_id=object_id )
				application.get( query, obj )
		if view in ["meta", "all"]:
			objects.append( obj )
	if view in ["meta", "all"]:
		return objects
	

