import json
from lib import db_object
from lib import entry
from lib import errors
from modules import get as get_module

def process( app ):
	query = app.query
	obj_id = query.parms["id"]
	if not app.user.can_read( obj_id ):
		raise errors.PrivilegeError( "%d cannot read %d" % (app.user.id, obj_id) )
	obj = db_object.DBObject.create_typed_object( app=app, object_id=obj_id )
	result = {}
	if type(obj)==entry.Entry:
		if query.parms["method"] == "create_draft":
			draft = obj.create_draft()
			result = { "succeeded" : True, "draft" : get_module.get(app=app, object_ids=[draft.id], recursive=(True,True))[0] }
		else:
			raise errors.ParameterError( "Unsupported method for type" )
	elif type(obj)==entry.Draft:
		if query.parms["method"] == "publish":
			entry_id = obj.publish()
			result = { "succeeded" : True, "entry" : get_module.get(app=app, object_ids=[entry_id], recursive=(True,True))[0] }
		elif query.parms["method"] == "merge_to_parent":
			entry_id = obj.merge_to_parent()
			result = { "succeeded" : True, "entry" : get_module.get(app=app, object_ids=[entry_id], recursive=(True,True))[0] }
		else:
			raise errors.ParameterError( "Unsupported method for type" )
	else:
		raise errors.ParameterError( "Object with unsupported type" )
	app.response.output = json.dumps( result )

