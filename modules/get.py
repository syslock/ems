import time, imp
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )

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
		app.trace( "id in query.parms" )
		object_ids = [int(x) for x in query.parms["id"].split(",")]
		result = get( app, object_ids, limit=limit, recursive=(recursive,recursive) )
	elif "child_id" in query.parms:
		app.trace( "child_id in query.parms" )
		child_ids = [int(x) for x in query.parms["child_id"].split(",")]
		result = get( app, child_ids=child_ids, limit=limit, recursive=(recursive,recursive) )
	elif "parent_id" in query.parms:
		app.trace( "parent_id in query.parms" )
		parent_ids = [int(x) for x in query.parms["parent_id"].split(",")]
		result = get( app, parent_ids=parent_ids, limit=limit, recursive=(recursive,recursive) )
	else:
		result = get( app, limit=limit, recursive=(recursive,recursive) )
	if result != None:
		if hasattr(result,"read"):
			response.output = result # Stream-lesbare File-Objekte durchreichen
		else:
			response.output = str( result )

def get( app, object_ids=[], child_ids=[], parent_ids=[], limit=None, recursive=(False,False), access_errors=True ):
	app.trace( "get: object_ids=%s, child_ids=%s, parent_ids=%s" % (str(object_ids), str(child_ids), str(parent_ids)) )
	query = app.query
	response = app.response
	session = app.session
	if "user_id" in session.parms:
		usr = user.User( app, user_id=int(session.parms["user_id"]) )
	else:
		usr = user.get_anonymous_user( app )
	if not usr:
		raise errors.AuthenticationNeeded()
	child_join = child_condition = ""
	if child_ids:
		child_join = "inner join membership mp on mp.parent_id=id"
		child_condition = "and mp.child_id in %s" % ( str(tuple(child_ids)).replace(",)",")") )
	parent_join = parent_condition = ""
	if parent_ids:
		parent_join = "inner join membership mc on mp.child_id=id"
		parent_condition = "and mc.parent_id in %s" % ( str(tuple(parent_ids)).replace(",)",")") )
	c = app.db.cursor()
	if not object_ids:
		# Wildcardsuche nach lesbaren Objekten
		# hierfür müssen wir Zugriffsfehler abschalten, wodurch im Zweifelsfall eine leere Liste zurückgegeben wird:
		access_errors=False
		if "type" in query.parms:
			c.execute( """select id from objects
							%(child_join)s %(parent_join)s
							where type=?
							%(child_condition)s %(parent_condition)s
							order by mtime desc""" % (locals()),
						[query.parms["type"]] )
		else:
			c.execute( """select id from objects
							%(child_join)s %(parent_join)s
							where 1=1
							%(child_condition)s %(parent_condition)s
							order by mtime desc""" % (locals()) )
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
		c.execute( """select type, mtime, ctime
						from objects where id=?""", 
					[object_id] )
		result = c.fetchone()
		if not result:
			raise errors.ParameterError( "Invalid object id" )
		object_type = result[0]
		obj = {
			"id" : object_id,
			"type" : object_type,
			"mtime" : result[1],
			"ctime" : result[2],
			"permissions" : ["read"],
			"children" : [],
			"parents" : []
			}
		if usr.can_write(object_id):
			obj["permissions"].append("write")
		if usr.can_delete(object_id):
			obj["permissions"].append("delete")
		# Kindelemente ermitteln:
		if recursive[1]:
			c.execute( """select child_id from membership m
							inner join objects o on o.id=m.child_id
							where parent_id=?
							order by m.sequence, o.mtime desc""",
						[object_id] )
			children = []
			for row in c:
				child_id = row[0]
				if not limit or len(children)<limit:
					children.append( child_id )
				else:
					break
			if children:
				#                                                               \/ bei Rekursion nie wieder absteigen!
				obj["children"] = get( app, children, limit=limit, recursive=(False,True), access_errors=False )
		# Elternelemente ermitteln:
		if recursive[0]:
			c.execute( """select parent_id from membership m
							inner join objects o on o.id=m.parent_id
							where child_id=?
							order by o.mtime desc""",
						[object_id] )
			parents = []
			for row in c:
				parent_id = row[0]
				if not limit or len(parents)<limit:
					parents.append( parent_id )
				else:
					break
			if parents:
				#                                                                 \/ bei Rekusion nie wieder aufsteigen!
				obj["parents"] = get( app, parents, limit=limit, recursive=(True,False), access_errors=False )
		c.execute( """select data from titles where object_id=?""", 
			[object_id] )
		result = c.fetchone()
		if result and result[0]:
			obj["title"] = result[0]
		if view in ["data", "all"]:
			if object_type == db_object.Text.media_type:
				text_obj = db_object.Text( app=app, usr=usr, object_id=object_id )
				data = text_obj.get_data()
				if view=="data":
					response.output += data
					response.media_type = object_type
				elif view=="all":
					obj["data"] = data
			if object_type == db_object.HTML.media_type:
				text_obj = db_object.HTML( app=app, usr=usr, object_id=object_id )
				data = text_obj.get_data()
				if view=="data":
					response.output += data
					response.media_type = object_type
				elif view=="all":
					obj["data"] = data
			if object_type == user.User.media_type:
				if view=="all":
					c.execute( """select u.nick, u.avatar_id from users u 
									where u.object_id=?""", 
						[object_id] )
					result = c.fetchone()
					if not result:
						raise errors.ObjectError( "Missing object data" )
					obj["nick"] = result[0]
					obj["avatar_id"] = result[1]
			if object_type == db_object.Group.media_type:
				if view=="all":
					c.execute( """select name from groups where object_id=?""", 
						[object_id] )
					result = c.fetchone()
					if not result:
						raise errors.ObjectError( "Missing object data" )
					obj["name"] = result[0]
			if db_object.File.supports( app, object_type ):
				file_obj = db_object.File( app, usr=usr, object_id=object_id )
				if view=="data":
					# FIXME: Rückgabe mehrerer File-Objekte in Downstream-Analogon zu multipart/form-data möglich?
					return file_obj.get_data( obj, attachment=("attachment" in query.parms and True or False),
												type_override=("type" in query.parms and query.parms["type"] or None) )
				if view=="all":
					obj["size"] = file_obj.get_size()
		if view in ["meta", "all"]:
			objects.append( obj )
	if view in ["meta", "all"]:
		return objects
	

