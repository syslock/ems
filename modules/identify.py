import re, subprocess, os, json
from lib import user
from lib import errors
from lib import db_object
from lib import files
# FIXME: Löschenfunktion nach DBObject ausmodularisieren:
from modules import delete as delete_module
# FIXME: Objektbeschreibungsfunktion nach DBObject ausmodularisieren:
from modules import get as get_module

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	target_ids = [int(x) for x in query.parms["id"].split(",")]
	object_list = get_module.get( app, object_ids=target_ids )
	metainfo_list = []
	for target_id in target_ids:
		if app.user.can_read( target_id ):
			target_obj = files.File( app, object_id=target_id )
			metainfo_list.append( target_obj.identify() )
		else:
			raise errors.PrivilegeError()
	for metainfo in metainfo_list:
		for obj in object_list:
			if obj["id"] == metainfo["id"]:
				obj.update( metainfo )
	response.output = json.dumps( {"succeeded" : True, "objects" : object_list} )
