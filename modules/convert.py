import imp, re, subprocess, os, json
from lib import user
user = imp.reload( user )
from lib import errors
errors = imp.reload( errors )
from lib import db_object
db_object = imp.reload( db_object )
# FIXME: Löschenfunktion nach DBObject ausmodularisieren:
from modules import delete as delete_module
delete_module = imp.reload( delete_module )
# FIXME: Objektbeschreibungsfunktion nach DBObject ausmodularisieren:
from modules import get as get_module
get_module = imp.reload( get_module )

def process( app ):
	query = app.query
	response = app.response
	session = app.session
	target_id = int( query.parms["id"] )
	mode = "mode" in query.parms and query.parms["mode"] or "convert"
	if app.user.can_read( target_id ):
		target_obj = db_object.File( app, object_id=target_id )
		if re.match( r"^video/.*", target_obj.media_type ):
			# Wir brauchen min. webm (Firefox, Chrome) und mp4 (Safari, IE, Chrome) für eine halbwegs gute
			# Client-Abdeckung.
			# Direkte Kindobjekte danach durchsuchen:
			result_ids = []
			search_formats = {"video/mp4","video/webm","image/jpeg"}
			for search_id in target_obj.children:
				search_obj = db_object.DBObject( app, object_id=search_id )
				if search_obj.media_type in search_formats:
					search_formats.remove( search_obj.media_type )
					result_ids.append( search_obj.id )
			error_list = []
			if mode == "convert":
				# Alle fehlende Objekte sofort ohne Daten anlegen, um Mehrfachkonvertierung zu vermeiden:
				new_objects = []
				for new_media_type in search_formats:
					# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
					app_old_user = app.user
					app.user = user.get_admin_user(app)
					new_objects.append( db_object.File(app, parent_id=target_obj.id, media_type=new_media_type) )
					app.user = app_old_user
				# Konvertierungsvorgänge für angelegte Objekte durchführen:
				for new_obj in new_objects:
					base_type, sub_type = new_obj.media_type.split("/")
					new_tmp_name = new_obj.storage_path+".tmp."+sub_type
					if( re.match(r"^video/.*", new_obj.media_type) ):
						# Konvertierung mit konservativer Breite von 480px bei Erhaltug des Seitenverhältnisses:
						# http://stackoverflow.com/questions/8218363/maintaining-ffmpeg-aspect-ratio
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", target_obj.storage_path, "-vf", "scale=480:trunc(ow/a/2)*2", 
													"-r", "25", "-b", "1000k", "-qmin", "0", "-strict", "-2", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					elif( new_obj.media_type == "image/jpeg" ):
						# Vorschaubild bei Zeitindex 3s extrahieren (TODO: Mit beliebigem Zeitindex einstellbar machen?):
						p = subprocess.Popen( ["ffmpeg", "-y", "-i", target_obj.storage_path, "-vf", "scale=480:trunc(ow/a/2)*2", 
													"-ss", "3", "-vframes", "1", new_tmp_name],
												stdout=subprocess.PIPE, stderr=subprocess.PIPE )
					stdout, stderr = p.communicate()
					if p.returncode!=0:
						try:
							# FIXME: Löschenfunktion nach DBObject ausmodularisieren und Dateibereinigung nach db_object.File:
							# Privilege-Escalation damit nicht nur der Eigentümer des Target-Objekts diesen Code ausführen kann:
							app_old_user = app.user
							app.user = user.get_admin_user(app)
							delete_module.delete_in( app, [new_obj.id] )
							app.user = app_old_user
							os.remove( new_tmp_name )
						except Exception as e:
							error_list.append( e )
						errmsg = stderr.decode().split("\n")[-1]
						error_list.append( errors.InternalProgramError(errmsg) )
					else:
						os.rename( new_tmp_name, new_obj.storage_path )
						result_ids.append( new_obj.id )
			# Fehlerbehandlung:
			if error_list:
				msg = ""
				for error in error_list:
					if msg:
						msg += "; "
					msg += str(error)
				raise errors.InternalProgramError( msg )
			else:
				response.output = json.dumps( {"succeeded": True,
										"objects": result_ids and get_module.get(app, object_ids=result_ids) or result_ids} )
		elif re.match( r"^audio/.*", target_obj.media_type ):
			raise NotImplementedError( "unsupported media type: "+target_obj.media_type )
		else:
			raise NotImplementedError( "unsupported media type: "+target_obj.media_type )
	else:
		raise errors.PrivilegeError()
