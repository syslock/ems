import time, json
from lib import db_object
from lib import errors

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	media_type = None
	object_id = None
	if not ( "subject_id" in query.parms and "object_id" in query.parms and "mask" in query.parms ):
		raise errors.ParameterError()
	subject_id = int( query.parms["subject_id"] )
	object_id = int( query.parms["object_id"] )
	mask = int( query.parms["mask"] )
	op = "|"
	if "op" in query.parms:
		if query.parms["op"]=="and":
			op="&"
		elif query.parms["op"]=="or":
			op="|"
		else:
			raise errors.ParameterError( "Unsupported operator" )
	cleanup_zero = query.parms["cleanup_zero"].lower()=="true" if "cleanup_zero" in query.parms else False
	if not app.user.can_write(object_id):
		# We only check for object ownership, as we want to provide the possibility to
		# reject access on owned objects to other users. We have to think about shared
		# objects that should be accessible by multiple users in limited ways though.
		raise errors.PrivilegeError()
	subject = db_object.DBObject( app, subject_id )
	subject.grant_access( object_id, mask, update_operator=op, cleanup_zero=cleanup_zero )
