import time, imp, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	media_type = None
	object_id = None
	if not ( "subject_id" in query.parms and "object_id" in query.parms and "mode" in query.parms ):
		raise errors.ParameterError()
	subject_id = int( query.parms["subject_id"] )
	object_id = int( query.parms["object_id"] )
	mode = int( query.parms["mode"] )
	cleanup = query.parms["cleanup"].lower()=="true" if "cleanup" in query.parms else False
	# We only check for object ownership, as we want to provide the possibility to
	# disallow access on owned objects to other users. We have to think about shared
	# objects that should be accessible by multiple users in limited ways though.
	if not app.user.can_write(object_id):
		raise errors.PrivilegeError()
	subject = DBObject( subject_id )
	subject.grant_access( object_id, mode, cleanup_zero=cleanup )
