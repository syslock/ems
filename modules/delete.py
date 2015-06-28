import time, imp, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )

def delete_in( app, object_id_list, parent_id=None ):
	in_list = ",".join( [str(x) for x in object_id_list] )
	c = app.db.cursor()
	if not parent_id:
		for object_id in object_id_list:
			if not app.user.can_delete( object_id ):
				raise errors.PrivilegeError( "%d cannot delete %d" % (app.user.id, object_id) )
		c.execute( """delete from objects where id in (%(in_list)s)""" % locals() )
		app.db.commit()
		# FIXME: Alles folgende ist eigentlich nur nötig, wenn das Backend die 
		# Foreign-Key-Constraints nicht unterstützt. Wie stellen wir das fest?
		c.execute( """delete from membership where child_id in (%(in_list)s) or parent_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from users where object_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from text where object_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from titles where object_id in (%(in_list)s)""" % locals() )
		c.execute( """delete from permissions where object_id in (%(in_list)s) or subject_id in (%(in_list)s)""" % locals() )
		app.db.commit()
	else:
		for object_id in object_id_list:
			if not app.user.can_write( object_id ):
				raise errors.PrivilegeError( "%d cannot write %d" % (app.user.id, object_id) )
		if not app.user.can_write( parent_id ):
			raise errors.PrivilegeError( "%d cannot write %d" % (app.user.id, parent_id) )
		c.execute( """delete from membership where child_id in (%(in_list)s) and parent_id=?""" % locals(), [parent_id] )
		app.db.commit()

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	media_type = None
	object_id = None
	if "id" in query.parms:
		object_id_list = [int(x) for x in query.parms["id"].split(",") if x!=""]
		parent_id = "parent_id" in query.parms and int(query.parms["parent_id"]) or None
		delete_in( app, object_id_list, parent_id=parent_id )
		response.output = json.dumps( {"succeeded" : True, 
								"delete_id_list" : object_id_list} )
	elif "parent_id" in query.parms:
		parent_id = int( query.parms["parent_id"] )
		object_id_list = []
		if "child_not_in" in query.parms:
			object_id_list = [int(x) for x in query.parms["child_not_in"].split(",") if x!=""]
		c = app.db.cursor()
		not_in_list = ",".join( [str(x) for x in object_id_list] )
		c.execute( """select child_id from membership where parent_id=? and
						child_id not in (%(not_in_list)s)""" % locals(),
					[parent_id] )
		delete_id_list = []
		for row in c:
			delete_id_list.append( row[0] )
		delete_in( app, delete_id_list )
		response.output = json.dumps( {"succeeded" : True, 
								"delete_id_list" : delete_id_list} )
	else:
		raise errors.ParameterError()

