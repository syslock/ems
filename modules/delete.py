import time, imp
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )

def delete_in( app, usr, object_id_list ):
	object_id_list = [ int(x) for x in object_id_list ]
	for object_id in object_id_list:
		if not usr.can_delete( object_id ):
			raise errors.PrivilegeError( "%d cannot delete %d" % (user_id, object_id) )
	c = app.db.cursor()
	in_list = ",".join( [str(x) for x in object_id_list] )
	c.execute( """delete from objects where id in (%(in_list)s)""" % locals() )
	app.db.commit()
	# FIXME: Alles folgende ist eigentlich nur nötig, wenn das Backend die 
	# Foreign-Key-Constraints nicht unterstützt. Wie stellen wir das fest?
	c.execute( """delete from membership where child_id in (%(in_list)s)""" % locals() )
	c.execute( """delete from membership where parent_id in (%(in_list)s)""" % locals() )
	c.execute( """delete from users where object_id in (%(in_list)s)""" % locals() )
	c.execute( """delete from text where object_id in (%(in_list)s)""" % locals() )
	c.execute( """delete from titles where object_id in (%(in_list)s)""" % locals() )
	app.db.commit()

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	if not "user_id" in session.parms:
		raise errors.AuthenticationNeeded()
	user_id = int(session.parms["user_id"])
	usr = user.User( app, user_id )
	media_type = None
	object_id = None
	if "id" in query.parms:
		object_id_list = query.parms["id"].split(",")
		delete_in( app, usr, object_id_list )
		response.output = str( {"succeeded" : True, 
								"delete_id_list" : object_id_list} )
	elif "parent_id" in query.parms:
		parent_id = int( query.parms["parent_id"] )
		object_id_list = []
		if "child_not_in" in query.parms:
			object_id_list = query.parms["child_not_in"].split(",")
		c = app.db.cursor()
		not_in_list = ",".join( [str(x) for x in object_id_list] )
		c.execute( """select child_id from membership where parent_id=? and
						child_id not in (%(not_in_list)s)""" % locals(),
					[parent_id] )
		delete_id_list = []
		for row in c:
			delete_id_list.append( row[0] )
		delete_in( app, usr, delete_id_list )
		response.output = str( {"succeeded" : True, 
								"delete_id_list" : delete_id_list} )
	else:
		raise errors.ParameterError()

