import time, imp, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
from lib import publication
publication = imp.reload( publication )

def process( app ):
	query = app.query
	response = app.response
	offset = 0
	if "offset" in query.parms:
		offset = int(query.parms["offset"])
	limit = None
	if "limit" in query.parms:
		limit = int(query.parms["limit"])
	recursive = False
	if "recursive" in query.parms:
		recursive = query.parms["recursive"].lower()=="true"
	object_ids = []
	if "id" in query.parms:
		object_ids = [int(x) for x in query.parms["id"].split(",")]
	child_ids = []
	if "child_id" in query.parms:
		child_ids = [int(x) for x in query.parms["child_id"].split(",") if x]
	parent_ids = []
	if "parent_id" in query.parms:
		parent_ids = [int(x) for x in query.parms["parent_id"].split(",") if x]
	need_permissions = {"read"}
	if "permissions" in query.parms:
		need_permissions.update( query.parms["permissions"].split(",") )
	result = get( app, object_ids, child_ids=child_ids, parent_ids=parent_ids, offset=offset, limit=limit, recursive=(recursive,recursive), need_permissions=need_permissions )
	if result != None:
		if hasattr(result,"read"):
			response.output = result # Stream-lesbare File-Objekte durchreichen
		elif type(result) in (dict, list, tuple):
			response.output = json.dumps( result )
		else:
			response.output = str( result )

def get( app, object_ids=[], child_ids=[], parent_ids=[], offset=0, limit=None, recursive=(False,False), access_errors=True, need_permissions={"read"} ):
	query = app.query
	response = app.response
	session = app.session
	child_join = child_condition = ""
	if child_ids:
		in_list = [x for x in child_ids if x>=0]
		out_list = [-x for x in child_ids if x<0]
		if in_list:
			child_join = "inner join membership mp on mp.parent_id=id"
			child_condition += " and mp.child_id in %s" % ( str(tuple(in_list)).replace(",)",")") )
		if out_list:
			child_condition += " and id not in (select parent_id from membership where child_id in %s)" % ( str(tuple(out_list)).replace(",)",")") )
	parent_join = parent_condition = ""
	if parent_ids:
		in_list = [x for x in parent_ids if x>=0]
		out_list = [-x for x in parent_ids if x<0]
		if in_list:
			parent_join = "inner join membership mc on mc.child_id=id"
			parent_condition += " and mc.parent_id in %s" % ( str(tuple(in_list)).replace(",)",")") )
		if out_list:
			parent_condition += " and id not in (select child_id from membership where parent_id in %s)" % ( str(tuple(out_list)).replace(",)",")") )
	type_condition = ""
	types = []
	if "type" in query.parms and query.parms["type"]:
		type_condition = "("
		types = query.parms["type"].split(",")
		first = True
		for t in types:
			if not first:
				type_condition += " or "
			first = False
			type_condition += "type like ?"
		type_condition += ")"
	c = app.db.cursor()
	if not object_ids:
		# Wildcardsuche inklusive Zugriffsprüfung nach lesbaren Objekten:
		if types:
			c.execute( """select distinct id from objects
							%(child_join)s %(parent_join)s
							where %(type_condition)s
							%(child_condition)s %(parent_condition)s
							order by ctime desc""" % (locals()),
						types )
		else:
			c.execute( """select distinct id from objects
							%(child_join)s %(parent_join)s
							where 1=1
							%(child_condition)s %(parent_condition)s
							order by ctime desc""" % (locals()) )
		result_pos = 0
		for row in c:
			object_id = row[0]
			if not limit or len(object_ids)<limit:
				if app.user.can_read(object_id) \
				and ("write" not in need_permissions or app.user.can_write(object_id)) \
				and ("delete" not in need_permissions or app.user.can_delete(object_id)):
					result_pos += 1
					if result_pos>offset:
						object_ids.append( object_id )
			else:
				break
	else:
		filtered_object_ids = []
		# Zugriffsprüfung und ggf. Filterung für gezielte Objektanfragen:
		result_pos = 0
		for object_id in object_ids:
			if not limit or len(filtered_object_ids)<limit:
				if app.user.can_read(object_id) \
				and ("write" not in need_permissions or app.user.can_write(object_id)) \
				and ("delete" not in need_permissions or app.user.can_delete(object_id)):
					result_pos += 1
					if result_pos>offset:
						filtered_object_ids.append( object_id )
				elif access_errors:
					raise errors.PrivilegeError()
				else:
					continue # aktuelle object_id verwerfen
			else:
				break
		object_ids = filtered_object_ids
	view = "all"
	if "view" in query.parms:
		view = query.parms["view"]
	objects = []
	for object_id in object_ids:
		c.execute( """select type, mtime, ctime
						from objects where id=?""", 
					[object_id] )
		result = c.fetchone()
		if not result:
			if access_errors:
				raise errors.ParameterError( "Invalid object id: %d" % (object_id) )
			else:
				continue
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
		if app.user.can_write(object_id):
			obj["permissions"].append("write")
		if app.user.can_delete(object_id):
			obj["permissions"].append("delete")
		# Kindelemente ermitteln:
		if recursive[1]:
			c.execute( """select child_id from membership m
							inner join objects o on o.id=m.child_id
							where parent_id=?
							order by m.sequence, o.ctime desc""",
						[object_id] )
			children = []
			for row in c:
				child_id = row[0]
				children.append( child_id )
			if children:
				#                                                \/ bei Rekursion nie wieder absteigen!
				obj["children"] = get( app, children, recursive=(False,True), access_errors=False )
		# Elternelemente ermitteln:
		if recursive[0]:
			c.execute( """select parent_id from membership m
							inner join objects o on o.id=m.parent_id
							where child_id=?
							order by o.ctime desc""",
						[object_id] )
			parents = []
			for row in c:
				parent_id = row[0]
				parents.append( parent_id )
			if parents:
				#                                                   \/ bei Rekusion nie wieder aufsteigen!
				obj["parents"] = get( app, parents, recursive=(True,False), access_errors=False )
		c.execute( """select data from titles where object_id=?""", 
			[object_id] )
		result = c.fetchone()
		if result and result[0]:
			obj["title"] = result[0]
		if view in ["data", "all"]:
			if object_type == db_object.Text.media_type:
				text_obj = db_object.Text( app=app, object_id=object_id )
				data = text_obj.get_data()
				if view=="data":
					response.output += data
					response.media_type = object_type
				elif view=="all":
					obj["data"] = data
			if object_type == db_object.HTML.media_type:
				text_obj = db_object.HTML( app=app, object_id=object_id )
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
			if object_type == publication.Publication.media_type:
				pub_obj = publication.Publication( app=app, object_id=object_id )
				data = str(pub_obj.get_data())
				if view=="data":
					response.output += data
					response.media_type = object_type
				elif view=="all":
					obj["data"] = data
			if db_object.File.supports( app, object_type ):
				file_obj = db_object.File( app, object_id=object_id )
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
	

