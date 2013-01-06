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
	recursive = False
	if "recursive" in query.parms:
		recursive = query.parms["recursive"].lower()=="true"
	if "id" in query.parms:
		object_ids = [int(x) for x in query.parms["id"].split(",")]
		result = get( app, object_ids, limit=limit, recursive=recursive )
	else:
		result = get( app, limit=limit, recursive=recursive )
	if result != None:
		response.output = str( result )

def get( app, object_ids=[], limit=None, recursive=False, exclude_relatives=[], access_errors=True ):
	query = app.query
	response = app.response
	session = app.session
	if "user_id" in session.parms:
		usr = user.User( app, user_id=int(session.parms["user_id"]) )
	else:
		usr = user.get_anonymous_user( app )
	if not usr:
		raise errors.AuthenticationNeeded()
	c = app.db.cursor()
	if not object_ids:
		# Wildcardsuche nach lesbaren Objekten
		# hierfür müssen wir Zugriffsfehler abschalten, wodurch im Zweifelsfall eine leere Liste zurückgegeben wird:
		access_errors=False
		if "type" in query.parms:
			c.execute( """select id, type, sequence, mtime
							from objects
							where type=?
							order by sequence, mtime desc, id""",
						[query.parms["type"]] )
		else:
			c.execute( """select id, type, sequence, mtime
							from objects
							order by sequence, mtime desc, id""" )
		for i, row in enumerate(c):
			if not limit or len(object_ids)<limit:
				object_ids.append( row[0] )
			else:
				break
	view = "all"
	if "view" in query.parms:
		view = query.parms["view"]
	objects = []
	for object_id in object_ids:
		if not usr.can_read( object_id ):
			if access_errors:
				raise errors.PrivilegeError()
			else:
				continue
		c.execute( """select type, sequence, mtime, ctime
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
			"ctime" : result[3],
			}
		# Kindelemente ermitteln:
		c.execute( """select child_id from membership m
						inner join objects o on o.id=m.child_id
						where parent_id=?
						order by o.sequence, o.mtime desc, o.id""",
					[object_id] )
		children = []
		for row in c:
			child_id = row[0]
			if not limit or len(children)<limit:
				if child_id not in exclude_relatives:
					children.append( child_id )
			else:
				break
		if children and recursive:
			obj["children"] = get( app, children, limit=limit, recursive=recursive, exclude_relatives=exclude_relatives+[object_id], access_errors=False )
		else:
			obj["children"] = children
		# Elternelemente ermitteln:
		c.execute( """select parent_id from membership m
						inner join objects o on o.id=m.parent_id
						where child_id=?
						order by o.sequence, o.mtime desc, o.id""",
					[object_id] )
		parents = []
		for row in c:
			parent_id = row[0]
			if not limit or len(parents)<limit:
				if parent_id not in exclude_relatives:
					parents.append( parent_id )
			else:
				break
		if parents and recursive:
			# Elternelemente werden nie rekursiv abgefragt, sondern nur direkt aufgelöst, 
			# um Endlosrekursion zu vermeiden:
			obj["parents"] = get( app, parents, limit=limit, recursive=False, exclude_relatives=exclude_relatives+[object_id], access_errors=False )
		else:
			obj["parents"] = parents
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
	

