import time, imp, json
from lib import db_object
db_object = imp.reload( db_object )
from lib import errors
errors = imp.reload( errors )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	media_type = None
	object_id = None
	if "id" in query.parms:
		object_id_list = [int(x) for x in query.parms["id"].split(",") if x!=""]
		parent_id = "parent_id" in query.parms and int(query.parms["parent_id"]) or None
		db_object.DBObject.delete_in( app, object_id_list, parent_id=parent_id )
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
		db_object.DBObject.delete_in( app, delete_id_list, parent_id=parent_id )
		response.output = json.dumps( {"succeeded" : True, 
								"delete_id_list" : delete_id_list} )
	else:
		raise errors.ParameterError()

